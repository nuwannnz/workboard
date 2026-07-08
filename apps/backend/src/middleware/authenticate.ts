import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { loadConfig } from '../shared/config';

/**
 * The authenticated identity attached to every protected request. Sourced from the
 * gateway-verified Cognito claims (production) or the local-dev fallback verifier.
 */
export interface AuthContext {
  sub: string;
  email: string;
  username: string;
  /** App-level owner id (UUID) resolved from `sub` by the `resolve-identity` middleware.
   * Present only after that middleware runs; feature controllers read only this. */
  userId?: string;
}

// Augment Express' Request so handlers can read `req.auth` with types.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/** Decoded id-token claims we rely on (Cognito). */
interface IdTokenClaims {
  sub: string;
  email: string;
  'cognito:username'?: string;
  username?: string;
}

/** Verifies an id token out-of-band; injectable so tests stay hermetic. */
export type TokenVerifier = (idToken: string) => Promise<IdTokenClaims>;

/**
 * Reads the claims API Gateway's Cognito authorizer forwards to the Lambda. With
 * `@codegenie/serverless-express` the original event hangs off `req.apiGateway.event`.
 */
function extractGatewayClaims(req: Request): IdTokenClaims | undefined {
  const anyReq = req as unknown as {
    apiGateway?: { event?: { requestContext?: { authorizer?: { claims?: IdTokenClaims } } } };
  };
  return anyReq.apiGateway?.event?.requestContext?.authorizer?.claims;
}

function readBearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return undefined;
  return token;
}

function toAuthContext(claims: IdTokenClaims): AuthContext {
  return {
    sub: claims.sub,
    email: claims.email,
    username: claims['cognito:username'] ?? claims.username ?? claims.sub,
  };
}

function unauthenticated(res: Response): void {
  res.status(401).json({ error: 'unauthenticated' });
}

/**
 * Lazily constructs the aws-jwt-verify id-token verifier. Dynamically imported so the
 * dependency is only loaded on the local-dev fallback path and stays out of the Lambda
 * bundle (externalized in api-stack.ts, T002). `tokenUse: 'id'` matches the token the
 * client sends (research.md §2).
 *
 * Two shapes:
 * - **Real Cognito** (`CognitoJwtVerifier`): issuer + JWKS URI are derived from the pool id.
 * - **Local emulator** (`JwtRsaVerifier`): when `COGNITO_ISSUER` + `COGNITO_JWKS_URI` are set
 *   (fully-local dev via cognito-local), point the generic RSA verifier at the local issuer
 *   and JWKS — `CognitoJwtVerifier` cannot override those, and they aren't AWS URLs locally.
 */
let cachedVerifier: Promise<{ verify(token: string): Promise<IdTokenClaims> }> | undefined;
async function defaultVerifyToken(idToken: string): Promise<IdTokenClaims> {
  const config = loadConfig();
  if (!cachedVerifier) {
    if (config.cognitoIssuer && config.cognitoJwksUri) {
      // cognito-local serves JWKS over plain http, which aws-jwt-verify's default fetcher
      // rejects (https-only). Supply a small http-capable JWKS fetcher for the local path.
      cachedVerifier = Promise.all([import('aws-jwt-verify'), import('aws-jwt-verify/jwk')]).then(
        ([{ JwtRsaVerifier }, { SimpleJwksCache }]) => {
          const jwksCache = new SimpleJwksCache({
            fetcher: {
              fetch: async (uri: string) => {
                const res = await fetch(uri);
                if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
                return res.json();
              },
            },
          });
          return JwtRsaVerifier.create(
            {
              issuer: config.cognitoIssuer as string,
              jwksUri: config.cognitoJwksUri as string,
              audience: config.cognitoClientId ?? null,
            },
            { jwksCache },
          );
        },
      ) as Promise<{ verify(token: string): Promise<IdTokenClaims> }>;
    } else {
      if (!config.cognitoUserPoolId) {
        throw new Error('COGNITO_USER_POOL_ID is required for local token verification');
      }
      cachedVerifier = import('aws-jwt-verify').then(({ CognitoJwtVerifier }) =>
        CognitoJwtVerifier.create({
          userPoolId: config.cognitoUserPoolId as string,
          tokenUse: 'id',
          clientId: config.cognitoClientId ?? null,
        }),
      ) as Promise<{ verify(token: string): Promise<IdTokenClaims> }>;
    }
  }
  const verifier = await cachedVerifier;
  return verifier.verify(idToken);
}

/**
 * Builds the authenticate middleware (T012). In production it is a thin, crypto-free
 * extractor that trusts the claims API Gateway's Cognito authorizer already verified at
 * the edge (FR-009). Outside API Gateway (local dev / unit tests) it falls back to
 * verifying the id token in-process, gated by `AUTH_LOCAL_VERIFY`. Returns
 * `401 { error: 'unauthenticated' }` on any missing/invalid token.
 */
export function createAuthenticate(deps: { verifyToken?: TokenVerifier } = {}): RequestHandler {
  const verifyToken = deps.verifyToken ?? defaultVerifyToken;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Production hot path: trust the gateway-verified claims — no crypto here.
    const claims = extractGatewayClaims(req);
    if (claims?.sub) {
      req.auth = toAuthContext(claims);
      next();
      return;
    }

    // Local-dev / unit-test fallback: verify the id token in-process.
    if (loadConfig().authLocalVerify) {
      const token = readBearerToken(req);
      if (!token) {
        unauthenticated(res);
        return;
      }
      try {
        const payload = await verifyToken(token);
        req.auth = toAuthContext(payload);
        next();
      } catch {
        unauthenticated(res);
      }
      return;
    }

    // No gateway claims and not in local-verify mode → reject (defensive; the gateway
    // authorizer should have already blocked such requests before the Lambda ran).
    unauthenticated(res);
  };
}

/** Default middleware instance used by the app wiring. */
export const authenticate = createAuthenticate();
