import { describe, it, expect, vi } from 'vitest';
import express, { type RequestHandler } from 'express';
import { authRoutes } from './auth.routes';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

/**
 * GET /me (contracts/auth-api.md): 200 `{ id, email }` (validated by meResponseSchema)
 * with valid claims; 401 when the authenticate middleware rejects.
 */
function buildApp(authenticate: RequestHandler, service: AuthService) {
  const controller = new AuthController(service);
  const app = express();
  app.use(express.json());
  app.use(authRoutes(authenticate, controller));
  return app;
}

async function getMe(app: express.Express) {
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/me`);
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : undefined };
  } finally {
    server.close();
  }
}

describe('GET /me', () => {
  it('returns 200 { id, email } for an authenticated request', async () => {
    const service = new AuthService();
    vi.spyOn(service, 'getProfile').mockResolvedValue({ id: 'sub-1', email: 'user@example.com' });

    // Authenticate middleware that injects verified claims (as the gateway would).
    const authenticate: RequestHandler = (req, _res, next) => {
      req.auth = { sub: 'sub-1', email: 'user@example.com', username: 'user@example.com' };
      next();
    };

    const { status, body } = await getMe(buildApp(authenticate, service));
    expect(status).toBe(200);
    expect(body).toEqual({ id: 'sub-1', email: 'user@example.com' });
  });

  it('returns 401 when the authenticate middleware rejects', async () => {
    const service = new AuthService();
    const getProfile = vi.spyOn(service, 'getProfile');

    const authenticate: RequestHandler = (_req, res) => {
      res.status(401).json({ error: 'unauthenticated' });
    };

    const { status, body } = await getMe(buildApp(authenticate, service));
    expect(status).toBe(401);
    expect(body).toEqual({ error: 'unauthenticated' });
    expect(getProfile).not.toHaveBeenCalled();
  });
});
