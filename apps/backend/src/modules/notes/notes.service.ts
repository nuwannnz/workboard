import { ulid } from 'ulid';
import type { CreateNoteInput, Note, NoteMetadata, UpdateNoteInput } from '@workboard/shared';
import { NotesRepository } from './notes.repository';
import { NoteBodyStore } from './note-body.repository';
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
    private readonly bodyStore: NoteBodyStore = new NoteBodyStore(),
    private readonly projectsService: ProjectsService = new ProjectsService(),
    private readonly tasksService: TasksService = new TasksService(),
  ) {}

  /** Sort by `updatedAt` descending (most-recent first), `id` as a stable tiebreak. */
  private static byRecency(a: NoteMetadata, b: NoteMetadata): number {
    if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  }

  /**
   * Create a note — may be **empty** (auto-save-first flow, FR-002/FR-008). Assigns a ULID
   * `id`, defaults title/markdown to `''` and the link arrays to `[]`, sets timestamps and the
   * `bodyKey`. Writes the S3 body **first**, then the metadata (FR-004): if the body write fails
   * the metadata is never created, so the notebook never shows a note whose body is missing
   * (FR-005/FR-010). Returns the full note (metadata + the just-written body).
   */
  async createNote(userId: string, input: CreateNoteInput): Promise<Note> {
    const now = new Date().toISOString();
    const id = ulid();
    const markdown = input.markdown ?? '';
    const metadata: NoteMetadata = {
      id,
      title: input.title ?? '',
      linkedProjectIds: [],
      linkedTaskIds: [],
      createdAt: now,
      updatedAt: now,
      bodyKey: this.bodyStore.keyFor(userId, id),
    };
    // Body-first: a failed PutObject aborts here with no metadata written (FR-004/FR-005).
    await this.bodyStore.putBody(userId, id, markdown);
    await this.repo.put(userId, metadata);
    return { ...metadata, markdown };
  }

  /**
   * Fetch one note with its body (`GET /notes/:id`). Reads the ownership-enforced metadata, then
   * composes the S3 body; a missing body object resolves to `markdown: ''` (FR-012). Returns
   * `null` for a foreign/unknown id (not-found, no disclosure).
   */
  async getNoteById(userId: string, id: string): Promise<Note | null> {
    const metadata = await this.repo.getById(userId, id);
    if (!metadata) return null;
    const markdown = await this.bodyStore.getBody(userId, id);
    return { ...metadata, markdown };
  }

  /** List the owner's notes (metadata only), recency-sorted (`updatedAt` desc, `id` tiebreak). */
  async listNotes(userId: string): Promise<NoteMetadata[]> {
    const notes = await this.repo.list(userId);
    return notes.sort(NotesService.byRecency);
  }

  /** Reverse lookup: the owner's notes linked to `projectId` (FR-011, research §2). */
  async listByLinkedProject(userId: string, projectId: string): Promise<NoteMetadata[]> {
    const notes = await this.repo.listByLinked(userId, { projectId });
    return notes.sort(NotesService.byRecency);
  }

  /** Reverse lookup: the owner's notes linked to `taskId` (FR-011, research §2). */
  async listByLinkedTask(userId: string, taskId: string): Promise<NoteMetadata[]> {
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
    const applied: Partial<NoteMetadata> = { updatedAt: new Date().toISOString() };

    if (patch.title !== undefined) applied.title = patch.title;

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

    // Body-first when the patch carries content: PutObject the body, then bump the metadata
    // (FR-004). A failed body write aborts before any metadata mutation, so `updatedAt` never
    // advances past a body we didn't persist (FR-005/FR-010). A metadata-only patch (rename /
    // link change) skips S3 entirely (research §3).
    if (patch.markdown !== undefined) {
      await this.bodyStore.putBody(userId, id, patch.markdown);
    }

    const metadata = await this.repo.update(userId, id, applied);
    if (!metadata) return null;

    // Compose the full note: the just-written body for a content patch, else read-through so a
    // metadata-only patch still returns an honest full note (contracts/notes-api.md PATCH).
    const markdown =
      patch.markdown !== undefined ? patch.markdown : await this.bodyStore.getBody(userId, id);
    return { ...metadata, markdown };
  }

  /**
   * Delete a note: remove the **metadata first** (ownership-guarded) so the note vanishes
   * immediately, then best-effort delete its S3 body (FR-008/FR-009). A failed body delete is
   * caught and logged — never fatal — leaving at worst a harmless orphaned object; the operation
   * still succeeds. No body delete is attempted when the metadata delete found nothing (foreign/
   * missing id). Its links vanish with the metadata (nothing else stores them — FR-017), so no
   * cascade write to projects/tasks. Returns `true` if the note existed in the owner's partition,
   * else `false`. Idempotent under retry.
   */
  async deleteNote(userId: string, id: string): Promise<boolean> {
    const existed = await this.repo.delete(userId, id);
    if (!existed) return false;
    try {
      await this.bodyStore.deleteBody(userId, id);
    } catch (err) {
      // Best-effort cleanup — an orphaned body object is invisible and harmless (FR-009).
      console.warn(`note body delete failed for note ${id}`, err);
    }
    return true;
  }
}
