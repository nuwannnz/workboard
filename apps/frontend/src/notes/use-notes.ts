import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Note, NoteMetadata } from '@workboard/shared';
import { useAuth } from '../auth/use-auth';
import { createNotesClient } from './notes-client';

export type LoadStatus = 'loading' | 'ready' | 'error';
/** Detail-fetch status for the selected note's body (`GET /notes/:id`). */
export type BodyStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Recency order: `updatedAt` descending (most-recent first), `id` as a stable tiebreak. */
function byRecency(a: NoteMetadata, b: NoteMetadata): number {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Drop the body so the master list only ever holds metadata (FR-007, US4). */
function toMetadata(note: Note): NoteMetadata {
  const { markdown: _markdown, ...meta } = note;
  return meta;
}

let tempCounter = 0;
function nextTempId(): string {
  tempCounter += 1;
  return `temp-${Date.now()}-${tempCounter}`;
}

/**
 * Notes list data hook (contracts/notes-client-contract.md §Master-detail surface). Loads the
 * owner's notes as **metadata only** (bodies live in S3 — FR-007), exposes them recency-sorted,
 * tracks the selected note, and fetches that note's full body on demand via `getNote(id)` (the
 * new `GET /notes/:id`). Optimistic create/rename/delete operate on metadata with snapshot
 * rollback so a note is never shown as saved when the write failed (FR-006/FR-018). Content
 * auto-save lives in `use-note-editor`, not here.
 */
export function useNotes() {
  const { apiClient } = useAuth();
  const client = useMemo(() => createNotesClient(apiClient), [apiClient]);

  const [notes, setNotes] = useState<NoteMetadata[]>([]);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // The full body-bearing note for the current selection, fetched on demand.
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [bodyStatus, setBodyStatus] = useState<BodyStatus>('idle');

  const loadTokenRef = useRef(0);
  const mutationRef = useRef(0);
  const detailTokenRef = useRef(0);

  const load = useCallback(async () => {
    const token = ++loadTokenRef.current;
    const mutationAtStart = mutationRef.current;
    setLoadStatus('loading');
    try {
      const loaded = await client.listNotes();
      if (token !== loadTokenRef.current) return; // superseded
      if (mutationRef.current !== mutationAtStart) {
        setLoadStatus('ready');
        return;
      }
      setNotes([...loaded].sort(byRecency));
      setLoadStatus('ready');
    } catch {
      if (token !== loadTokenRef.current) return;
      setLoadStatus('error');
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(() => [...notes].sort(byRecency), [notes]);

  const select = useCallback((id: string | null) => setSelectedId(id), []);

  /**
   * Fetch the selected note's full body on selection. Skips optimistic temp ids (the note isn't
   * on the server yet — its full note is seeded directly by `createNote`) and skips a note whose
   * full body we already hold (e.g. just created). Superseded fetches are ignored via a token so
   * a rapid selection switch always resolves to the latest note (FR-012 handled server-side).
   */
  const fetchSelected = useCallback(
    (id: string) => {
      const token = ++detailTokenRef.current;
      setBodyStatus('loading');
      client
        .getNote(id)
        .then((note) => {
          if (token !== detailTokenRef.current) return;
          setSelectedNote(note);
          setBodyStatus('ready');
        })
        .catch(() => {
          if (token !== detailTokenRef.current) return;
          setBodyStatus('error');
        });
    },
    [client],
  );

  useEffect(() => {
    if (!selectedId || selectedId.startsWith('temp-')) {
      detailTokenRef.current += 1; // cancel any in-flight fetch
      setSelectedNote(null);
      setBodyStatus('idle');
      return;
    }
    if (selectedNote?.id === selectedId) {
      setBodyStatus('ready'); // already loaded (e.g. freshly created / re-selected)
      return;
    }
    fetchSelected(selectedId);
  }, [selectedId, selectedNote, fetchSelected]);

  /** Manual retry for the body-load error affordance. */
  const reloadSelectedNote = useCallback(() => {
    if (selectedId && !selectedId.startsWith('temp-')) fetchSelected(selectedId);
  }, [selectedId, fetchSelected]);

  /**
   * Optimistically create an empty note (metadata) prepended to the top of the list and
   * immediately selected (auto-save-first, FR-002). On success the temp note is swapped for the
   * server note (keeping the selection) and its full body seeded so no extra fetch is needed; on
   * failure it is removed and an error surfaced. Returns the created note, or `null` on failure.
   */
  const createNote = useCallback(async (): Promise<Note | null> => {
    const tempId = nextTempId();
    const now = new Date().toISOString();
    const optimistic: NoteMetadata = {
      id: tempId,
      title: '',
      bodyKey: '',
      linkedProjectIds: [],
      linkedTaskIds: [],
      createdAt: now,
      updatedAt: now,
    };
    mutationRef.current += 1;
    setError(null);
    setNotes((prev) => [optimistic, ...prev]);
    setSelectedId(tempId);

    try {
      const created = await client.createNote();
      setNotes((prev) => prev.map((n) => (n.id === tempId ? toMetadata(created) : n)));
      setSelectedId((cur) => (cur === tempId ? created.id : cur));
      // Seed the full note so selecting it doesn't trigger a redundant GET /notes/:id.
      setSelectedNote(created);
      setBodyStatus('ready');
      return created;
    } catch {
      setNotes((prev) => prev.filter((n) => n.id !== tempId));
      setSelectedId((cur) => (cur === tempId ? null : cur));
      setError('Could not create the note. Please try again.');
      return null;
    }
  }, [client]);

  /**
   * Merge a server note back into the list (metadata) after an auto-save from the editor so the
   * master list's title/recency stays in sync without a reload, and refresh the held full note.
   */
  const applyServerNote = useCallback((note: Note) => {
    setNotes((prev) => prev.map((n) => (n.id === note.id ? toMetadata(note) : n)));
    setSelectedNote((cur) => (cur && cur.id === note.id ? note : cur));
  }, []);

  /**
   * Persist a partial update to a note (content auto-save from the editor, or a link change) and
   * return the server note. The caller applies it to the list via `applyServerNote`. A link
   * rejection rejects distinctly (`InvalidLinkTargetError`) so the link UI can react (US3).
   */
  const updateNote = useCallback(
    (id: string, patch: Parameters<typeof client.updateNote>[1]) => client.updateNote(id, patch),
    [client],
  );

  /**
   * Optimistically rename a note (an `updateNote { title }`), updating the list immediately and
   * reverting to the snapshot on failure (FR-015/FR-018).
   */
  const rename = useCallback(
    async (id: string, title: string): Promise<boolean> => {
      const snapshot = notes;
      const now = new Date().toISOString();
      mutationRef.current += 1;
      setError(null);
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, title, updatedAt: now } : n)));
      try {
        const updated = await client.updateNote(id, { title });
        setNotes((prev) => prev.map((n) => (n.id === id ? toMetadata(updated) : n)));
        return true;
      } catch {
        setNotes(snapshot);
        setError('Could not rename the note. Please try again.');
        return false;
      }
    },
    [client, notes],
  );

  /**
   * Optimistically delete a note (removing it immediately); on failure it is reinstated and an
   * error surfaced (FR-017/FR-018). If the deleted note was selected, selection moves to the
   * next most-recent note or clears to the empty state.
   */
  const deleteNote = useCallback(
    async (id: string): Promise<boolean> => {
      const snapshot = notes;
      mutationRef.current += 1;
      setError(null);
      const remaining = snapshot.filter((n) => n.id !== id).sort(byRecency);
      setNotes(remaining);
      setSelectedId((cur) => (cur === id ? (remaining[0]?.id ?? null) : cur));
      try {
        await client.deleteNote(id);
        return true;
      } catch {
        setNotes(snapshot);
        setError('Could not delete the note. Please try again.');
        return false;
      }
    },
    [client, notes],
  );

  return {
    notes: sorted,
    loadStatus,
    error,
    reload: load,
    selectedId,
    select,
    selectedNote,
    bodyStatus,
    reloadSelectedNote,
    createNote,
    applyServerNote,
    updateNote,
    rename,
    deleteNote,
  };
}
