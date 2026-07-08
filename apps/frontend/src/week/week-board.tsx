import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { Task } from '@workboard/shared';
import type { WeekDay } from './use-week-tasks';
import { DayColumn } from './day-column';

export interface WeekBoardProps {
  days: WeekDay[];
  onAdd: (day: string, title: string) => Promise<boolean>;
  /** Move a card to another day at `index` (US2). */
  onMove: (id: string, toDay: string, index: number) => void;
  /** Reorder a card within its day at `index` (US3). Omitted until US3 lands. */
  onReorder?: (id: string, index: number) => void;
  onOpenTask?: (task: Task) => void;
}

/**
 * The seven-column week board with drag-and-drop (research §3, FR-005/FR-006/FR-017). One
 * `DndContext` with pointer + keyboard sensors wraps the board; each day is a droppable
 * `SortableContext`. On drop it resolves the target day + index and calls `onMove` (day
 * changed) or `onReorder` (same day). A drop outside any column, or back in place, mutates
 * nothing (Story 2.3).
 */
export function WeekBoard({ days, onAdd, onMove, onReorder, onOpenTask }: WeekBoardProps) {
  const sensors = useSensors(
    // A small activation distance lets a plain click open a card without starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function tasksForDayExcluding(date: string, excludeId: string): Task[] {
    return days.find((d) => d.date === date)?.tasks.filter((t) => t.id !== excludeId) ?? [];
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return; // dropped outside any droppable → no change

    const activeId = String(active.id);
    const activeDay = active.data.current?.day as string | undefined;
    const overData = over.data.current;

    let targetDay: string | undefined;
    let index: number;

    if (overData?.type === 'day') {
      targetDay = overData.date as string;
      index = tasksForDayExcluding(targetDay, activeId).length; // append at the bottom
    } else {
      targetDay = overData?.day as string | undefined;
      if (!targetDay) return;
      const siblings = tasksForDayExcluding(targetDay, activeId);
      const overIndex = siblings.findIndex((t) => t.id === String(over.id));
      index = overIndex === -1 ? siblings.length : overIndex;
    }

    if (!targetDay || !activeDay) return;

    if (targetDay !== activeDay) {
      onMove(activeId, targetDay, index);
    } else if (onReorder) {
      onReorder(activeId, index);
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div
        data-testid="week-board"
        className="grid flex-1 grid-cols-1 gap-3 overflow-auto p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7"
      >
        {days.map((day) => (
          <DayColumn key={day.date} day={day} onAdd={onAdd} onOpenTask={onOpenTask} />
        ))}
      </div>
    </DndContext>
  );
}
