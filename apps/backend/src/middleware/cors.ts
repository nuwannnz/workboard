import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Adds permissive CORS headers to every response this Express app emits.
 *
 * API Gateway's `defaultCorsPreflightOptions` (api-stack.ts) only answers the OPTIONS
 * preflight, and its `DEFAULT_4XX/5XX` gateway responses only cover errors API Gateway
 * itself generates — neither adds `Access-Control-Allow-Origin` to a response returned by
 * the Lambda integration. So without this, the browser blocks the SPA (served from the
 * Vercel origin) from reading any JSON the API (execute-api origin) returns, including 401s.
 *
 * Mirrors the `*` origin + Authorization/Content-Type model already configured at the
 * gateway; the API is a stateless Bearer-token model with no cookies, so `*` is safe
 * (see api-stack.ts). Tightening to the Vercel domain is optional future hardening.
 */
export function cors(): RequestHandler {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    next();
  };
}
