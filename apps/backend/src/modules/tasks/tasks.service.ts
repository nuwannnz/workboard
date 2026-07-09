import { ulid } from 'ulid';
import type { CreateTaskInput, Task, UpdateTaskInput } from '@workboard/shared';
import { TasksRepository } from './tasks.repository';

/** Sorted base-62 digits — an `order` string sorts lexicographically in this alphabet. */
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = DIGITS.length;
const MID = DIGITS[Math.floor(BASE / 2)];

/**
 * Fractional-index **append**: a rank strictly after `last` (research §4). Bumps the
 * rightmost non-maximal digit (keeping keys short) and only extends when every digit is
 * maxed. An empty day gets a base mid rank. The client computes `between` ranks for
 * reorder/move; the server only ever appends on create, so this is all it needs.
 */
export function appendOrder(last?: string): string {
  if (!last) return MID;
  const chars = last.split('');
  for (let i = chars.length - 1; i >= 0; i--) {
    const v = DIGITS.indexOf(chars[i]);
    if (v < BASE - 1) return chars.slice(0, i).join('') + DIGITS[v + 1];
  }
  return last + MID;
}

/**
 * Task orchestration (Principle I): id/timestamp/order generation and week grouping sit
 * here; persistence + ownership live in the repository; validation + HTTP live in the
 * controller. The resolved `userId` is always passed in — never derived from caller input.
 */
export class TasksService {
  constructor(private readonly repo: TasksRepository = new TasksRepository()) {}

  /**
   * Create a task appended to the bottom of its **relevant grouping** (contracts POST,
   * data-model.md Create-ordering rule):
   * - `dueDate` present → append after that **day's** tasks (Stage 3 rule; also for a
   *   scheduled project task, since the board is where a fresh rank matters).
   * - no `dueDate` but a `projectId` → append after that **project's** tasks (backlog).
   * `dueDate` is `null` for a backlog-only task; `projectId` is settable (else `null`).
   */
  async createTask(userId: string, input: CreateTaskInput): Promise<Task> {
    const dueDate = input.dueDate ?? null;
    const projectId = input.projectId ?? null;

    let siblings: Task[];
    if (dueDate !== null) {
      siblings = await this.repo.queryWindow(userId, dueDate, dueDate);
    } else if (projectId !== null) {
      siblings = await this.repo.queryByProject(userId, projectId);
    } else {
      siblings = [];
    }
    const lastOrder = siblings
      .map((t) => t.order)
      .sort()
      .at(-1);

    const now = new Date().toISOString();
    const task: Task = {
      id: ulid(),
      title: input.title,
      ...(input.description !== undefined ? { description: input.description } : {}),
      dueDate,
      status: 'open',
      priority: input.priority ?? 'medium',
      labels: input.labels ?? [],
      order: appendOrder(lastOrder),
      projectId,
      linkedNoteIds: [],
      createdAt: now,
      updatedAt: now,
    };
    return this.repo.put(userId, task);
  }

  /** List the owner's tasks for a displayed week window (contracts GET). */
  async listWeek(userId: string, from: string, to: string): Promise<Task[]> {
    return this.repo.queryWindow(userId, from, to);
  }

  /** List all of the owner's tasks in a project (backlog + scheduled), sorted (contracts GET). */
  async listByProject(userId: string, projectId: string): Promise<Task[]> {
    const tasks = await this.repo.queryByProject(userId, projectId);
    return tasks.sort((a, b) => {
      if (a.order !== b.order) return a.order < b.order ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }

  /**
   * Partial update serving edit / move / reorder / complete-reopen (contracts PATCH). Bumps
   * `updatedAt`; returns the full task, or `null` for a foreign/missing id (not-found).
   */
  async updateTask(userId: string, id: string, patch: UpdateTaskInput): Promise<Task | null> {
    return this.repo.update(userId, id, { ...patch, updatedAt: new Date().toISOString() });
  }

  /** Delete a task; `true` if it existed in the owner's partition, else `false`. */
  async deleteTask(userId: string, id: string): Promise<boolean> {
    return this.repo.delete(userId, id);
  }

  /**
   * Delete all of the owner's tasks bound to `projectId` (backlog + scheduled) — the
   * project-delete cascade target (research §5, US5). Queries the project's tasks then deletes
   * them; scoped to `userId` and idempotent (deleting an already-gone id is a no-op). Returns
   * the number of tasks deleted.
   */
  async deleteByProject(userId: string, projectId: string): Promise<number> {
    const tasks = await this.repo.queryByProject(userId, projectId);
    const results = await Promise.all(tasks.map((t) => this.repo.delete(userId, t.id)));
    return results.filter(Boolean).length;
  }
}
