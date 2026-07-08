import { useEffect, useState, type FormEvent } from 'react';
import type { Task, TaskPriority, UpdateTaskInput } from '@workboard/shared';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

export interface TaskDetailDialogProps {
  task: Task;
  onClose: () => void;
  onEdit: (id: string, patch: UpdateTaskInput) => Promise<boolean>;
  onToggleComplete: (id: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high'];

/**
 * Task detail dialog (FR-009/FR-010/FR-011/FR-012, SC-008). View/edit title, description,
 * due date, priority and labels; complete/reopen; delete. Changing the due date reschedules
 * the task to the matching day. An empty title on save is rejected inline and the dialog
 * stays open with the prior value retained (Story 5.6). A lightweight modal built from the
 * shared design tokens (no extra dependency), keyboard-dismissable with Escape.
 */
export function TaskDetailDialog({
  task,
  onClose,
  onEdit,
  onToggleComplete,
  onDelete,
}: TaskDetailDialogProps) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [dueDate, setDueDate] = useState(task.dueDate ?? '');
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [labels, setLabels] = useState(task.labels.join(', '));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const completed = task.status === 'completed';

  async function save(event: FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Title is required'); // prior value retained; dialog stays open
      return;
    }
    const parsedLabels = labels
      .split(',')
      .map((l) => l.trim())
      .filter(Boolean);
    const patch: UpdateTaskInput = {
      title: trimmed,
      description,
      dueDate: dueDate || undefined,
      priority,
      labels: parsedLabels,
    };
    setBusy(true);
    const ok = await onEdit(task.id, patch);
    setBusy(false);
    if (ok) onClose();
    else setError('Could not save the changes. Please try again.');
  }

  async function toggle() {
    setBusy(true);
    await onToggleComplete(task.id);
    setBusy(false);
    onClose();
  }

  async function remove() {
    setBusy(true);
    const ok = await onDelete(task.id);
    setBusy(false);
    if (ok) onClose();
    else setError('Could not delete the task. Please try again.');
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Task details"
        data-testid="task-detail-dialog"
        className="w-full max-w-md rounded-lg border border-border bg-background p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={save} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="task-title" className="text-sm font-medium">
              Title
            </label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (error) setError(null);
              }}
              data-testid="detail-title"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="task-description" className="text-sm font-medium">
              Description
            </label>
            <textarea
              id="task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              data-testid="detail-description"
              className="rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="task-due" className="text-sm font-medium">
                Due date
              </label>
              <Input
                id="task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                data-testid="detail-duedate"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="task-priority" className="text-sm font-medium">
                Priority
              </label>
              <select
                id="task-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                data-testid="detail-priority"
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="task-labels" className="text-sm font-medium">
              Labels
            </label>
            <Input
              id="task-labels"
              value={labels}
              onChange={(e) => setLabels(e.target.value)}
              placeholder="comma, separated"
              data-testid="detail-labels"
            />
          </div>

          {error ? (
            <span role="alert" className="text-xs text-destructive">
              {error}
            </span>
          ) : null}

          <div className="mt-1 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={remove}
              disabled={busy}
              data-testid="detail-delete"
              className="text-destructive hover:text-destructive"
            >
              Delete
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={toggle}
                disabled={busy}
                data-testid="detail-toggle-complete"
              >
                {completed ? 'Reopen' : 'Complete'}
              </Button>
              <Button type="submit" disabled={busy} data-testid="detail-save">
                Save
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
