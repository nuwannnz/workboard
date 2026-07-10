import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Note } from '@workboard/shared';
import { useAuth } from '../auth/use-auth';
import { createNotesClient } from './notes-client';

export type LoadStatus = 'loading' | 'ready' | 'error';

/** Recency order: `updatedAt` descending (most-recent first), `id` as a stable tiebreak. */
function byRecency(a: Note, b: Note): number {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

let tempCounter = 0;
function nextTempId(): string {
  tempCounter += 1;
  return `temp-${Date.now()}-${tempCounter}`;
}

/**
 * Notes list data hook (contracts/notes-client-contract.md §Master-detail surface). Loads the
 * owner's notes on mount, exposes them recency-sorted, tracks the selected note, and provides
 * optimistic mutations with snapshot rollback so a note is never shown as saved when the write
 * failed (FR-006/FR-018). US1 ships load + create + select; US5 layers delete + rename onto the
 * same state. Content auto-save lives in `use-note-editor`, not here.
 */
export function useNotes() {
  const { apiClient } = useAuth();
  const client = useMemo(() => createNotesClient(apiClient), [apiClient]);

  const [notes, setNotes] = useState<Note[]>([]);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadTokenRef = useRef(0);
  const mutationRef = useRef(0);

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
   * Optimistically create an empty note prepended to the top of the list and immediately
   * selected (auto-save-first, FR-002). On success the temp note is swapped for the server
   * note (keeping the selection); on failure it is removed and an error surfaced. Returns the
   * created note, or `null` on failure.
   */
  const createNote = useCallback(async (): Promise<Note | null> => {
    const tempId = nextTempId();
    const now = new Date().toISOString();
    const optimistic: Note = {
      id: tempId,
      title: '',
      markdown: '',
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
      setNotes((prev) => prev.map((n) => (n.id === tempId ? created : n)));
      setSelectedId((cur) => (cur === tempId ? created.id : cur));
      return created;
    } catch {
      setNotes((prev) => prev.filter((n) => n.id !== tempId));
      setSelectedId((cur) => (cur === tempId ? null : cur));
      setError('Could not create the note. Please try again.');
      return null;
    }
  }, [client]);

  /**
   * Merge a server note back into the list (e.g. after an auto-save from the editor) so the
   * master list's title/recency stays in sync without a reload.
   */
  const applyServerNote = useCallback((note: Note) => {
    setNotes((prev) => prev.map((n) => (n.id === note.id ? note : n)));
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
        setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
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
    createNote,
    applyServerNote,
    updateNote,
    rename,
    deleteNote,
  };
}
