import express, { type Express } from 'express';
import { healthRoutes } from './routes/health.routes';

/**
 * Express app factory (FR-008). Both entry points — the local server (`main.ts`)
 * and the Lambda handler (`lambda.ts`) — assemble the identical app here so
 * local and deployed behavior stay in lockstep.
 */
export function createApp(): Express {
  const app = express();
  app.use(express.json());

  // Stage 1 exposes only the health interface. Feature routers mount here later.
  app.use(healthRoutes());

  return app;
}
