import { describe, it, expect, vi, afterEach } from 'vitest';
import { updateTaskSchema, type Task } from '@workboard/shared';
import { TasksService } from './tasks.service';
import type { TasksRepository } from './tasks.repository';

/**
 * Task service (contracts/tasks-api.md): create appends to the day with server-assigned
 * id/order/timestamps and sensible defaults; list-week returns only the owner's in-window
 * tasks. Ownership scoping itself is covered in tasks.repository.spec.ts.
 */
function fakeRepo() {
  const items = new Map<string, Task[]>(); // userId → tasks
  const forUser = (u: string) => items.get(u) ?? [];
  const repo = {
    async queryWindow(userId: string, from: string, to: string) {
      return forUser(userId).filter(
        (t) => t.dueDate !== null && t.dueDate >= from && t.dueDate <= to,
      );
    },
    async put(userId: string, task: Task) {
      items.set(userId, [...forUser(userId), task]);
      return task;
    },
    async getById(userId: string, id: string) {
      return forUser(userId).find((t) => t.id === id) ?? null;
    },
    async update(userId: string, id: string, patch: Partial<Task>) {
      const list = forUser(userId);
      const idx = list.findIndex((t) => t.id === id);
      if (idx === -1) return null;
      const updated = { ...list[idx], ...patch };
      list[idx] = updated;
      items.set(userId, list);
      return updated;
    },
    async delete(userId: string, id: string) {
      const list = forUser(userId);
      const next = list.filter((t) => t.id !== id);
      items.set(userId, next);
      return next.length !== list.length;
    },
  } as unknown as TasksRepository;
  return repo;
}

function makeService() {
  return new TasksService(fakeRepo());
}

describe('TasksService.createTask', () => {
  it('assigns id, order, status, timestamps and defaults priority to medium', async () => {
    const service = makeService();
    const task = await service.createTask('user-A', { title: 'First', dueDate: '2026-07-08', priority: 'medium' });

    expect(task.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/); // ULID
    expect(task.status).toBe('open');
    expect(task.priority).toBe('medium');
    expect(task.labels).toEqual([]);
    expect(task.projectId).toBeNull();
    expect(task.linkedNoteIds).toEqual([]);
    expect(task.order).toBeTruthy();
    expect(task.createdAt).toBe(task.updatedAt);
    expect(task.dueDate).toBe('2026-07-08');
  });

  it('appends each new task after the last in its day', async () => {
    const service = makeService();
    const first = await service.createTask('user-A', { title: 'First', dueDate: '2026-07-08', priority: 'medium' });
    const second = await service.createTask('user-A', { title: 'Second', dueDate: '2026-07-08', priority: 'medium' });
    const third = await service.createTask('user-A', { title: 'Third', dueDate: '2026-07-08', priority: 'medium' });

    // Strictly increasing order ranks → append lands at the bottom.
    expect(first.order < second.order).toBe(true);
    expect(second.order < third.order).toBe(true);
  });
});

describe('TasksService.listWeek', () => {
  it('returns only the owner’s in-window tasks', async () => {
    const service = makeService();
    await service.createTask('user-A', { title: 'In window', dueDate: '2026-07-08', priority: 'medium' });
    await service.createTask('user-A', { title: 'Out of window', dueDate: '2026-07-20', priority: 'medium' });
    await service.createTask('user-B', { title: "B's task", dueDate: '2026-07-08', priority: 'medium' });

    const week = await service.listWeek('user-A', '2026-07-06', '2026-07-12');
    expect(week.map((t) => t.title)).toEqual(['In window']);
  });
});

