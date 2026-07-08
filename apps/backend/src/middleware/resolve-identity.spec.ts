import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { createResolveIdentity } from './resolve-identity';
import type { IdentityService } from '../modules/auth/identity.service';

function mockRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

describe('resolve-identity middleware', () => {
  it('attaches the resolved app userId to req.auth and calls next', async () => {
    const service = {
      resolveUserId: vi.fn().mockResolvedValue('app-user-1'),
    } as unknown as IdentityService;
    const middleware = createResolveIdentity(service);

    const req = {
      auth: { sub: 'sub-1', email: 'a@example.com', username: 'a@example.com' },
    } as Request;
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(service.resolveUserId).toHaveBeenCalledWith('sub-1', 'a@example.com');
    expect(req.auth?.userId).toBe('app-user-1');
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
  });

  it('responds 500 without leaking internals and does not call next on resolution failure', async () => {
    const service = {
      resolveUserId: vi.fn().mockRejectedValue(new Error('dynamo exploded')),
    } as unknown as IdentityService;
    const middleware = createResolveIdentity(service);

    const req = {
      auth: { sub: 'sub-1', email: 'a@example.com', username: 'a@example.com' },
    } as Request;
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'internal_error' });
    expect(next).not.toHaveBeenCalled();
  });

  it('responds 401 when there is no authenticated subject', async () => {
    const service = { resolveUserId: vi.fn() } as unknown as IdentityService;
    const middleware = createResolveIdentity(service);

    const req = {} as Request;
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
    expect(service.resolveUserId).not.toHaveBeenCalled();
  });
});
