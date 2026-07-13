import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { cn } from '../lib/utils';
import { Button } from '../components/ui/button';
import { useNotes } from './use-notes';
import { NotesList } from './notes-list';
import { NoteEditor } from './note-editor';

/**
 * Notes master-detail shell (contracts/notes-client-contract.md §Master-detail surface). Two
 * panes — the notes list (master) and the note editor (detail) — with selection driven by the
 * route param `:id` (deep-linkable; this is how "open a linked note" works). No `:id` selects
 * the most-recent note, or shows the empty state when the user has no notes. On small viewports
 * the panes collapse: the list shows until a note is selected, then the editor with a back
 * affordance (FR-019). One shared codebase for PWA + Tauri (Principle II).
 */
export function NotesPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    notes,
    loadStatus,
    error,
    reload,
    selectedId,
    select,
    createNote,
    applyServerNote,
    updateNote,
    deleteNote,
  } = useNotes();

  // Route param is the source of truth for selection; fall back to the most-recent note.
  useEffect(() => {
    if (id) {
      select(id);
    } else if (loadStatus === 'ready' && notes.length > 0) {
      navigate(`/notes/${notes[0].id}`, { replace: true });
    } else {
      select(null);
    }
  }, [id, loadStatus, notes, navigate, select]);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const activeId = id ?? selectedId;
  const selected = notes.find((n) => n.id === activeId);

  async function handleCreate() {
    const created = await createNote();
    if (created) navigate(`/notes/${created.id}`);
  }

  function handleDelete(nid: string) {
    setConfirmDeleteId(nid);
  }

  async function confirmDelete() {
    if (!confirmDeleteId) return;
    setDeleting(true);
    const ok = await deleteNote(confirmDeleteId);
    setDeleting(false);
    setConfirmDeleteId(null);
    // Re-resolve selection from the route (most-recent remaining note or the empty state).
    if (ok) navigate('/notes', { replace: true });
  }

  if (loadStatus === 'error') {
    return (
      <section aria-label="Notes" className="flex min-h-0 flex-1 flex-col">
        <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
          <p className="text-sm text-muted-foreground">Could not load your notes.</p>
          <button
            type="button"
            onClick={() => void reload()}
            className="text-sm font-medium text-primary underline"
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  const showEditorOnMobile = Boolean(activeId);

  return (
    <section aria-label="Notes" className="flex min-h-0 flex-1 flex-col">
      {error ? (
        <p
          role="alert"
          className="border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {/* Master pane — fixed width on desktop, hidden on mobile once a note is open. */}
        <div
          className={cn(
            'min-h-0 w-full shrink-0 md:w-72',
            showEditorOnMobile ? 'hidden md:flex md:flex-col' : 'flex flex-col',
          )}
        >
          <NotesList
            notes={notes}
            selectedId={activeId ?? null}
            onSelect={(nid) => navigate(`/notes/${nid}`)}
            onCreate={handleCreate}
          />
        </div>

        {/* Detail pane — fills remaining width; hidden on mobile until a note is open. */}
        <div className={cn('min-h-0 min-w-0 flex-1 flex-col', showEditorOnMobile ? 'flex' : 'hidden md:flex')}>
          {activeId ? (
            <button
              type="button"
              onClick={() => navigate('/notes')}
              className="self-start px-4 pt-3 text-sm text-muted-foreground underline md:hidden"
            >
              ← Notes
            </button>
          ) : null}
          {loadStatus === 'ready' && notes.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-muted-foreground">
                No notes yet. Create your first note to get started.
              </p>
              <Button type="button" onClick={handleCreate}>
                New note
              </Button>
            </div>
          ) : (
            <NoteEditor
              note={selected}
              onSave={updateNote}
              onSaved={applyServerNote}
              onDelete={selected ? (nid) => void handleDelete(nid) : undefined}
            />
          )}
        </div>
      </div>

      {confirmDeleteId ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setConfirmDeleteId(null)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="Delete note"
            data-testid="delete-note-dialog"
            className="w-full max-w-sm rounded-lg border border-border bg-background p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2 text-lg font-semibold">Delete note</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              This note will be removed. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmDeleteId(null)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={deleting}
                data-testid="confirm-delete-note"
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => void confirmDelete()}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default NotesPage;
