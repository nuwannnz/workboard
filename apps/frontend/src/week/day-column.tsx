import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Task } from '@workboard/shared';
import type { ProjectRef, WeekDay } from './use-week-tasks';
import { TaskCard } from './task-card';
import { AddTaskInline } from './add-task-inline';
import { cn } from '../lib/utils';

/** Droppable id for a day column (distinguishes column drops from card drops). */
export function dayDroppableId(date: string): string {
  return `day:${date}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Short weekday + day-of-month for a `YYYY-MM-DD` date, computed in UTC. */
function heading(date: string): { weekday: string; dayOfMonth: number } {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return { weekday: WEEKDAYS[dt.getUTCDay()], dayOfMonth: d };
}

export interface DayColumnProps {
  day: WeekDay;
  onAdd: (day: string, title: string) => Promise<boolean>;
  onOpenTask?: (task: Task) => void;
  /** `projectId → { name, color }` so scheduled project tasks render their badge (FR-012). */
  projectsById?: Record<string, ProjectRef>;
}

/**
 * One day column (FR-001, FR-017): a header (weekday + date, with today distinguished), the
 * day's task cards scrolling within the column, an empty state when there are none, and the
 * bottom inline add.
 */
export function DayColumn({ day, onAdd, onOpenTask, projectsById }: DayColumnProps) {
  const { weekday, dayOfMonth } = heading(day.date);
  // The whole column (incl. empty space below cards) is a drop target so a card can land in
  // an empty day or below the last card.
  const { setNodeRef, isOver } = useDroppable({
    id: dayDroppableId(day.date),
    data: { type: 'day', date: day.date },
  });

  return (
    <section
      aria-label={`${weekday} ${dayOfMonth}`}
      data-testid={`day-column-${day.date}`}
      className={cn(
        'flex min-h-0 flex-col rounded-lg border border-border bg-muted/40 p-2',
        day.isToday && 'border-primary ring-1 ring-primary',
        isOver && 'ring-2 ring-primary/60',
      )}
    >
      <header className="mb-2 flex items-baseline justify-between px-1">
        <span className="text-sm font-semibold">{weekday}</span>
        <span
          className={cn(
            'text-sm text-muted-foreground',
            day.isToday && 'font-semibold text-primary',
          )}
        >
          {dayOfMonth}
          {day.isToday ? <span className="sr-only"> (today)</span> : null}
        </span>
      </header>

      <div ref={setNodeRef} className="flex min-h-[3rem] flex-1 flex-col gap-2 overflow-y-auto">
        <SortableContext items={day.tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {day.tasks.length === 0 ? (
            <p className="px-1 py-2 text-xs text-muted-foreground">No tasks</p>
          ) : (
            day.tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onOpen={onOpenTask}
                project={task.projectId ? projectsById?.[task.projectId] : undefined}
              />
            ))
          )}
        </SortableContext>
      </div>

      <AddTaskInline day={day.date} onAdd={onAdd} />
    </section>
  );
}
