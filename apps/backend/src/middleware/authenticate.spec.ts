import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Request, Response } from 'express';
import { getCurrentInvoke } from '@codegenie/serverless-express';
import { createAuthenticate, type TokenVerifier } from './authenticate';

// The production path reads the Cognito authorizer's claims from the Lambda invocation
// event via `getCurrentInvoke()`. Mock it: `{}` (no invoke) outside the gateway-claims test.
vi.mock('@codegenie/serverless-express', () => ({
  getCurrentInvoke: vi.fn(() => ({})),
}));
const mockedGetCurrentInvoke = vi.mocked(getCurrentInvoke);

/**
 * Tests for the authenticate middleware (contracts/auth-api.md):
 *  (a) reads the gateway-verified claims and populates `req.auth`;
 *  (b) local-dev fallback verifies the id token when AUTH_LOCAL_VERIFY=true;
 *  (c) returns 401 { error: 'unauthenticated' } on missing/malformed/expired/tampered tokens.
 */
function mockRes() {
  const res = {} as Response & { statusCode?: number; body?: unknown };
  res.status = vi.fn().mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn().mockImplementation((body: unknown) => {
    res.body = body;
    return res;
  });
  return res;
}

/** Simulate a Lambda invocation whose Cognito authorizer forwarded these claims. */
function withGatewayClaims(claims: Record<string, string>): void {
  mockedGetCurrentInvoke.mockReturnValue({
    event: { requestContext: { authorizer: { claims } } },
  } as unknown as ReturnType<typeof getCurrentInvoke>);
}

function reqWithHeader(authorization?: string): Request {
  return { headers: authorization ? { authorization } : {} } as unknown as Request;
}

describe('authenticate middleware', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV };
    // Default: not inside a gateway invocation (local/unit path).
    mockedGetCurrentInvoke.mockReturnValue({} as ReturnType<typeof getCurrentInvoke>);
  });
  afterEach(() => {
    process.env = OLD_ENV;
    vi.restoreAllMocks();
  });

  it('(a) populates req.auth from gateway-verified claims and calls next', async () => {
    const authenticate = createAuthenticate();
    withGatewayClaims({
      sub: 'sub-123',
      email: 'user@example.com',
      'cognito:username': 'user@example.com',
    });
    const req = reqWithHeader();
    const res = mockRes();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.auth).toEqual({
      sub: 'sub-123',
      email: 'user@example.com',
      username: 'user@example.com',
    });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('(b) local-dev fallback verifies the id token when AUTH_LOCAL_VERIFY=true', async () => {
    process.env.AUTH_LOCAL_VERIFY = 'true';
    const verifyToken: TokenVerifier = vi.fn().mockResolvedValue({
      sub: 'sub-999',
      email: 'local@example.com',
      'cognito:username': 'local@example.com',
    });
    const authenticate = createAuthenticate({ verifyToken });
    const req = reqWithHeader('Bearer valid.id.token');
    const res = mockRes();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(verifyToken).toHaveBeenCalledWith('valid.id.token');
    expect(next).toHaveBeenCalledOnce();
    expect(req.auth).toEqual({
      sub: 'sub-999',
      email: 'local@example.com',
      username: 'local@example.com',
    });
  });

  it('(c) returns 401 when the local fallback rejects a tampered/expired token', async () => {
    process.env.AUTH_LOCAL_VERIFY = 'true';
    const verifyToken: TokenVerifier = vi.fn().mockRejectedValue(new Error('token expired'));
    const authenticate = createAuthenticate({ verifyToken });
    const req = reqWithHeader('Bearer tampered.token');
    const res = mockRes();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body).toEqual({ error: 'unauthenticated' });
  });

  it('(c) returns 401 when no token is present in local-verify mode', async () => {
    process.env.AUTH_LOCAL_VERIFY = 'true';
    const authenticate = createAuthenticate({ verifyToken: vi.fn() });
    const req = reqWithHeader(undefined);
    const res = mockRes();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body).toEqual({ error: 'unauthenticated' });
  });

  it('(c) returns 401 when there are neither gateway claims nor local verification', async () => {
    process.env.AUTH_LOCAL_VERIFY = 'false';
    const authenticate = createAuthenticate({ verifyToken: vi.fn() });
    const req = reqWithHeader('Bearer whatever');
    const res = mockRes();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
