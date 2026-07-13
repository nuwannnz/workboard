import { Router, type RequestHandler } from 'express';
import { ProjectsController } from './projects.controller';

/**
 * Projects routes — wiring only (Principle I). Every route is protected: `authenticate`
 * (gateway-verified claims) then `resolveIdentity` (attaches `req.auth.userId`) run before
 * the controller. Exposes the REST surface from contracts/projects-api.md.
 */
export function projectsRoutes(
  authenticate: RequestHandler,
  resolveIdentity: RequestHandler,
  controller: ProjectsController = new ProjectsController(),
): Router {
  const router = Router();
  router.use(authenticate, resolveIdentity);
  router.get('/projects', controller.list);
  router.post('/projects', controller.create);
  router.patch('/projects/:id', controller.update);
  router.delete('/projects/:id', controller.remove);
  return router;
}
