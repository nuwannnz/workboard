import { describe, it, expect, vi } from 'vitest';
import { createProjectSchema, type Project } from '@workboard/shared';
import { ProjectsService } from './projects.service';
import type { ProjectsRepository } from './projects.repository';
import type { TasksService } from '../tasks/tasks.service';

/**
 * Project service (contracts/projects-api.md): create appends to the owner's card order with
 * a server-assigned ULID id / order / timestamps and a defaulted color; list returns the
 * owner's projects sorted by `order` then `id`. Ownership scoping itself is covered in
 * projects.repository.spec.ts.
 */
function fakeRepo() {
  const items = new Map<string, Project[]>(); // userId → projects
  const forUser = (u: string) => items.get(u) ?? [];
  const repo = {
    async list(userId: string) {
      return [...forUser(userId)];
    },
    async put(userId: string, project: Project) {
      items.set(userId, [...forUser(userId), project]);
      return project;
    },
    async getById(userId: string, id: string) {
      return forUser(userId).find((p) => p.id === id) ?? null;
    },
    async update(userId: string, id: string, patch: Partial<Project>) {
      const list = forUser(userId);
      const idx = list.findIndex((p) => p.id === id);
      if (idx === -1) return null;
      const updated = { ...list[idx], ...patch };
      list[idx] = updated;
      items.set(userId, list);
      return updated;
    },
    async delete(userId: string, id: string) {
      const list = forUser(userId);
      const next = list.filter((p) => p.id !== id);
      items.set(userId, next);
      return next.length !== list.length;
    },
  } as unknown as ProjectsRepository;
  return repo;
}

function makeService() {
  return new ProjectsService(fakeRepo());
}

describe('ProjectsService.createProject', () => {
  it('assigns a ULID id, order, timestamps and defaults color', async () => {
    const service = makeService();
    const input = createProjectSchema.parse({ name: 'Launch' });
    const project = await service.createProject('user-A', input);

    expect(project.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/); // ULID
    expect(project.name).toBe('Launch');
    expect(project.color).toBe('slate');
    expect(project.order).toBeTruthy();
    expect(project.createdAt).toBe(project.updatedAt);
  });

  it('appends each new project after the last in the owner’s card order', async () => {
    const service = makeService();
    const first = await service.createProject('user-A', createProjectSchema.parse({ name: 'One' }));
    const second = await service.createProject('user-A', createProjectSchema.parse({ name: 'Two' }));
    const third = await service.createProject('user-A', createProjectSchema.parse({ name: 'Three' }));

    expect(first.order < second.order).toBe(true);
    expect(second.order < third.order).toBe(true);
  });

  it('rejects an empty / whitespace name via the shared schema (FR-002)', () => {
    expect(createProjectSchema.safeParse({ name: '' }).success).toBe(false);
    expect(createProjectSchema.safeParse({ name: '   ' }).success).toBe(false);
  });
});

describe('ProjectsService.listProjects', () => {
  it('returns the owner’s projects sorted by order then id', async () => {
    const service = makeService();
    // Seed out of order to prove the sort.
    const repo = (service as unknown as { repo: ProjectsRepository }).repo;
    await repo.put('user-A', {
      id: 'zzz',
      name: 'First',
      color: 'slate',
      order: 'A',
      createdAt: 'x',
      updatedAt: 'x',
    });
    await repo.put('user-A', {
      id: 'aaa',
      name: 'Second',
      color: 'slate',
      order: 'B',
      createdAt: 'x',
      updatedAt: 'x',
    });

    const list = await service.listProjects('user-A');
    expect(list.map((p) => p.name)).toEqual(['First', 'Second']);
  });

  it('returns only the owner’s projects', async () => {
    const service = makeService();
    await service.createProject('user-A', createProjectSchema.parse({ name: 'Mine' }));
    await service.createProject('user-B', createProjectSchema.parse({ name: 'Theirs' }));

    const list = await service.listProjects('user-A');
    expect(list.map((p) => p.name)).toEqual(['Mine']);
  });
});

describe('ProjectsService.updateProject (US5)', () => {
  it('applies a partial in-place patch and bumps updatedAt (FR-014)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-08T09:00:00.000Z'));
    const service = makeService();
    const created = await service.createProject('user-A', createProjectSchema.parse({ name: 'Old' }));

    vi.setSystemTime(new Date('2026-07-08T09:05:00.000Z'));
    const updated = await service.updateProject('user-A', created.id, {
      name: 'New',
      color: 'red',
    });
    expect(updated).toMatchObject({ name: 'New', color: 'red' });
    expect(updated?.updatedAt).toBe('2026-07-08T09:05:00.000Z');
    expect(updated?.createdAt).toBe(created.createdAt); // stable
    vi.useRealTimers();
  });

  it('a foreign / missing id is not-found', async () => {
    const service = makeService();
    const created = await service.createProject('user-A', createProjectSchema.parse({ name: 'x' }));
    expect(await service.updateProject('user-B', created.id, { name: 'y' })).toBeNull();
    expect(await service.updateProject('user-A', 'no-such-id', { name: 'y' })).toBeNull();
  });
});

describe('ProjectsService.deleteProject — cascade (US5, FR-015)', () => {
  /** A spy TasksService exposing only the public API the cascade is allowed to use. */
  function spyTasksService() {
    return {
      deleteByProject: vi.fn(async () => 2),
    } as unknown as TasksService & { deleteByProject: ReturnType<typeof vi.fn> };
  }

  it('deletes the project’s tasks via the tasks service, then the project record', async () => {
    const tasks = spyTasksService();
    const service = new ProjectsService(fakeRepo(), tasks);
    const created = await service.createProject('user-A', createProjectSchema.parse({ name: 'P' }));

    const ok = await service.deleteProject('user-A', created.id);
    expect(ok).toBe(true);
    // Cascade went through the tasks module's PUBLIC service API (Principle I).
    expect(tasks.deleteByProject).toHaveBeenCalledWith('user-A', created.id);
    // Project record is gone.
    expect(await service.listProjects('user-A')).toEqual([]);
  });

  it('a foreign id is not-found and touches no tasks', async () => {
    const tasks = spyTasksService();
    const service = new ProjectsService(fakeRepo(), tasks);
    const created = await service.createProject('user-A', createProjectSchema.parse({ name: 'P' }));

    expect(await service.deleteProject('user-B', created.id)).toBe(false);
    expect(tasks.deleteByProject).not.toHaveBeenCalled();
    // A's project is untouched.
    expect((await service.listProjects('user-A')).map((p) => p.name)).toEqual(['P']);
  });

  it('is idempotent under retry (a second delete is not-found)', async () => {
    const tasks = spyTasksService();
    const service = new ProjectsService(fakeRepo(), tasks);
    const created = await service.createProject('user-A', createProjectSchema.parse({ name: 'P' }));

    expect(await service.deleteProject('user-A', created.id)).toBe(true);
    expect(await service.deleteProject('user-A', created.id)).toBe(false);
  });
});
