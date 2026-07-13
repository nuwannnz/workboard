import type { Task } from '@workboard/shared';

/** A project's completion progress, derived from its tasks (data-model.md §Project progress). */
export interface Progress {
  total: number;
  completed: number;
  ratio: number;
  percent: number;
}

/**
 * Pure, zero-safe project progress (FR-010, client contract §Progress). `ratio` is
 * `completed / total`, guarded so an empty backlog is `0` (not a division artifact); `percent`
 * is the rounded percentage for display. Computed on the client from the already-loaded
 * backlog — never persisted, recomputed on every task change.
 */
export function progress(tasks: Task[]): Progress {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === 'completed').length;
  const ratio = total === 0 ? 0 : completed / total;
  const percent = Math.round(ratio * 100);
  return { total, completed, ratio, percent };
}
