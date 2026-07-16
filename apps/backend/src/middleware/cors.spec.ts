import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { cors } from './cors';

/**
 * The CORS middleware must stamp `Access-Control-Allow-Origin` on every response so the
 * cross-origin SPA (Vercel) can read this API's (execute-api) JSON — API Gateway does not
 * add it to Lambda integration responses. Without it the browser blocks the body (the
 * "No 'Access-Control-Allow-Origin' header" failure that masked 401s as opaque errors).
 */
describe('cors middleware', () => {
  it('sets the ACAO/allow-headers/allow-methods headers and calls next', () => {
    const res = { setHeader: vi.fn() } as unknown as Response;
    const next = vi.fn();

    cors()({} as Request, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type',
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    );
    expect(next).toHaveBeenCalledOnce();
  });
});
