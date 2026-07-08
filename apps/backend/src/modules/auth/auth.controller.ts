import type { Request, Response } from 'express';
import { resendVerificationRequestSchema, meResponseSchema } from '@workboard/shared';
import { AuthService } from './auth.service';

/**
 * Auth controller — thin HTTP adapter (Principle I). Reads the request/identity, calls
 * the service, and maps results to status codes. No business logic here.
 */
export class AuthController {
  constructor(private readonly service: AuthService = new AuthService()) {}

  /** `GET /me` — returns the authenticated profile (protected). Implemented in T039. */
  getMe = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }
    const profile = await this.service.getProfile(req.auth);
    res.status(200).json(meResponseSchema.parse(profile));
  };

  /** `POST /auth/resend-verification` — public, always neutral. Implemented in T029. */
  resendVerification = async (req: Request, res: Response): Promise<void> => {
    const parsed = resendVerificationRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    try {
      await this.service.resendVerification(parsed.data.email);
      res.status(200).json({ status: 'ok' });
    } catch {
      // Provider unreachable → the only non-neutral outcome (FR-015).
      res.status(503).json({ error: 'try_again_later' });
    }
  };
}
