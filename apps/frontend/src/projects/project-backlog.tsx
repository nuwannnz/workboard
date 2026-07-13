import { useState, type FormEvent } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { Task } from '@workboard/shared';
import { Input } from '../components/ui/input';
import { TaskCard } from '../week/task-card';

export interface ProjectBacklogProps {
  backlog: Task[];
  onAdd: (title: string) => Promise<boolean>;
  onOpenTask: (task: Task) => void;
  /** Reorder a backlog task to `index` among the others (US5). */
  onReorder: (id: string, index: number) => void;
}

/**
 * A project's task backlog (US2 + US5). Renders the tasks as reused Stage 3 `task-card`s in a
 * `@dnd-kit` sortable list (drag to reorder — FR-009), an inline add-task at the bottom (title
 * only, no due date), and opens a task in the reused `task-detail-dialog` (wired by the detail
 * page). Completed tasks stay visible in the card's distinct completed style (FR-007).
 */
export function ProjectBacklog({ backlog, onAdd, onOpenTask, onReorder }: ProjectBacklogProps) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const sensors = useSensors(
    // A small activation distance lets a plain click open a card without starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const others = backlog.filter((t) => t.id !== String(active.id));
    const overIndex = others.findIndex((t) => t.id === String(over.id));
    if (overIndex === -1) return;
    onReorder(String(active.id), overIndex);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Title is required');
      return;
    }
    setSubmitting(true);
    const ok = await onAdd(trimmed);
    setSubmitting(false);
    if (ok) {
      setTitle('');
      setError(null);
    } else {
      setError('Could not save the task. Please try again.');
    }
  }

  return (
    <div className="flex flex-col gap-2" data-testid="project-backlog">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={backlog.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {backlog.length === 0 ? (
              <p className="px-1 py-2 text-sm text-muted-foreground">No tasks yet.</p>
            ) : (
              backlog.map((task) => <TaskCard key={task.id} task={task} onOpen={onOpenTask} />)
            )}
          </div>
        </SortableContext>
      </DndContext>

      <form onSubmit={submit} className="mt-2">
        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (error) setError(null);
          }}
          disabled={submitting}
          placeholder="Add a task"
          aria-label="Add a backlog task"
          data-testid="add-backlog-input"
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
    </div>
  );
}
