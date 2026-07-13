import type { Request, Response } from 'express';
import { createProjectSchema, updateProjectSchema } from '@workboard/shared';
import { ProjectsService } from './projects.service';

/**
 * Projects controller — thin HTTP adapter (Principle I). Validates the body with the shared
 * schemas, reads **only** `req.auth.userId` (the resolved app owner — never caller input),
 * delegates to the service, and maps outcomes to the uniform `201/200/204/400/404/500`
 * responses (contracts/projects-api.md). No business logic here.
 */
export class ProjectsController {
  constructor(private readonly service: ProjectsService = new ProjectsService()) {}

  private static userId(req: Request, res: Response): string | undefined {
    const userId = req.auth?.userId;
    if (!userId) {
      res.status(401).json({ error: 'unauthenticated' });
      return undefined;
    }
    return userId;
  }

  /** `GET /projects` → `{ projects }` for the owner, ordered by `order` then `id`. */
  list = async (req: Request, res: Response): Promise<void> => {
    const userId = ProjectsController.userId(req, res);
    if (!userId) return;
    try {
      const projects = await this.service.listProjects(userId);
      res.status(200).json({ projects });
    } catch {
      res.status(500).json({ error: 'internal_error' });
    }
  };

  /** `POST /projects` → `201` with the created project. */
  create = async (req: Request, res: Response): Promise<void> => {
    const userId = ProjectsController.userId(req, res);
    if (!userId) return;
    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
      return;
    }
    try {
      const project = await this.service.createProject(userId, parsed.data);
      res.status(201).json(project);
    } catch {
      res.status(500).json({ error: 'internal_error' });
    }
  };

  /** `PATCH /projects/:id` → `200` with the updated project, or `404` if not the owner's. */
  update = async (req: Request, res: Response): Promise<void> => {
    const userId = ProjectsController.userId(req, res);
    if (!userId) return;
    const parsed = updateProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
      return;
    }
    try {
      const project = await this.service.updateProject(userId, req.params.id, parsed.data);
      if (!project) {
        res.status(404).json({ error: 'NotFound' });
        return;
      }
      res.status(200).json(project);
    } catch {
      res.status(500).json({ error: 'internal_error' });
    }
  };

  /**
   * `DELETE /projects/:id` → `204` after cascade-deleting the project's tasks, `404` if not the
   * owner's (no tasks touched), or `500` if the cascade fails (the client retries safely).
   */
  remove = async (req: Request, res: Response): Promise<void> => {
    const userId = ProjectsController.userId(req, res);
    if (!userId) return;
    try {
      const deleted = await this.service.deleteProject(userId, req.params.id);
      if (!deleted) {
        res.status(404).json({ error: 'NotFound' });
        return;
      }
      res.status(204).send();
    } catch {
      res.status(500).json({ error: 'internal_error' });
    }
  };
}
