import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Task } from '@workboard/shared';
import { cn } from '../lib/utils';

export interface TaskCardProps {
  task: Task;
  /** Open the detail dialog (US5). Optional so earlier stories render a static card. */
  onOpen?: (task: Task) => void;
}

/**
 * A single, draggable task card (FR-001, FR-006, FR-017). It is a `@dnd-kit` sortable item
 * (pointer + keyboard) so it can be reordered within its day or moved across days; a plain
 * click (no drag) opens the detail dialog (US5). Long titles wrap without breaking the
 * column; completed tasks stay visible in a distinct muted / strikethrough style (FR-011).
 */
export function TaskCard({ task, onOpen }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'task', day: task.dueDate },
  });
  const completed = task.status === 'completed';

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={onOpen ? () => onOpen(task) : undefined}
      data-testid={`task-card-${task.id}`}
      className={cn(
        'touch-none rounded-md border border-border bg-background p-2 text-left text-sm shadow-sm',
        'cursor-grab focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        onOpen && 'hover:bg-accent',
        completed && 'text-muted-foreground line-through',
        isDragging && 'opacity-50',
      )}
    >
      <span className="block break-words">{task.title}</span>
    </div>
  );
}
