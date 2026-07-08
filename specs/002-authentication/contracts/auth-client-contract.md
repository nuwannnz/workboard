# Contract: Frontend Auth Client, Platform Token Store & Protected Routing

Defines the frontend-internal interfaces the auth feature area exposes to the rest of the
shared codebase (Principle II). One implementation of the UI/state; two platform storage
implementations behind the existing adapter.

## Platform adapter extension (token store)

`platform/platform.ts` gains a secure token-store surface; `web.ts` and `tauri.ts`
implement it (no per-target fork of app code).

```ts
export interface TokenBundle {
  accessToken: string;
  idToken: string;
  refreshToken: string;
}

export interface TokenStore {
  /** Load persisted tokens on app start, or null if none. */
  load(): Promise<TokenBundle | null>;
  /** Persist tokens after login / refresh. */
  save(tokens: TokenBundle): Promise<void>;
  /** Remove all tokens on logout (no residual credentials — FR-007). */
  clear(): Promise<void>;
}

export interface PlatformAdapter {
  readonly name: 'web' | 'desktop';
  isDesktop(): boolean;
  readonly tokenStore: TokenStore; // NEW
}
```

- **web.ts**: `localStorage`-backed store (see research §3 trade-off note).
- **tauri.ts**: OS-secure store (`@tauri-apps/plugin-store` / keychain) so nothing
  sensitive persists in plaintext on the desktop (Story 4).

## Auth context / hook

`useAuth()` (backed by `auth-context.tsx`) exposes the session state machine:

```ts
type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated';

interface AuthApi {
  status: AuthStatus;
  user: { id: string; email: string } | null;

  register(input: { email: string; password: string }): Promise<
    { ok: true } | { ok: false; fieldErrors?: Record<string, string> }
  >; // neutral outcome on existing email (no enumeration)

  verify(input: { email: string; code: string }): Promise<{ ok: boolean; error?: string }>;
  resendVerification(email: string): Promise<void>; // always resolves (neutral)

  login(input: { email: string; password: string }): Promise<
    | { ok: true }
    | { ok: false; reason: 'invalid' | 'unverified' | 'unavailable' }
  >; // 'invalid' => generic message; 'unverified' => route to verify; 'unavailable' => try later

  logout(): Promise<void>; // clears token store + Cognito signOut
}
```

- On mount, status is `loading` while the token store rehydrates; if the id token is
  expired but the refresh token is valid, it silently refreshes before resolving to
  `authenticated` (FR-006). Guards render a neutral placeholder during `loading` to avoid
  a login flash.
- Validation uses the shared Zod schemas so field-level messages match the backend policy
  (FR-002, FR-014).

## API client

`api-client.ts` wraps `fetch` for protected calls:

- Attaches `Authorization: Bearer <idToken>` — the token the API Gateway Cognito
  authorizer verifies (see [auth-api.md](./auth-api.md) and research §2).
- On `401` (returned by the API Gateway authorizer, e.g. expired token), attempts one
  silent refresh; if that fails, transitions auth to `unauthenticated` and routes to
  `/login` (FR-006 expiry mid-use, Story 2.5). Note: because the authorizer result is
  cached per token for a short TTL, a freshly refreshed token is used on the retry.
- Base URL comes from build-time config (`VITE_API_BASE_URL` from the CDK `ApiBaseUrl`
  output) — never hard-coded, never a committed secret.

## Protected routing

`app/router.tsx` using `react-router-dom` v6:

| Path | Access | Renders |
|------|--------|---------|
| `/login` | public | `LoginScreen` |
| `/register` | public | `RegisterScreen` |
| `/verify` | public | `VerifyScreen` |
| `/*` (app) | **protected** | `AppShell` (+ future feature routes) behind `require-auth` |

- `require-auth.tsx`: if `status === 'authenticated'` render children; if
  `'unauthenticated'` redirect to `/login`; if `'loading'` show placeholder (FR-008).
- Authenticated users visiting a public auth route are redirected into the app.
- Identical behavior under the PWA and Tauri desktop shell (Principle II, FR-014); auth
  screens are responsive and built from shared shadcn/ui.

## UX state coverage

- Field-level validation errors on register (email format, password policy) — FR-002.
- Generic "invalid email or password" on login failure — FR-005.
- "Try again later" state on provider/network failure during register/verify/login —
  FR-015.
- Guided path from `unverified` login to the verify screen, with resend — FR-003.
