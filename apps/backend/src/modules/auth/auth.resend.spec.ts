import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import { authRoutes } from './auth.routes';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

/**
 * Integration test for POST /auth/resend-verification (contracts/auth-api.md): always
 * neutral `{ status: 'ok' }` (no enumeration), `400` on malformed email, `503` when the
 * identity provider is unreachable.
 */
function buildApp(service: AuthService) {
  const controller = new AuthController(service);
  const app = express();
  app.use(express.json());
  // The public resend route needs no auth; pass no-op authenticate + resolve-identity for
  // the protected one.
  app.use(
    authRoutes(
      (_req, _res, next) => next(),
      (_req, _res, next) => next(),
      controller,
    ),
  );
  return app;
}

async function post(app: express.Express, path: string, body: unknown) {
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : undefined };
  } finally {
    server.close();
  }
}

describe('POST /auth/resend-verification', () => {
  it('returns neutral 200 { status: "ok" } when the provider accepts', async () => {
    const service = new AuthService();
    vi.spyOn(service, 'resendVerification').mockResolvedValue(undefined);

    const { status, body } = await post(buildApp(service), '/auth/resend-verification', {
      email: 'user@example.com',
    });

    expect(status).toBe(200);
    expect(body).toEqual({ status: 'ok' });
  });

  it('returns the same neutral 200 regardless of whether the email exists', async () => {
    const service = new AuthService();
    // Service resolves neutrally in both cases (no enumeration).
    vi.spyOn(service, 'resendVerification').mockResolvedValue(undefined);

    const { status, body } = await post(buildApp(service), '/auth/resend-verification', {
      email: 'unknown@example.com',
    });

    expect(status).toBe(200);
    expect(body).toEqual({ status: 'ok' });
  });

  it('returns 400 on a malformed email', async () => {
    const service = new AuthService();
    const spy = vi.spyOn(service, 'resendVerification').mockResolvedValue(undefined);

    const { status } = await post(buildApp(service), '/auth/resend-verification', {
      email: 'not-an-email',
    });

    expect(status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns 503 { error: "try_again_later" } when the provider is unreachable', async () => {
    const service = new AuthService();
    vi.spyOn(service, 'resendVerification').mockRejectedValue(new Error('network down'));

    const { status, body } = await post(buildApp(service), '/auth/resend-verification', {
      email: 'user@example.com',
    });

    expect(status).toBe(503);
    expect(body).toEqual({ error: 'try_again_later' });
  });
});
