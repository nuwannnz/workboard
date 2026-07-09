import type { Request, Response } from 'express';
import { createTaskSchema, updateTaskSchema } from '@workboard/shared';
import { TasksService } from './tasks.service';

/** Widest possible window when the client omits `from`/`to` (contracts GET). */
const MIN_DATE = '0000-01-01';
const MAX_DATE = '9999-12-31';

/**
 * Tasks controller — thin HTTP adapter (Principle I). Validates the body with the shared
 * schemas, reads **only** `req.auth.userId` (the resolved app owner — never caller input),
 * delegates to the service, and maps outcomes to the uniform `201/200/204/400/404/500`
 * responses (contracts/tasks-api.md). No business logic here.
 */
export class TasksController {
  constructor(private readonly service: TasksService = new TasksService()) {}

  private static userId(req: Request, res: Response): string | undefined {
    const userId = req.auth?.userId;
    if (!userId) {
      res.status(401).json({ error: 'unauthenticated' });
      return undefined;
    }
    return userId;
  }

  /**
   * `GET /tasks` → `{ tasks }`. Two independent query modes (contracts/projects-api.md):
   * - `?projectId=<id>` → all of the owner's tasks in that project (backlog + scheduled),
   *   independent of any week window.
   * - `?from&to` (or neither) → the owner's displayed week window (Stage 3 behavior).
   */
  list = async (req: Request, res: Response): Promise<void> => {
    const userId = TasksController.userId(req, res);
    if (!userId) return;
    try {
      if (typeof req.query.projectId === 'string') {
        const tasks = await this.service.listByProject(userId, req.query.projectId);
        res.status(200).json({ tasks });
        return;
      }
      const from = typeof req.query.from === 'string' ? req.query.from : MIN_DATE;
      const to = typeof req.query.to === 'string' ? req.query.to : MAX_DATE;
      const tasks = await this.service.listWeek(userId, from, to);
      res.status(200).json({ tasks });
    } catch {
      res.status(500).json({ error: 'internal_error' });
    }
  };

  /** `POST /tasks` → `201` with the created task. */
  create = async (req: Request, res: Response): Promise<void> => {
    const userId = TasksController.userId(req, res);
    if (!userId) return;
    const parsed = createTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
      return;
    }
    try {
      const task = await this.service.createTask(userId, parsed.data);
      res.status(201).json(task);
    } catch {
      res.status(500).json({ error: 'internal_error' });
    }
  };

  /** `PATCH /tasks/:id` → `200` with the updated task, or `404` if not the owner's. */
  update = async (req: Request, res: Response): Promise<void> => {
    const userId = TasksController.userId(req, res);
    if (!userId) return;
    const parsed = updateTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
      return;
    }
    try {
      const task = await this.service.updateTask(userId, req.params.id, parsed.data);
      if (!task) {
        res.status(404).json({ error: 'NotFound' });
        return;
      }
      res.status(200).json(task);
    } catch {
      res.status(500).json({ error: 'internal_error' });
    }
  };

  /** `DELETE /tasks/:id` → `204`, or `404` if not the owner's. */
  remove = async (req: Request, res: Response): Promise<void> => {
    const userId = TasksController.userId(req, res);
    if (!userId) return;
    try {
      const deleted = await this.service.deleteTask(userId, req.params.id);
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
