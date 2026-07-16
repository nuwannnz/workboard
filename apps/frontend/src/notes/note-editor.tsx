import type { Note, Project, Task } from '@workboard/shared';
import { MarkdownEditor } from './markdown-editor';
import { SaveStatus } from './save-status';
import { NoteLinksPanel } from './note-links-panel';
import { useNoteEditor } from './use-note-editor';

export interface NoteEditorProps {
  note: Note | undefined;
  /** The caller's own projects & tasks (loaded once at NotesPage) for the links panel. */
  projects: Project[];
  tasks: Task[];
  /** Persist a content or link patch for the note (wraps `notes-client.updateNote`). */
  onSave: (
    id: string,
    patch: { title?: string; markdown?: string; linkedProjectIds?: string[]; linkedTaskIds?: string[] },
  ) => Promise<Note>;
  /** Sync the saved server note back into the master list. */
  onSaved: (note: Note) => void;
  /** Delete the note (US5) — rendered as a warned control when provided. */
  onDelete?: (id: string) => void;
}

/**
 * Note detail pane (contracts §Editor & auto-save) — an **immersive**, full-height writing
 * surface (no text-box chrome): a large borderless title, a WYSIWYG Markdown body that fills the
 * pane, and a subtle auto-save status. Content auto-saves ~500ms after a pause
 * (FR-004/FR-005/FR-006). The title field doubles as rename (US5); the links panel (US3) sits
 * below the body. Shows a defined "no note selected" state when nothing is open.
 */
export function NoteEditor({ note, projects, tasks, onSave, onSaved, onDelete }: NoteEditorProps) {
  if (!note) {
    return (
      <div
        className="flex flex-1 items-center justify-center p-6 text-center"
        data-testid="note-editor-empty"
      >
        <p className="text-sm text-muted-foreground">Select a note, or create a new one.</p>
      </div>
    );
  }
  // Keyed on the note id so the editing buffer re-seats cleanly when the selection changes.
  return (
    <NoteEditorForm
      key={note.id}
      note={note}
      projects={projects}
      tasks={tasks}
      onSave={onSave}
      onSaved={onSaved}
      onDelete={onDelete}
    />
  );
}

function NoteEditorForm({
  note,
  projects,
  tasks,
  onSave,
  onSaved,
  onDelete,
}: NoteEditorProps & { note: Note }) {
  const { title, markdown, status, setTitle, setMarkdown, retry } = useNoteEditor({
    note,
    save: onSave,
    onSaved,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-testid="note-editor">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-8 md:px-10">
        {/* Subtle status bar — no borders, right-aligned. */}
        <div className="mb-4 flex items-center justify-end gap-4">
          <SaveStatus status={status} onRetry={retry} />
          {onDelete ? (
            <button
              type="button"
              onClick={() => onDelete(note.id)}
              data-testid="delete-note"
              className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
            >
              Delete
            </button>
          ) : null}
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled"
          aria-label="Note title"
          data-testid="note-title"
          className="w-full border-0 bg-transparent p-0 text-3xl font-bold leading-tight text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
        />

        <div className="mt-6 flex min-h-[40vh] flex-1 flex-col">
          <MarkdownEditor value={markdown} onChange={setMarkdown} placeholder="Start writing…" />
        </div>

        <div className="mt-6">
          <NoteLinksPanel
            note={note}
            projects={projects}
            tasks={tasks}
            onSave={onSave}
            onSaved={onSaved}
          />
        </div>
      </div>
    </div>
  );
}
