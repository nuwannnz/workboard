import { ulid } from 'ulid';
import type { CreateProjectInput, Project, UpdateProjectInput } from '@workboard/shared';
import { ProjectsRepository } from './projects.repository';
import { TasksService } from '../tasks/tasks.service';

/** Sorted base-62 digits — an `order` string sorts lexicographically in this alphabet. */
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = DIGITS.length;
const MID = DIGITS[Math.floor(BASE / 2)];

/**
 * Fractional-index **append**: a rank strictly after `last`. Mirrors the tasks service /
 * frontend `ordering` append rule (base-62 lexicographic). The server only ever appends on
 * create; the client computes `between` ranks for reorder.
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
 * Project orchestration (Principle I): id/timestamp/order generation and CRUD sequencing sit
 * here; persistence + ownership live in the repository; validation + HTTP live in the
 * controller. The resolved `userId` is always passed in — never derived from caller input.
 *
 * The delete-cascade (Phase 7) consumes the tasks module's **public service API** only — the
 * sanctioned service-to-service seam — never its repository/domain internals (Principle I).
 */
export class ProjectsService {
  constructor(
    private readonly repo: ProjectsRepository = new ProjectsRepository(),
    private readonly tasksService: TasksService = new TasksService(),
  ) {}

  /** Create a project appended to the bottom of the owner's card order (contracts POST). */
  async createProject(userId: string, input: CreateProjectInput): Promise<Project> {
    const existing = await this.repo.list(userId);
    const lastOrder = existing
      .map((p) => p.order)
      .sort()
      .at(-1);
    const now = new Date().toISOString();
    const project: Project = {
      id: ulid(),
      name: input.name,
      ...(input.description !== undefined ? { description: input.description } : {}),
      color: input.color,
      order: appendOrder(lastOrder),
      createdAt: now,
      updatedAt: now,
    };
    return this.repo.put(userId, project);
  }

  /**
   * Fetch one of the owner's projects by id, or `null` for a foreign/missing id. Public service
   * seam consumed by the notes module for link-target ownership validation (Principle I).
   */
  async getById(userId: string, id: string): Promise<Project | null> {
    return this.repo.getById(userId, id);
  }

  /** List the owner's projects sorted by `order` then `id` (contracts GET). */
  async listProjects(userId: string): Promise<Project[]> {
    const projects = await this.repo.list(userId);
    return projects.sort((a, b) => {
      if (a.order !== b.order) return a.order < b.order ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }

  /**
   * Apply a partial in-place edit (name / description / color / card order), bumping
   * `updatedAt` (contracts PATCH, FR-014). Returns the updated project, or `null` for a
   * foreign/missing id (not-found). Empty-name rejection happens at the schema in the controller.
   */
  async updateProject(
    userId: string,
    id: string,
    patch: UpdateProjectInput,
  ): Promise<Project | null> {
    return this.repo.update(userId, id, { ...patch, updatedAt: new Date().toISOString() });
  }

  /**
   * Delete a project and **cascade-delete all of its tasks** (FR-015, research §5). Verifies
   * ownership first (a foreign/missing id is not-found and touches no tasks), then removes the
   * project's tasks via the tasks module's **public service API** (`deleteByProject`) — the
   * sanctioned service-to-service seam, never its repository/domain (Principle I) — and finally
   * deletes the project record. Idempotent under retry. Returns `false` for a non-owner id.
   */
  async deleteProject(userId: string, id: string): Promise<boolean> {
    const project = await this.repo.getById(userId, id);
    if (!project) return false;
    await this.tasksService.deleteByProject(userId, id);
    return this.repo.delete(userId, id);
  }
}
