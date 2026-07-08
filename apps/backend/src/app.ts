import express, { type Express } from 'express';
import { healthRoutes } from './routes/health.routes';
import { authRoutes } from './modules/auth/auth.routes';
import { authenticate } from './middleware/authenticate';

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

  // Auth module: protected `GET /me` (behind the authenticate middleware) and the
  // public `POST /auth/resend-verification` (FR-008, FR-009).
  app.use(authRoutes(authenticate));

  return app;
}
