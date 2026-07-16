import { describe, it, expect, vi } from 'vitest';
import type { NoteMetadata } from '@workboard/shared';
import { NotesService, InvalidLinkTargetError } from './notes.service';
import type { NotesRepository } from './notes.repository';
import type { NoteBodyStore } from './note-body.repository';
import type { ProjectsService } from '../projects/projects.service';
import type { TasksService } from '../tasks/tasks.service';

/**
 * Notes service (contracts/notes-api.md): create assigns a server ULID/timestamps/bodyKey and
 * writes the S3 body **before** the metadata (FR-004); getNoteById composes metadata + body;
 * update validates link targets **only when link arrays are present** via the projects/tasks
 * public service APIs (Principle I). Ownership scoping itself is covered in the repository specs;
 * the two-store ordering is exercised here with in-memory fakes for the repo + body store.
 */
function fakeRepo() {
  const items = new Map<string, NoteMetadata[]>(); // userId → metadata
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
    async put(userId: string, note: NoteMetadata) {
      items.set(userId, [...forUser(userId), note]);
      return note;
    },
    async getById(userId: string, id: string) {
      return forUser(userId).find((n) => n.id === id) ?? null;
    },
    async update(userId: string, id: string, patch: Partial<NoteMetadata>) {
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

/** In-memory body store keyed by `userId/noteId`, mirroring the S3-backed NoteBodyStore. */
function fakeBodyStore() {
  const store = new Map<string, string>();
  const k = (u: string, id: string) => `${u}/${id}`;
  const bodyStore = {
    keyFor: (u: string, id: string) => `users/${u}/notes/${id}.md`,
    putBody: vi.fn(async (u: string, id: string, md: string) => {
      store.set(k(u, id), md);
    }),
    getBody: vi.fn(async (u: string, id: string) => store.get(k(u, id)) ?? ''),
    deleteBody: vi.fn(async (u: string, id: string) => {
      store.delete(k(u, id));
    }),
  } as unknown as NoteBodyStore & {
    putBody: ReturnType<typeof vi.fn>;
    getBody: ReturnType<typeof vi.fn>;
    deleteBody: ReturnType<typeof vi.fn>;
  };
  return { bodyStore, store };
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
  const repo = fakeRepo();
  const { bodyStore, store } = fakeBodyStore();
  const service = new NotesService(
    repo,
    bodyStore,
    projects ?? fakeProjectsService(),
    tasks ?? fakeTasksService(),
  );
  return { service, repo, bodyStore, bodies: store };
}

describe('NotesService.createNote (US1)', () => {
  it('assigns a ULID id, defaults content/links to empty, sets timestamps and bodyKey', async () => {
    const { service } = makeService();
    const note = await service.createNote('user-A', {});

    expect(note.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/); // ULID
    expect(note.title).toBe('');
    expect(note.markdown).toBe('');
    expect(note.linkedProjectIds).toEqual([]);
    expect(note.linkedTaskIds).toEqual([]);
    expect(note.createdAt).toBe(note.updatedAt);
    expect(note.bodyKey).toBe(`users/user-A/notes/${note.id}.md`);
  });

  it('accepts an optional title/markdown and writes the body to the store', async () => {
    const { service, bodies } = makeService();
    const note = await service.createNote('user-A', { title: 'Ideas', markdown: '- one' });
    expect(note.title).toBe('Ideas');
    expect(note.markdown).toBe('- one');
    expect(bodies.get(`user-A/${note.id}`)).toBe('- one');
  });

  it('writes the S3 body BEFORE persisting metadata (body-first, FR-004)', async () => {
    const { service, repo, bodyStore } = makeService();
    const putSpy = vi.spyOn(repo, 'put');
    const note = await service.createNote('user-A', { markdown: 'body' });

    expect(bodyStore.putBody).toHaveBeenCalledWith('user-A', note.id, 'body');
    // Ordering: the body PutObject resolves before the metadata PutItem is issued.
    expect(bodyStore.putBody.mock.invocationCallOrder[0]).toBeLessThan(
      putSpy.mock.invocationCallOrder[0],
    );
  });
});

describe('NotesService.getNoteById (US1)', () => {
  it('composes metadata + body into a full note', async () => {
    const { service } = makeService();
    const created = await service.createNote('user-A', { title: 'T', markdown: '# Body' });

    const got = await service.getNoteById('user-A', created.id);
    expect(got).toMatchObject({ id: created.id, title: 'T', markdown: '# Body' });
  });

  it('resolves a missing body object to empty markdown (FR-012)', async () => {
    const { service, bodies } = makeService();
    const created = await service.createNote('user-A', { markdown: 'gone soon' });
    bodies.delete(`user-A/${created.id}`); // simulate a missing/interrupted body object

    const got = await service.getNoteById('user-A', created.id);
    expect(got?.markdown).toBe('');
  });

  it('a foreign/unknown id is not-found (null, no disclosure)', async () => {
    const { service } = makeService();
    const created = await service.createNote('user-A', {});
    expect(await service.getNoteById('user-B', created.id)).toBeNull();
  });
});

describe('NotesService.listNotes (US1)', () => {
  it('returns the owner’s notes sorted by updatedAt desc then id', async () => {
    const { service, repo } = makeService();
    const base = { linkedProjectIds: [], linkedTaskIds: [], bodyKey: 'k' };
    await repo.put('user-A', { id: 'old', title: 'Old', createdAt: 'x', updatedAt: '2026-07-01T00:00:00.000Z', ...base });
    await repo.put('user-A', { id: 'new', title: 'New', createdAt: 'x', updatedAt: '2026-07-09T00:00:00.000Z', ...base });
    await repo.put('user-A', { id: 'mid', title: 'Mid', createdAt: 'x', updatedAt: '2026-07-05T00:00:00.000Z', ...base });

    const list = await service.listNotes('user-A');
    expect(list.map((n) => n.id)).toEqual(['new', 'mid', 'old']);
    // The list carries metadata only — no body content.
    expect(list[0]).not.toHaveProperty('markdown');
  });

  it('returns only the owner’s notes', async () => {
    const { service } = makeService();
    await service.createNote('user-A', { title: 'Mine' });
    await service.createNote('user-B', { title: 'Theirs' });
    const list = await service.listNotes('user-A');
    expect(list.map((n) => n.title)).toEqual(['Mine']);
  });
});

describe('NotesService.updateNote — content path (US2)', () => {
  it('applies title/markdown, bumps updatedAt, writes body first, and does NOT validate links', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T09:00:00.000Z'));
    const projects = fakeProjectsService();
    const tasks = fakeTasksService();
    const { service, bodyStore, bodies } = makeService(projects, tasks);
    const created = await service.createNote('user-A', {});

    vi.setSystemTime(new Date('2026-07-10T09:05:00.000Z'));
    const updated = await service.updateNote('user-A', created.id, {
      title: 'Renamed',
      markdown: '# Body',
    });
    expect(updated).toMatchObject({ title: 'Renamed', markdown: '# Body' });
    expect(updated?.updatedAt).toBe('2026-07-10T09:05:00.000Z');
    expect(bodies.get(`user-A/${created.id}`)).toBe('# Body');
    expect(bodyStore.putBody).toHaveBeenCalledWith('user-A', created.id, '# Body');
    // The hot auto-save path performs no cross-module reads (research §5).
    expect(projects.getById).not.toHaveBeenCalled();
    expect(tasks.getById).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('a metadata-only patch (rename) skips the S3 body write and reads through for the response', async () => {
    const { service, bodyStore } = makeService();
    const created = await service.createNote('user-A', { markdown: 'kept' });
    bodyStore.putBody.mockClear();

    const updated = await service.updateNote('user-A', created.id, { title: 'Renamed' });
    expect(updated).toMatchObject({ title: 'Renamed', markdown: 'kept' });
    // No body write on a title-only change (research §3).
    expect(bodyStore.putBody).not.toHaveBeenCalled();
  });

  it('a foreign/missing note id is not-found', async () => {
    const { service } = makeService();
    expect(await service.updateNote('user-A', 'nope', { title: 'x' })).toBeNull();
  });
});

describe('NotesService write ordering — body-first, no partial state (US2, FR-004/FR-005/FR-010)', () => {
  it('create: a failed body PutObject aborts before any metadata write, and nothing persists', async () => {
    const { service, repo, bodyStore } = makeService();
    const putSpy = vi.spyOn(repo, 'put');
    bodyStore.putBody.mockRejectedValueOnce(new Error('s3 down'));

    await expect(service.createNote('user-A', { markdown: 'body' })).rejects.toThrow();
    expect(putSpy).not.toHaveBeenCalled();
    // No metadata item exists — the note never appears (FR-005).
    expect(await service.listNotes('user-A')).toEqual([]);
  });

  it('update: a failed body PutObject aborts before the metadata write; updatedAt does not advance', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T09:00:00.000Z'));
    const { service, repo, bodyStore } = makeService();
    const created = await service.createNote('user-A', { markdown: 'v1' });

    const updateSpy = vi.spyOn(repo, 'update');
    vi.setSystemTime(new Date('2026-07-10T09:05:00.000Z'));
    bodyStore.putBody.mockRejectedValueOnce(new Error('s3 down'));

    await expect(
      service.updateNote('user-A', created.id, { markdown: 'v2' }),
    ).rejects.toThrow();
    expect(updateSpy).not.toHaveBeenCalled();

    // The previously saved body still returns and updatedAt is unchanged (FR-004/FR-010).
    const after = await service.getNoteById('user-A', created.id);
    expect(after?.markdown).toBe('v1');
    expect(after?.updatedAt).toBe('2026-07-10T09:00:00.000Z');
    vi.useRealTimers();
  });
});

describe('NotesService.updateNote — link validation (US3)', () => {
  it('validates link targets via the projects/tasks SERVICES and persists de-duplicated arrays', async () => {
    const projects = fakeProjectsService(['p1', 'p2']);
    const tasks = fakeTasksService(['t1']);
    const { service } = makeService(projects, tasks);
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
    const { service } = makeService(projects, tasks);
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
    const { service } = makeService(fakeProjectsService([]), fakeTasksService([]));
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
    const { service } = makeService(projects, tasks);
    const created = await service.createNote('user-A', {});

    await service.updateNote('user-A', created.id, { markdown: 'just text' });
    expect(projects.getById).not.toHaveBeenCalled();
    expect(tasks.getById).not.toHaveBeenCalled();
  });
});

describe('NotesService reverse lookup (US4)', () => {
  async function seedLinkedNotes() {
    const made = makeService(fakeProjectsService(['p1']), fakeTasksService(['t1']));
    const a = await made.service.createNote('user-A', { title: 'Linked to p1+t1' });
    await made.service.updateNote('user-A', a.id, { linkedProjectIds: ['p1'], linkedTaskIds: ['t1'] });
    await made.service.createNote('user-A', { title: 'Unlinked' });
    await made.service.createNote('user-B', { title: "B's note" });
    return made.service;
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

describe('NotesService.deleteNote (US3, FR-008/FR-009, SC-005)', () => {
  it('deletes the owner’s note (true), removes its body, and is idempotent under retry', async () => {
    const { service, bodies } = makeService();
    const created = await service.createNote('user-A', { title: 'Bye', markdown: 'body' });
    expect(bodies.has(`user-A/${created.id}`)).toBe(true);

    expect(await service.deleteNote('user-A', created.id)).toBe(true);
    expect(bodies.has(`user-A/${created.id}`)).toBe(false);
    expect(await service.deleteNote('user-A', created.id)).toBe(false);
    expect(await service.listNotes('user-A')).toEqual([]);
  });

  it('removes metadata BEFORE the body (metadata-first ordering, FR-008)', async () => {
    const { service, repo, bodyStore } = makeService();
    const created = await service.createNote('user-A', {});
    const delSpy = vi.spyOn(repo, 'delete');

    await service.deleteNote('user-A', created.id);
    expect(delSpy.mock.invocationCallOrder[0]).toBeLessThan(
      bodyStore.deleteBody.mock.invocationCallOrder[0],
    );
  });

  it('a failed body delete is caught — deleteNote still succeeds (best-effort, FR-009)', async () => {
    const { service, bodyStore } = makeService();
    const created = await service.createNote('user-A', {});
    bodyStore.deleteBody.mockRejectedValueOnce(new Error('s3 down'));

    expect(await service.deleteNote('user-A', created.id)).toBe(true);
    expect(await service.listNotes('user-A')).toEqual([]);
  });

  it('does NOT attempt a body delete when the metadata delete found nothing', async () => {
    const { service, bodyStore } = makeService();
    const created = await service.createNote('user-A', { title: 'Mine' });

    // A foreign caller's delete finds no metadata → no body delete attempted, no disclosure.
    expect(await service.deleteNote('user-B', created.id)).toBe(false);
    expect(bodyStore.deleteBody).not.toHaveBeenCalled();
    expect((await service.listNotes('user-A')).map((n) => n.title)).toEqual(['Mine']);
  });
});
