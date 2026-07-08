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

  /** Create a task appended to the bottom of its day (contracts POST). */
  async createTask(userId: string, input: CreateTaskInput): Promise<Task> {
    const dayTasks = await this.repo.queryWindow(userId, input.dueDate, input.dueDate);
    const lastOrder = dayTasks
      .map((t) => t.order)
      .sort()
      .at(-1);
    const now = new Date().toISOString();
    const task: Task = {
      id: ulid(),
      title: input.title,
      ...(input.description !== undefined ? { description: input.description } : {}),
      dueDate: input.dueDate,
      status: 'open',
      priority: input.priority ?? 'medium',
      labels: input.labels ?? [],
      order: appendOrder(lastOrder),
      projectId: null,
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
}
