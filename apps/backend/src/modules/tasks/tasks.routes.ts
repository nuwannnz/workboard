import { Router, type RequestHandler } from 'express';
import { TasksController } from './tasks.controller';

/**
 * Tasks routes — wiring only (Principle I). Every route is protected: `authenticate`
 * (gateway-verified claims) then `resolveIdentity` (attaches `req.auth.userId`) run before
 * the controller. Exposes the minimal REST surface from contracts/tasks-api.md.
 */
export function tasksRoutes(
  authenticate: RequestHandler,
  resolveIdentity: RequestHandler,
  controller: TasksController = new TasksController(),
): Router {
  const router = Router();
  router.use(authenticate, resolveIdentity);
  router.get('/tasks', controller.list);
  router.post('/tasks', controller.create);
  router.patch('/tasks/:id', controller.update);
  router.delete('/tasks/:id', controller.remove);
  return router;
}
