import { describe, it, expect, vi } from 'vitest';
import type { Note } from '@workboard/shared';
import { NotesService, InvalidLinkTargetError } from './notes.service';
import type { NotesRepository } from './notes.repository';
import type { ProjectsService } from '../projects/projects.service';
import type { TasksService } from '../tasks/tasks.service';

/**
 * Notes service (contracts/notes-api.md): create assigns a server ULID/timestamps and defaults
 * an empty note; list is recency-sorted; the update path validates link targets **only when
 * link arrays are present** via the projects/tasks public service APIs (Principle I). Ownership
 * scoping itself is covered in notes.repository.spec.ts.
 */
function fakeRepo() {
  const items = new Map<string, Note[]>(); // userId → notes
  const forUser = (u: string) => items.get(u) ?? [];
  const repo = {
    async list(userId: string) {
      return [...forUser(userId)];
    },
    async listByLinked(userId: string, ref: { projectId: string } | { taskId: string }) {
      const attr = 'projectId' in ref ? 'linkedProjectIds' : 'linkedTaskIds';
      const id = 'projectId' in ref ? ref.projectId : ref.taskId;
      return forUser(userId).filter((n) => (n[attr] as string[]).includes(id));
    },
    async put(userId: string, note: Note) {
      items.set(userId, [...forUser(userId), note]);
      return note;
    },
    async getById(userId: string, id: string) {
      return forUser(userId).find((n) => n.id === id) ?? null;
    },
    async update(userId: string, id: string, patch: Partial<Note>) {
      const list = forUser(userId);
      const idx = list.findIndex((n) => n.id === id);
      if (idx === -1) return null;
      const updated = { ...list[idx], ...patch };
      list[idx] = updated;
      items.set(userId, list);
      return updated;
    },
    async delete(userId: string, id: string) {
      const list = forUser(userId);
      const next = list.filter((n) => n.id !== id);
      items.set(userId, next);
      return next.length !== list.length;
    },
  } as unknown as NotesRepository;
  return repo;
}

/** Projects/tasks service doubles that own a fixed set of ids for the caller. */
function fakeProjectsService(ownedIds: string[] = []): ProjectsService {
  return {
    getById: vi.fn(async (_userId: string, id: string) =>
      ownedIds.includes(id) ? ({ id } as unknown) : null,
    ),
  } as unknown as ProjectsService;
}
function fakeTasksService(ownedIds: string[] = []): TasksService {
  return {
    getById: vi.fn(async (_userId: string, id: string) =>
      ownedIds.includes(id) ? ({ id } as unknown) : null,
    ),
  } as unknown as TasksService;
}

function makeService(projects?: ProjectsService, tasks?: TasksService) {
  return new NotesService(fakeRepo(), projects ?? fakeProjectsService(), tasks ?? fakeTasksService());
}

describe('NotesService.createNote (US1)', () => {
  it('assigns a ULID id, defaults content/links to empty, sets timestamps', async () => {
    const service = makeService();
    const note = await service.createNote('user-A', {});

    expect(note.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/); // ULID
    expect(note.title).toBe('');
    expect(note.markdown).toBe('');
    expect(note.linkedProjectIds).toEqual([]);
    expect(note.linkedTaskIds).toEqual([]);
    expect(note.createdAt).toBe(note.updatedAt);
  });

  it('accepts an optional title/markdown on create', async () => {
    const service = makeService();
    const note = await service.createNote('user-A', { title: 'Ideas', markdown: '- one' });
    expect(note.title).toBe('Ideas');
    expect(note.markdown).toBe('- one');
  });
});

describe('NotesService.listNotes (US1)', () => {
  it('returns the owner’s notes sorted by updatedAt desc then id', async () => {
    const service = makeService();
    const repo = (service as unknown as { repo: NotesRepository }).repo;
    const base = { markdown: '', linkedProjectIds: [], linkedTaskIds: [] };
    await repo.put('user-A', { id: 'old', title: 'Old', createdAt: 'x', updatedAt: '2026-07-01T00:00:00.000Z', ...base });
    await repo.put('user-A', { id: 'new', title: 'New', createdAt: 'x', updatedAt: '2026-07-09T00:00:00.000Z', ...base });
    await repo.put('user-A', { id: 'mid', title: 'Mid', createdAt: 'x', updatedAt: '2026-07-05T00:00:00.000Z', ...base });

    const list = await service.listNotes('user-A');
    expect(list.map((n) => n.id)).toEqual(['new', 'mid', 'old']);
  });

  it('returns only the owner’s notes', async () => {
    const service = makeService();
    await service.createNote('user-A', { title: 'Mine' });
    await service.createNote('user-B', { title: 'Theirs' });
    const list = await service.listNotes('user-A');
    expect(list.map((n) => n.title)).toEqual(['Mine']);
  });
});

