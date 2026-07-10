import { ulid } from 'ulid';
import type { CreateNoteInput, Note, UpdateNoteInput } from '@workboard/shared';
import { NotesRepository } from './notes.repository';
import { ProjectsService } from '../projects/projects.service';
import { TasksService } from '../tasks/tasks.service';

/**
 * Thrown when a `PATCH /notes/:id` link update references a project/task the caller does not
 * own (or that does not exist). Carries the offending ids so the controller can return
 * `400 { error: 'InvalidLinkTarget', details }` (contracts/notes-api.md, FR-018, SC-007).
 */
export class InvalidLinkTargetError extends Error {
  constructor(readonly ids: string[]) {
    super(`Invalid link target(s): ${ids.join(', ')}`);
    this.name = 'InvalidLinkTargetError';
  }
}

/** Remove duplicate ids while preserving first-seen order (US3.4). */
function dedup(ids: string[]): string[] {
  return [...new Set(ids)];
}

/**
 * Note orchestration (Principle I): id/timestamp generation, recency sorting, link-target
 * validation, and reverse-lookup sequencing sit here; persistence + ownership live in the
 * repository; validation + HTTP live in the controller. The resolved `userId` is always passed
 * in — never derived from caller input.
 *
 * Links are **single-sourced on the note** (research §2). The one cross-module interaction is
 * read-only link-target ownership validation, done through the projects/tasks **public service
 * APIs** — the sanctioned seam — never their repositories/domains (Principle I), and **only**
 * when a patch actually carries link arrays (the hot content auto-save path stays a single
 * cheap update with no cross-module reads — research §5).
 */
export class NotesService {
  constructor(
    private readonly repo: NotesRepository = new NotesRepository(),
    private readonly projectsService: ProjectsService = new ProjectsService(),
    private readonly tasksService: TasksService = new TasksService(),
  ) {}

  /** Sort by `updatedAt` descending (most-recent first), `id` as a stable tiebreak. */
  private static byRecency(a: Note, b: Note): number {
    if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  }

  /**
   * Create a note — may be **empty** (auto-save-first flow, FR-002/FR-008). Assigns a ULID
   * `id`, defaults title/markdown to `''` and the link arrays to `[]`, and sets timestamps.
   */
  async createNote(userId: string, input: CreateNoteInput): Promise<Note> {
    const now = new Date().toISOString();
    const note: Note = {
      id: ulid(),
      title: input.title ?? '',
      markdown: input.markdown ?? '',
      linkedProjectIds: [],
      linkedTaskIds: [],
      createdAt: now,
      updatedAt: now,
    };
    return this.repo.put(userId, note);
  }

  /** List the owner's notes, recency-sorted (`updatedAt` desc, `id` tiebreak). */
  async listNotes(userId: string): Promise<Note[]> {
    const notes = await this.repo.list(userId);
    return notes.sort(NotesService.byRecency);
  }

  /** Reverse lookup: the owner's notes linked to `projectId` (FR-011, research §2). */
  async listByLinkedProject(userId: string, projectId: string): Promise<Note[]> {
    const notes = await this.repo.listByLinked(userId, { projectId });
    return notes.sort(NotesService.byRecency);
  }

  /** Reverse lookup: the owner's notes linked to `taskId` (FR-011, research §2). */
  async listByLinkedTask(userId: string, taskId: string): Promise<Note[]> {
    const notes = await this.repo.listByLinked(userId, { taskId });
    return notes.sort(NotesService.byRecency);
  }

  /**
   * Apply a partial in-place edit, bumping `updatedAt` (contracts PATCH). Serves three callers:
   * content auto-save (`{ title?, markdown? }` — no link validation, research §5), rename
   * (`{ title }`), and link add/remove (`{ linkedProjectIds?, linkedTaskIds? }`).
   *
   * When the patch carries link arrays, each is **de-duplicated** and every id is validated to
   * belong to the caller's own projects/tasks via the projects/tasks **public service APIs**
   * (Principle I). Any foreign/unknown id throws `InvalidLinkTargetError` listing the offenders
   * and **no partial link set is persisted** (FR-009/FR-010/FR-018, SC-007). Returns the updated
   * note, or `null` for a foreign/missing note id (not-found).
   */
  async updateNote(userId: string, id: string, patch: UpdateNoteInput): Promise<Note | null> {
    const applied: Partial<Note> = { updatedAt: new Date().toISOString() };

    if (patch.title !== undefined) applied.title = patch.title;
    if (patch.markdown !== undefined) applied.markdown = patch.markdown;

    const touchesLinks =
      patch.linkedProjectIds !== undefined || patch.linkedTaskIds !== undefined;

    if (touchesLinks) {
      const offending: string[] = [];

      if (patch.linkedProjectIds !== undefined) {
        const ids = dedup(patch.linkedProjectIds);
        const checks = await Promise.all(
          ids.map(async (pid) => ({
            pid,
            ok: (await this.projectsService.getById(userId, pid)) !== null,
          })),
        );
        offending.push(...checks.filter((c) => !c.ok).map((c) => c.pid));
        applied.linkedProjectIds = ids;
      }

      if (patch.linkedTaskIds !== undefined) {
        const ids = dedup(patch.linkedTaskIds);
        const checks = await Promise.all(
          ids.map(async (tid) => ({
            tid,
            ok: (await this.tasksService.getById(userId, tid)) !== null,
          })),
        );
        offending.push(...checks.filter((c) => !c.ok).map((c) => c.tid));
        applied.linkedTaskIds = ids;
      }

      if (offending.length > 0) throw new InvalidLinkTargetError(offending);
    }

    return this.repo.update(userId, id, applied);
  }

  /**
   * Delete a note; its links vanish with it (nothing else stores them — FR-017), so no cascade
   * write to projects/tasks. Returns `true` if it existed in the owner's partition, else
   * `false`. Idempotent under retry.
   */
  async deleteNote(userId: string, id: string): Promise<boolean> {
    return this.repo.delete(userId, id);
  }
}
