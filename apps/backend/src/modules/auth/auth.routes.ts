import { Router, type RequestHandler } from 'express';
import { AuthController } from './auth.controller';

/**
 * Auth routes — wiring only (Principle I: no logic here). The protected `GET /me` sits
 * behind the `authenticate` middleware; `POST /auth/resend-verification` is public so an
 * unverified user can request a new code (contracts/auth-api.md).
 */
export function authRoutes(
  authenticate: RequestHandler,
  controller: AuthController = new AuthController(),
): Router {
  const router = Router();
  router.get('/me', authenticate, controller.getMe);
  router.post('/auth/resend-verification', controller.resendVerification);
  return router;
}