describe('NotesService.updateNote — content path (US2)', () => {
  it('applies title/markdown, bumps updatedAt, and does NOT validate links', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T09:00:00.000Z'));
    const projects = fakeProjectsService();
    const tasks = fakeTasksService();
    const service = makeService(projects, tasks);
    const created = await service.createNote('user-A', {});

    vi.setSystemTime(new Date('2026-07-10T09:05:00.000Z'));
    const updated = await service.updateNote('user-A', created.id, {
      title: 'Renamed',
      markdown: '# Body',
    });
    expect(updated).toMatchObject({ title: 'Renamed', markdown: '# Body' });
    expect(updated?.updatedAt).toBe('2026-07-10T09:05:00.000Z');
    // The hot auto-save path performs no cross-module reads (research §5).
    expect(projects.getById).not.toHaveBeenCalled();
    expect(tasks.getById).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('a foreign/missing note id is not-found', async () => {
    const service = makeService();
    expect(await service.updateNote('user-A', 'nope', { title: 'x' })).toBeNull();
  });
});

describe('NotesService.updateNote — link validation (US3)', () => {
  it('validates link targets via the projects/tasks SERVICES and persists de-duplicated arrays', async () => {
    const projects = fakeProjectsService(['p1', 'p2']);
    const tasks = fakeTasksService(['t1']);
    const service = makeService(projects, tasks);
    const created = await service.createNote('user-A', {});

    const updated = await service.updateNote('user-A', created.id, {
      linkedProjectIds: ['p1', 'p1', 'p2'], // duplicate p1
      linkedTaskIds: ['t1'],
    });

    // De-duplicated on persist (US3.4).
    expect(updated?.linkedProjectIds).toEqual(['p1', 'p2']);
    expect(updated?.linkedTaskIds).toEqual(['t1']);
    // Validation went through the PUBLIC service APIs, not repositories/domains (Principle I).
    expect(projects.getById).toHaveBeenCalledWith('user-A', 'p1');
    expect(projects.getById).toHaveBeenCalledWith('user-A', 'p2');
    expect(tasks.getById).toHaveBeenCalledWith('user-A', 't1');
  });

  it('rejects a foreign/unknown link target as InvalidLinkTarget listing the offending ids', async () => {
    const projects = fakeProjectsService(['p1']);
    const tasks = fakeTasksService([]);
    const service = makeService(projects, tasks);
    const created = await service.createNote('user-A', {});

    await expect(
      service.updateNote('user-A', created.id, {
        linkedProjectIds: ['p1', 'foreign-p'],
        linkedTaskIds: ['foreign-t'],
      }),
    ).rejects.toMatchObject({
      name: 'InvalidLinkTargetError',
      ids: expect.arrayContaining(['foreign-p', 'foreign-t']),
    });

    // No partial link set persisted — the note's arrays stay empty.
    const after = await service.listNotes('user-A');
    expect(after[0].linkedProjectIds).toEqual([]);
    expect(after[0].linkedTaskIds).toEqual([]);
  });

  it('throws an InvalidLinkTargetError instance carrying the offending ids', async () => {
    const service = makeService(fakeProjectsService([]), fakeTasksService([]));
    const created = await service.createNote('user-A', {});
    const err = await service
      .updateNote('user-A', created.id, { linkedProjectIds: ['nope'] })
      .catch((e) => e);
    expect(err).toBeInstanceOf(InvalidLinkTargetError);
    expect(err.ids).toEqual(['nope']);
  });

  it('does NOT validate links on a content-only patch (research §5)', async () => {
    const projects = fakeProjectsService(['p1']);
    const tasks = fakeTasksService(['t1']);
    const service = makeService(projects, tasks);
    const created = await service.createNote('user-A', {});

    await service.updateNote('user-A', created.id, { markdown: 'just text' });
    expect(projects.getById).not.toHaveBeenCalled();
    expect(tasks.getById).not.toHaveBeenCalled();
  });
});

describe('NotesService reverse lookup (US4)', () => {
  async function seedLinkedNotes() {
    const service = makeService(fakeProjectsService(['p1']), fakeTasksService(['t1']));
    const a = await service.createNote('user-A', { title: 'Linked to p1+t1' });
    await service.updateNote('user-A', a.id, { linkedProjectIds: ['p1'], linkedTaskIds: ['t1'] });
    await service.createNote('user-A', { title: 'Unlinked' });
    await service.createNote('user-B', { title: "B's note" });
    return service;
  }

  it('listByLinkedProject returns the owner’s notes linked to the project', async () => {
    const service = await seedLinkedNotes();
    const notes = await service.listByLinkedProject('user-A', 'p1');
    expect(notes.map((n) => n.title)).toEqual(['Linked to p1+t1']);
    // Scoped to the owner — B's partition is never consulted.
    expect(await service.listByLinkedProject('user-B', 'p1')).toEqual([]);
  });

  it('listByLinkedTask returns the owner’s notes linked to the task', async () => {
    const service = await seedLinkedNotes();
    const notes = await service.listByLinkedTask('user-A', 't1');
    expect(notes.map((n) => n.title)).toEqual(['Linked to p1+t1']);
  });
});

describe('NotesService.deleteNote (US5, FR-017/FR-018)', () => {
  it('deletes the owner’s note (true) and is idempotent under retry', async () => {
    const service = makeService();
    const created = await service.createNote('user-A', { title: 'Bye' });
    expect(await service.deleteNote('user-A', created.id)).toBe(true);
    expect(await service.deleteNote('user-A', created.id)).toBe(false);
    expect(await service.listNotes('user-A')).toEqual([]);
  });

  it('a foreign/missing id is not-found (false) with no disclosure', async () => {
    const service = makeService();
    const created = await service.createNote('user-A', { title: 'Mine' });
    expect(await service.deleteNote('user-B', created.id)).toBe(false);
    expect((await service.listNotes('user-A')).map((n) => n.title)).toEqual(['Mine']);
  });
});
