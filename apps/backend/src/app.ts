import express, { type Express } from 'express';
import { healthRoutes } from './routes/health.routes';
import { authRoutes } from './modules/auth/auth.routes';
import { tasksRoutes } from './modules/tasks/tasks.routes';
import { projectsRoutes } from './modules/projects/projects.routes';
import { notesRoutes } from './modules/notes/notes.routes';
import { authenticate } from './middleware/authenticate';
import { resolveIdentity } from './middleware/resolve-identity';
import { cors } from './middleware/cors';

/**
 * Express app factory (FR-008). Both entry points — the local server (`main.ts`)
 * and the Lambda handler (`lambda.ts`) — assemble the identical app here so
 * local and deployed behavior stay in lockstep.
 */
export function createApp(): Express {
  const app = express();
  app.use(cors());
  // Note bodies are Markdown carried inline in the request JSON and are no longer bounded by
  // DynamoDB's 400 KB item limit now that they live in S3 (FR-013). Raise the body-parser cap
  // from its 100 KB default so large notes aren't rejected with `413 PayloadTooLarge`; keep it
  // at API Gateway's ~10 MB Lambda-proxy ceiling, the real upstream limit.
  app.use(express.json({ limit: '10mb' }));

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
