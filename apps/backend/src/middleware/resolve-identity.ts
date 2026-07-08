import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { IdentityService, identityService } from '../modules/auth/identity.service';

/**
 * Cross-cutting identity middleware (research §12, Principle I). Runs immediately after
 * `authenticate` on protected feature routers: it reads the gateway-verified `sub`/`email`
 * and resolves them to the application `userId`, attaching `req.auth = { sub, email,
 * userId }` before any feature controller runs. Feature modules read only `req.auth.userId`
 * and never import the auth module's repository.
 *
 * On a resolution failure it responds `500` without leaking internals (FR-016); a missing
 * `req.auth` (middleware misordering) is treated as unauthenticated.
 */
export function createResolveIdentity(
  service: IdentityService = identityService,
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.auth?.sub) {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }
    try {
      const userId = await service.resolveUserId(req.auth.sub, req.auth.email);
      req.auth = { ...req.auth, userId };
      next();
    } catch {
      res.status(500).json({ error: 'internal_error' });
    }
  };
}

/** Default middleware instance used by the app wiring. */
export const resolveIdentity = createResolveIdentity();
