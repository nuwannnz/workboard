import express, { type Express } from 'express';
import { healthRoutes } from './routes/health.routes';
import { authRoutes } from './modules/auth/auth.routes';
import { tasksRoutes } from './modules/tasks/tasks.routes';
import { projectsRoutes } from './modules/projects/projects.routes';
import { notesRoutes } from './modules/notes/notes.routes';
import { authenticate } from './middleware/authenticate';
import { resolveIdentity } from './middleware/resolve-identity';

/**
 * Express app factory (FR-008). Both entry points — the local server (`main.ts`)
 * and the Lambda handler (`lambda.ts`) — assemble the identical app here so
 * local and deployed behavior stay in lockstep.
 */
export function createApp(): Express {
  const app = express();
  app.use(express.json());

  // Public health probe.
  app.use(healthRoutes());

  // Auth module: protected `GET /me` (behind authenticate + resolve-identity) and the
  // public `POST /auth/resend-verification` (FR-008, FR-009).
  app.use(authRoutes(authenticate, resolveIdentity));

  // Tasks module: the Week board's REST surface, all behind authenticate +
  // resolve-identity so controllers read only the resolved app `userId` (Stage 2's
  // protected proxy already routes `/tasks/*` — no new infra).
  app.use(tasksRoutes(authenticate, resolveIdentity));

  // Projects module: the Projects surface's REST endpoints, all behind authenticate +
  // resolve-identity so controllers read only the resolved app `userId` (Stage 2's protected
  // proxy already routes `/projects/*` — no new infra).
  app.use(projectsRoutes(authenticate, resolveIdentity));

  // Notes module: the Notes surface's REST endpoints (create/list/update/delete + the reverse
  // linked-notes lookup), all behind authenticate + resolve-identity so controllers read only
  // the resolved app `userId` (Stage 2's protected proxy already routes `/notes/*` — no new
  // infra).
  app.use(notesRoutes(authenticate, resolveIdentity));

  return app;
}
