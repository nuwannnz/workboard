import { useState, type FormEvent } from 'react';
import { Input } from '../components/ui/input';

export interface AddTaskInlineProps {
  day: string;
  onAdd: (day: string, title: string) => Promise<boolean>;
}

/**
 * Bottom-of-day inline add control (FR-003, FR-004). Enforces a non-empty title client-side
 * with a "title required" message, then delegates to the optimistic `addTask`. Clears on
 * success; surfaces a failure message if the save is rejected (FR-016).
 */
export function AddTaskInline({ day, onAdd }: AddTaskInlineProps) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Title is required');
      return;
    }
    setSubmitting(true);
    const ok = await onAdd(day, trimmed);
    setSubmitting(false);
    if (ok) {
      setTitle('');
      setError(null);
    } else {
      setError('Could not save the task. Please try again.');
    }
  }

  return (
    <form onSubmit={submit} className="mt-2">
      <Input
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          if (error) setError(null);
        }}
        disabled={submitting}
        placeholder="Add a task"
        aria-label={`Add a task on ${day}`}
        data-testid={`add-task-input-${day}`}
      />
      {error ? (
        <span role="alert" className="mt-1 block text-xs text-destructive">
          {error}
        </span>
      ) : null}
      <button type="submit" className="sr-only">
        Add task
      </button>
    </form>
  );
}
