import { Router } from 'express';
import { HealthController } from '../controllers/health.controller';

/**
 * Health route — wiring only (Principle I: no logic here). Maps `GET /health`
 * to the controller, which delegates to service → repository.
 */
export function healthRoutes(controller: HealthController = new HealthController()): Router {
  const router = Router();
  router.get('/health', controller.getHealth);
  return router;
}
