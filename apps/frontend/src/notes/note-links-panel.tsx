import { useCallback, useState } from 'react';
import type { Note, Project, Task } from '@workboard/shared';
import { useNavigate } from 'react-router-dom';
import { InvalidLinkTargetError } from './notes-client';
import { dedup, resolve } from './note-links';
import { NoteLinkPicker } from './note-link-picker';

export interface NoteLinksPanelProps {
  note: Note;
  /** The caller's own projects & tasks, loaded once at NotesPage (see `useNoteLinkData`). */
  projects: Project[];
  tasks: Task[];
  onSave: (
    id: string,
    patch: { linkedProjectIds?: string[]; linkedTaskIds?: string[] },
  ) => Promise<Note>;
  onSaved: (note: Note) => void;
}

/**
 * A note's links panel (contracts §Linking a note, FR-009/FR-010/FR-013/FR-014). Shows the note's
 * linked projects/tasks **resolved** against the caller's own projects & tasks (stale ids omitted
 * at display time — FR-014), and lets the user add (via the picker) or remove links. The
 * projects/tasks data is loaded once at the page level and passed in (`useNoteLinkData`) so it
 * isn't re-fetched every time the selected note changes. Add/remove persist the de-duplicated
 * arrays through `onSave` (the notes update path); a `400 InvalidLinkTarget` reject surfaces a
 * clear "not available" message (US3.1).
 */
export function NoteLinksPanel({ note, projects, tasks, onSave, onSaved }: NoteLinksPanelProps) {
  const navigate = useNavigate();

  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const linkedProjects = resolve(note.linkedProjectIds, projects);
  const linkedTasks = resolve(note.linkedTaskIds, tasks);

  const persist = useCallback(
    async (patch: { linkedProjectIds?: string[]; linkedTaskIds?: string[] }) => {
      setBusy(true);
      setError(null);
      try {
        const updated = await onSave(note.id, patch);
        onSaved(updated);
      } catch (err) {
        if (err instanceof InvalidLinkTargetError) {
          setError('That project or task isn’t available.');
        } else {
          setError('Could not update links. Please try again.');
        }
      } finally {
        setBusy(false);
      }
    },
    [note.id, onSave, onSaved],
  );

  const addProject = (id: string) =>
    persist({ linkedProjectIds: dedup([...note.linkedProjectIds, id]) });
  const addTask = (id: string) => persist({ linkedTaskIds: dedup([...note.linkedTaskIds, id]) });
  const removeProject = (id: string) =>
    persist({ linkedProjectIds: note.linkedProjectIds.filter((x) => x !== id) });
  const removeTask = (id: string) =>
    persist({ linkedTaskIds: note.linkedTaskIds.filter((x) => x !== id) });

  return (
    <section aria-label="Linked projects and tasks" data-testid="note-links-panel" className="flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Links</h2>
        <button
          type="button"
          onClick={() => setPicking(true)}
          disabled={busy}
          data-testid="add-link"
          className="text-sm font-medium text-primary underline disabled:opacity-50"
        >
          Add link
        </button>
      </div>

      {error ? (
        <p role="alert" className="text-xs text-destructive" data-testid="link-error">
          {error}
        </p>
      ) : null}

      {linkedProjects.length === 0 && linkedTasks.length === 0 ? (
        <p className="text-xs text-muted-foreground">No linked projects or tasks yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {linkedProjects.map((p) => (
            <LinkChip
              key={`p-${p.id}`}
              label={p.name}
              testid="linked-project"
              onOpen={() => navigate(`/projects/${p.id}`)}
              onRemove={() => void removeProject(p.id)}
              disabled={busy}
            />
          ))}
          {linkedTasks.map((t) => (
            <LinkChip
              key={`t-${t.id}`}
              label={t.title}
              testid="linked-task"
              onRemove={() => void removeTask(t.id)}
              disabled={busy}
            />
          ))}
        </ul>
      )}

      {picking ? (
        <NoteLinkPicker
          projects={projects}
          tasks={tasks}
          selectedProjectIds={note.linkedProjectIds}
          selectedTaskIds={note.linkedTaskIds}
          onPick={(kind, id) => (kind === 'project' ? void addProject(id) : void addTask(id))}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </section>
  );
}

function LinkChip({
  label,
  testid,
  onOpen,
  onRemove,
  disabled,
}: {
  label: string;
  testid: string;
  onOpen?: () => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  return (
    <li
      data-testid={testid}
      className="flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs"
    >
      {onOpen ? (
        <button type="button" onClick={onOpen} className="max-w-[10rem] truncate hover:underline">
          {label}
        </button>
      ) : (
        <span className="max-w-[10rem] truncate">{label}</span>
      )}
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`Remove link to ${label}`}
        className="text-muted-foreground hover:text-destructive disabled:opacity-50"
      >
        ×
      </button>
    </li>
  );
}
