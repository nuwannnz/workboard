import { useState } from 'react';
import type { Task } from '@workboard/shared';
import { useWeekTasks } from './use-week-tasks';
import { WeekBoard } from './week-board';
import { WeekNav } from './week-nav';
import { TaskDetailDialog } from './task-detail-dialog';

/**
 * Week feature container (contracts/tasks-client-contract.md). Owns the week data hook and
 * renders the board (seven day-columns with inline add). Loading and load-failure states are
 * surfaced so the board never silently shows stale/empty data as if saved (FR-016). Week
 * navigation (US4) and the task-detail dialog (US5) are layered on in their phases.
 */
export function WeekPage() {
  const {
    referenceMonday,
    days,
    loadStatus,
    error,
    addTask,
    moveTask,
    reorderTask,
    editTask,
    toggleComplete,
    deleteTask,
    reload,
    goToPrevWeek,
    goToNextWeek,
    goToCurrentWeek,
  } = useWeekTasks();

  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  // Resolve against live state so the dialog reflects optimistic edits (and closes if the
  // task disappears, e.g. after delete).
  const openTask: Task | undefined = days
    .flatMap((d) => d.tasks)
    .find((t) => t.id === openTaskId);

  return (
    <section aria-label="Week board" className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h1 className="text-lg font-semibold">Week</h1>
        <WeekNav
          referenceMonday={referenceMonday}
          onPrev={goToPrevWeek}
          onNext={goToNextWeek}
          onCurrent={goToCurrentWeek}
        />
      </header>

      {loadStatus === 'error' ? (
        <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
          <p className="text-sm text-muted-foreground">Could not load this week.</p>
          <button
            type="button"
            onClick={() => void reload()}
            className="text-sm font-medium text-primary underline"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          {error ? (
            <p role="alert" className="border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <WeekBoard
            days={days}
            onAdd={addTask}
            onMove={(id, toDay, index) => void moveTask(id, toDay, index)}
            onReorder={(id, index) => void reorderTask(id, index)}
            onOpenTask={(task) => setOpenTaskId(task.id)}
          />
        </>
      )}

      {openTask ? (
        <TaskDetailDialog
          task={openTask}
          onClose={() => setOpenTaskId(null)}
          onEdit={editTask}
          onToggleComplete={toggleComplete}
          onDelete={deleteTask}
        />
      ) : null}
    </section>
  );
}

export default WeekPage;
