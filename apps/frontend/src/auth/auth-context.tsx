import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { registerRequestSchema, verifyRequestSchema, loginRequestSchema } from '@workboard/shared';
import type { TokenBundle, TokenStore } from '../platform/platform';
import { getPlatform } from '../platform';
import { CognitoClient } from './cognito-client';

/** Maps a Zod parse error to `{ field: message }` for field-level form feedback. */
function toFieldErrors(error: { issues: { path: (string | number)[]; message: string }[] }): Record<
  string,
  string
> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? 'form');
    if (!fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  return fieldErrors;
}

export type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated';

export interface AuthUser {
  id: string;
  email: string;
}

/** Public session API exposed via `useAuth()` (contracts/auth-client-contract.md). */
export interface AuthApi {
  status: AuthStatus;
  user: AuthUser | null;

  register(input: {
    email: string;
    password: string;
  }): Promise<{ ok: true } | { ok: false; fieldErrors?: Record<string, string> }>;

  verify(input: { email: string; code: string }): Promise<{ ok: boolean; error?: string }>;
  resendVerification(email: string): Promise<void>;

  login(input: {
    email: string;
    password: string;
  }): Promise<{ ok: true } | { ok: false; reason: 'invalid' | 'unverified' | 'unavailable' }>;

  logout(): Promise<void>;
}

export const AuthContext = createContext<AuthApi | undefined>(undefined);

interface IdTokenClaims {
  sub?: string;
  email?: string;
  'cognito:username'?: string;
  exp?: number;
}

/** Decodes a Cognito id token's payload (base64url JSON). */
function decodeClaims(idToken: string): IdTokenClaims | null {
  try {
    return JSON.parse(atob(idToken.split('.')[1])) as IdTokenClaims;
  } catch {
    return null;
  }
}

/** Derives the app user `{ id, email }` from an id token. */
export function decodeIdToken(idToken: string): AuthUser | null {
  const claims = decodeClaims(idToken);
  if (!claims?.sub || !claims.email) return null;
  return { id: claims.sub, email: claims.email };
}

/** True when the id token has no `exp` or its `exp` is in the past (small clock skew). */
function isTokenExpired(idToken: string): boolean {
  const claims = decodeClaims(idToken);
  if (!claims?.exp) return true;
  return claims.exp * 1000 <= Date.now() + 5_000;
}

/** The Cognito username needed to refresh — prefers `cognito:username`, falls back to email/sub. */
function usernameFromToken(idToken: string): string | null {
  const claims = decodeClaims(idToken);
  return claims?.['cognito:username'] ?? claims?.email ?? claims?.sub ?? null;
}

export interface AuthProviderProps {
  children: ReactNode;
  /** Injectable for tests; defaults to the real Cognito client. */
  cognito?: CognitoClient;
  /** Injectable for tests; defaults to the active platform's token store. */
  tokenStore?: TokenStore;
}

/**
 * Auth backbone (T020). Holds the session state machine (`loading` → `unauthenticated` /
 * `authenticated`), the current user, and the live id token used by the API client. The
 * per-story methods (register/verify in US1, login/rehydrate in US2, logout in US4) are
 * layered on in their tasks.
 */
export function AuthProvider({ children, cognito, tokenStore }: AuthProviderProps) {
  const client = useMemo(() => cognito ?? new CognitoClient(), [cognito]);
  const store = useMemo(() => tokenStore ?? getPlatform().tokenStore, [tokenStore]);

  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  /** Live id token for the API client (kept in a ref so reads are always current). */
  const idTokenRef = useRef<string | null>(null);

  /** Adopt a fresh token bundle: persist it, decode the user, mark authenticated. */
  const applySession = useCallback(
    async (tokens: TokenBundle): Promise<boolean> => {
      const decoded = decodeIdToken(tokens.idToken);
      if (!decoded) return false;
      idTokenRef.current = tokens.idToken;
      await store.save(tokens);
      setUser(decoded);
      setStatus('authenticated');
      return true;
    },
    [store],
  );

  /** Tear down the session: clear tokens + user, mark unauthenticated. */
  const clearSession = useCallback(async (): Promise<void> => {
    idTokenRef.current = null;
    await store.clear();
    setUser(null);
    setStatus('unauthenticated');
  }, [store]);

  // Rehydrate the session on mount (T034, FR-006): load persisted tokens; if the id token
  // is still valid, adopt it; if it is expired but a refresh token is present, silently
  // refresh; otherwise resolve to `unauthenticated`.
  useEffect(() => {
    let active = true;
    (async () => {
      const tokens = await store.load().catch(() => null);
      if (!active) return;
      if (!tokens) {
        setStatus('unauthenticated');
        return;
      }
      if (!isTokenExpired(tokens.idToken) && decodeIdToken(tokens.idToken)) {
        await applySession(tokens);
        return;
      }
      const username = usernameFromToken(tokens.idToken);
      if (username) {
        try {
          const refreshed = await client.refreshSession(tokens.refreshToken, username);
          if (!active) return;
          const ok = await applySession(refreshed);
          if (ok) return;
        } catch {
          /* fall through to clear */
        }
      }
      if (active) await clearSession();
    })();
    return () => {
      active = false;
    };
  }, [store, client, applySession, clearSession]);

  const register = useCallback<AuthApi['register']>(
    async (input) => {
      const parsed = registerRequestSchema.safeParse(input);
      if (!parsed.success) {
        return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
      }
      try {
        await client.signUp(parsed.data.email, parsed.data.password);
        return { ok: true };
      } catch {
        // Provider/network failure — the screen shows a "try again later" state (FR-015).
        return { ok: false };
      }
    },
    [client],
  );

  const verify = useCallback<AuthApi['verify']>(
    async (input) => {
      const parsed = verifyRequestSchema.safeParse(input);
      if (!parsed.success) {
        return { ok: false, error: 'invalid_input' };
      }
      try {
        await client.confirmRegistration(parsed.data.email, parsed.data.code);
        return { ok: true };
      } catch {
        return { ok: false, error: 'invalid_or_expired_code' };
      }
    },
    [client],
  );

  const resendVerification = useCallback<AuthApi['resendVerification']>(
    async (email) => {
      // Always resolves neutrally — never disclose whether the email exists (FR-001).
      try {
        await client.resendConfirmationCode(email);
      } catch {
        /* swallow — neutral outcome */
      }
    },
    [client],
  );

  const login = useCallback<AuthApi['login']>(
    async ({ email, password }) => {
      const parsed = loginRequestSchema.safeParse({ email, password });
      if (!parsed.success) {
        return { ok: false, reason: 'invalid' };
      }
      try {
        const tokens = await client.authenticate(parsed.data.email, parsed.data.password);
        const ok = await applySession(tokens);
        return ok ? { ok: true } : { ok: false, reason: 'unavailable' };
      } catch (err) {
        const name = (err as { name?: string }).name;
        if (name === 'UserNotConfirmedException') return { ok: false, reason: 'unverified' };
        if (name === 'NotAuthorizedException' || name === 'UserNotFoundException') {
          return { ok: false, reason: 'invalid' };
        }
        // Anything else (network / provider outage) is a "try again later" case (FR-015).
        return { ok: false, reason: 'unavailable' };
      }
    },
    [client, applySession],
  );

  const logout = useCallback<AuthApi['logout']>(async () => {
    try {
      await client.signOut();
    } catch {
      /* best-effort — always clear locally regardless (FR-007) */
    }
    await clearSession();
  }, [client, clearSession]);

  const value: AuthApi = {
    status,
    user,
    register,
    verify,
    resendVerification,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
