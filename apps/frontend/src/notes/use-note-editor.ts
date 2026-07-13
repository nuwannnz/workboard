import { useCallback, useEffect, useRef, useState } from 'react';
import type { Note } from '@workboard/shared';

/** The auto-save status machine surfaced by `save-status.tsx` (FR-006, research §6). */
export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export interface UseNoteEditorOptions {
  /** The currently selected note — its id drives which record is saved. */
  note: Note;
  /** Persist the content patch (wraps `notes-client.updateNote`), returning the server note. */
  save: (id: string, patch: { title?: string; markdown?: string }) => Promise<Note>;
  /** Called with the server note after each successful save so the list stays in sync. */
  onSaved?: (note: Note) => void;
  /** Debounce window; defaults to ~500ms (FR-005). */
  debounceMs?: number;
}

/**
 * Selected-note editing buffer + debounced auto-save (contracts §Editor & auto-save,
 * research §6). Title/content edits mark the buffer **dirty** and (re)arm a ~500ms timer; the
 * timer firing sends one `PATCH { title, markdown }` and drives `idle → dirty → saving → saved
 * | error`. Rapid edits reset the timer so a burst yields **one** save (SC-009). Edits during
 * an in-flight save are picked up by the save loop so the **latest content wins** (auto-save
 * race). A failed save moves to `error`, **keeps the unsaved buffer** (no discard), and retries
 * on the next edit or an explicit `retry()` (FR-006). Isolated from the editor + network so it
 * unit-tests with fake timers (Principle III).
 */
export function useNoteEditor({ note, save, onSaved, debounceMs = 500 }: UseNoteEditorOptions) {
  const [title, setTitleState] = useState(note.title);
  const [markdown, setMarkdownState] = useState(note.markdown);
  const [status, setStatus] = useState<SaveStatus>('idle');

  const noteIdRef = useRef(note.id);
  const bufferRef = useRef({ title: note.title, markdown: note.markdown });
  const savedRef = useRef({ title: note.title, markdown: note.markdown });
  const savingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // Switching to a different note re-seats the buffer and resets the status.
  useEffect(() => {
    if (note.id !== noteIdRef.current) {
      noteIdRef.current = note.id;
      bufferRef.current = { title: note.title, markdown: note.markdown };
      savedRef.current = { title: note.title, markdown: note.markdown };
      setTitleState(note.title);
      setMarkdownState(note.markdown);
      setStatus('idle');
      clearTimer();
    }
  }, [note.id, note.title, note.markdown]);

  const isDirty = () =>
    bufferRef.current.title !== savedRef.current.title ||
    bufferRef.current.markdown !== savedRef.current.markdown;

  /**
   * Persist until the buffer matches what we saved — the loop re-saves if edits arrived during
   * the awaited write, so the latest content always wins. On failure it stops, keeps the buffer,
   * and leaves `status = error` for a retry.
   */
  const runSave = useCallback(async () => {
    if (savingRef.current) return; // a save is already draining the buffer
    if (!isDirty()) return;
    savingRef.current = true;
    try {
      while (isDirty()) {
        const snapshot = { ...bufferRef.current };
        setStatus('saving');
        const updated = await save(noteIdRef.current, snapshot);
        savedRef.current = snapshot;
        onSaved?.(updated);
      }
      setStatus('saved');
    } catch {
      setStatus('error');
    } finally {
      savingRef.current = false;
    }
  }, [save, onSaved]);

  const scheduleSave = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void runSave();
    }, debounceMs);
  }, [runSave, debounceMs]);

  const onEdit = useCallback(() => {
    setStatus('dirty');
    scheduleSave();
  }, [scheduleSave]);

  const setTitle = useCallback(
    (value: string) => {
      bufferRef.current = { ...bufferRef.current, title: value };
      setTitleState(value);
      onEdit();
    },
    [onEdit],
  );

  const setMarkdown = useCallback(
    (value: string) => {
      bufferRef.current = { ...bufferRef.current, markdown: value };
      setMarkdownState(value);
      onEdit();
    },
    [onEdit],
  );

  /** Manual retry for the "Couldn't save — retry" affordance (FR-006). */
  const retry = useCallback(() => {
    clearTimer();
    void runSave();
  }, [runSave]);

  useEffect(() => () => clearTimer(), []);

  return { title, markdown, status, setTitle, setMarkdown, retry };
}