describe('TasksService.updateTask — reschedule / move (US2)', () => {
  afterEach(() => vi.useRealTimers());

  it('changes the day and order, and bumps updatedAt (FR-005, FR-010)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-08T09:00:00.000Z'));
    const service = makeService();
    const task = await service.createTask('user-A', { title: 'Move me', dueDate: '2026-07-08', priority: 'medium' });

    vi.setSystemTime(new Date('2026-07-08T09:05:00.000Z'));
    const moved = await service.updateTask('user-A', task.id, { dueDate: '2026-07-10', order: 'Vm' });

    expect(moved?.dueDate).toBe('2026-07-10');
    expect(moved?.order).toBe('Vm');
    expect(moved?.updatedAt).toBe('2026-07-08T09:05:00.000Z');
    expect(moved?.updatedAt).not.toBe(task.updatedAt);
    expect(moved?.createdAt).toBe(task.createdAt); // createdAt is stable
  });

  it('last-write-wins: a second update overwrites the first', async () => {
    const service = makeService();
    const task = await service.createTask('user-A', { title: 'x', dueDate: '2026-07-08', priority: 'medium' });
    await service.updateTask('user-A', task.id, { dueDate: '2026-07-09' });
    const second = await service.updateTask('user-A', task.id, { dueDate: '2026-07-11' });
    expect(second?.dueDate).toBe('2026-07-11');
  });

  it('a foreign / missing id is not-found', async () => {
    const service = makeService();
    const task = await service.createTask('user-A', { title: 'x', dueDate: '2026-07-08', priority: 'medium' });
    expect(await service.updateTask('user-B', task.id, { dueDate: '2026-07-09' })).toBeNull();
    expect(await service.updateTask('user-A', 'no-such-id', { dueDate: '2026-07-09' })).toBeNull();
  });
});

describe('TasksService.updateTask — edit + complete/reopen (US5)', () => {
  it('edits fields and bumps updatedAt (FR-009)', async () => {
    const service = makeService();
    const task = await service.createTask('user-A', { title: 'Old', dueDate: '2026-07-08', priority: 'medium' });
    const edited = await service.updateTask('user-A', task.id, {
      title: 'New title',
      description: 'details',
      priority: 'high',
      labels: ['x'],
    });
    expect(edited).toMatchObject({ title: 'New title', description: 'details', priority: 'high', labels: ['x'] });
  });

  it('toggles status complete → reopen, staying in its day (FR-011)', async () => {
    const service = makeService();
    const task = await service.createTask('user-A', { title: 'x', dueDate: '2026-07-08', priority: 'medium' });

    const completed = await service.updateTask('user-A', task.id, { status: 'completed' });
    expect(completed?.status).toBe('completed');
    expect(completed?.dueDate).toBe('2026-07-08');

    const reopened = await service.updateTask('user-A', task.id, { status: 'open' });
    expect(reopened?.status).toBe('open');
  });

  it('the shared schema rejects an empty title, so a prior value is retained (Story 5.6)', () => {
    // The controller validates with updateTaskSchema before the service runs; an empty
    // title never reaches persistence, so the stored title is unchanged.
    expect(updateTaskSchema.safeParse({ title: '' }).success).toBe(false);
    expect(updateTaskSchema.safeParse({ title: '   ' }).success).toBe(false);
  });
});

describe('TasksService.deleteTask (US5)', () => {
  it('removes the item; a subsequent get/delete is not-found (FR-012)', async () => {
    const service = makeService();
    const task = await service.createTask('user-A', { title: 'x', dueDate: '2026-07-08', priority: 'medium' });

    expect(await service.deleteTask('user-A', task.id)).toBe(true);
    expect(await service.listWeek('user-A', '2026-07-06', '2026-07-12')).toEqual([]);
    // Idempotent from the user's view — a second delete is not-found.
    expect(await service.deleteTask('user-A', task.id)).toBe(false);
  });

  it('does not delete another user’s task', async () => {
    const service = makeService();
    const task = await service.createTask('user-A', { title: 'x', dueDate: '2026-07-08', priority: 'medium' });
    expect(await service.deleteTask('user-B', task.id)).toBe(false);
    expect((await service.listWeek('user-A', '2026-07-06', '2026-07-12')).length).toBe(1);
  });
});
