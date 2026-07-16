import { Router, type RequestHandler } from 'express';
import { NotesController } from './notes.controller';

/**
 * Notes routes — wiring only (Principle I). Every route is protected: `authenticate`
 * (gateway-verified claims) then `resolveIdentity` (attaches `req.auth.userId`) run before
 * the controller. Exposes the REST surface from contracts/notes-api.md.
 */
export function notesRoutes(
  authenticate: RequestHandler,
  resolveIdentity: RequestHandler,
  controller: NotesController = new NotesController(),
): Router {
  const router = Router();
  router.use(authenticate, resolveIdentity);
  router.get('/notes', controller.list);
  // `/notes/:id` is registered after the static `/notes` list so it never shadows it.
  router.get('/notes/:id', controller.getOne);
  router.post('/notes', controller.create);
  router.patch('/notes/:id', controller.update);
  router.delete('/notes/:id', controller.remove);
  return router;
}
