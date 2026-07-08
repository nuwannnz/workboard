# Phase 0 Research: Stage 2 — Authentication & Data Isolation

All Technical Context items are inherited from Stage 1 and were already resolved; the
only open questions are auth-specific integration choices. Each is decided below.

## 1. Frontend ↔ Cognito integration library

- **Decision**: Use `amazon-cognito-identity-js` directly against the existing public
  app client, driving SRP for `signUp`, `confirmRegistration` (email code),
  `resendConfirmationCode`, `authenticateUser`, `getSession` (refresh), and
  `signOut`.
- **Rationale**: The Stage 1 app client is already configured with
  `authFlows: { userSrp: true }` and no client secret — exactly what this library
  expects. It ships the SRP implementation client-side, so passwords never transit the
  app in plaintext and the app never stores credentials (FR-013). It is a focused
  dependency with no build/runtime bloat, satisfying YAGNI (Principle VI).
- **Alternatives considered**:
  - *AWS Amplify Auth v6* — fully featured but a much larger dependency surface and its
    own config/singleton model; overkill for email/password only (rejected by
    Principle VI).
  - *Direct `@aws-sdk/client-cognito-identity-provider` from the browser with
    `USER_PASSWORD_AUTH`* — would require enabling a non-SRP flow and sends the raw
    password to Cognito over TLS rather than using SRP; weaker posture and an infra
    change for no benefit (rejected).

## 2. Token verification at the boundary (API Gateway Cognito authorizer)

- **Decision**: Verify the Cognito JWT at the **API Gateway edge** using a native
  **`CognitoUserPoolsAuthorizer`** attached to every protected method, with authorizer
  **result caching** enabled (`resultsCacheTtl`, keyed on the `Authorization` header
  token). API Gateway validates the token's signature and expiry against the user pool
  and returns `401` for missing/malformed/expired/tampered tokens **before the request
  reaches the Lambda** — no controller or Express code runs on a rejected request
  (FR-009). On success, API Gateway forwards the decoded claims to the Lambda in
  `event.requestContext.authorizer.claims`. The Express `authenticate` middleware becomes
  a thin, crypto-free extractor that reads those claims (`sub`, `email`, `username`) and
  attaches `req.auth`. For **local development and unit tests** (where there is no API
  Gateway in front of Express), the same middleware falls back to verifying the token
  in-process with `aws-jwt-verify`, gated by an env flag (e.g. `AUTH_LOCAL_VERIFY`).
- **Token used**: the **id token** is sent in the `Authorization` header for protected
  requests. The Cognito authorizer verifies it and exposes user attributes — importantly
  `email` — in the forwarded claims, which the profile bootstrap needs. This app has no
  OAuth scopes / resource server, so the access-token-for-authorization distinction adds
  no value here; the id token is the pragmatic, well-documented choice for a Cognito
  authorizer that needs user attributes downstream. The local-dev fallback verifies with
  `tokenUse: "id"` to match.
- **Rationale**:
  - Satisfies the constitution's "validated at the **API Gateway**/middleware boundary"
    even more literally — verification happens at the edge, so invalid traffic never
    reaches (or bills) the Lambda.
  - **Caching** (the user's request): the authorizer result is cached per token for the
    configured TTL, so repeated calls with the same token skip re-verification, cutting
    latency and JWKS work. TTL is kept modest (e.g. 300s) so token revocation/expiry
    still takes effect promptly.
  - Removes JWT crypto from the request hot path in application code; the middleware just
    trusts claims the platform already verified. `aws-jwt-verify` is retained only as a
    dev-loop convenience so `nx serve backend` and Vitest work without a real gateway.
- **Trade-offs / notes**:
  - The proxy API must be split so **public** endpoints (`/health`,
    `POST /auth/resend-verification`) have **no** authorizer while protected paths
    (`/me` and future feature routes) sit behind the authorizer — see §10.
  - Authorizer caching means a token that expires *within* the TTL window can still be
    accepted until the cache entry ages out; a short TTL bounds this. Acceptable for this
    MVP.
- **Alternatives considered**:
  - *Verify in Express middleware with `aws-jwt-verify` on every request* (the previous
    plan) — works and is testable, but does the crypto inside the Lambda on every call,
    can't cache across invocations as effectively as the gateway, and lets unauthenticated
    requests reach and bill the Lambda (rejected in favor of edge verification per user
    direction; kept only as the local-dev fallback).
  - *Custom Lambda (REQUEST) authorizer* — needed only if we required scope-based
    authorization or custom logic; unnecessary here and adds a second Lambda (rejected,
    Principle VI).
  - *Access token instead of id token at the authorizer* — valid, but the access token
    omits `email`, forcing an extra lookup for the profile bootstrap for no benefit in a
    scope-less app (rejected).

## 3. Session persistence across reload / desktop restart

- **Decision**: Persist Cognito tokens (id/access/refresh) behind an **extended platform
  adapter** token-store interface. Web implementation uses `localStorage`; the Tauri
  desktop implementation uses a secure store (`@tauri-apps/plugin-store` / OS keychain
  binding). On app start, the auth context rehydrates from the store and, if the access
  token is expired but the refresh token is valid, silently refreshes via
  `getSession`; logout clears the store (FR-006, FR-007, Story 4 "no cached credentials").
- **Rationale**: Requests authorize with the bearer **id token** in the `Authorization`
  header (verified by the API Gateway Cognito authorizer, §2 — not cookies), so the token
  must be readable by app code — `localStorage` is the pragmatic web choice for an MVP and
  is explicitly scoped by the spec's assumptions. Routing storage through the existing `platform/` adapter keeps one
  shared codebase (Principle II) while letting desktop use OS-secured storage, honoring
  Story 4's "no residual access on a shared device."
- **Trade-off noted**: `localStorage` is XSS-readable. Mitigations for this MVP: strict
  CSP from the shared shell, no third-party scripts, and refresh-token rotation from
  Cognito. Moving the refresh token to an httpOnly cookie is a documented future option
  and out of scope now (Principle VI).
- **Alternatives considered**:
  - *httpOnly cookie sessions* — would require a cookie/session layer and CSRF handling
    incompatible with the current stateless bearer-token API Gateway proxy (rejected for
    this stage).
  - *In-memory only* — fails FR-006 (survive reload/restart) (rejected).

## 4. Protected routing in the frontend

- **Decision**: Introduce `react-router-dom` v6. Public routes render the auth screens;
  a `require-auth` guard renders the existing `AppShell` (and all future feature routes)
  only when authenticated, redirecting to `/login` otherwise. While the auth context is
  rehydrating, a neutral loading state is shown to avoid a login flash.
- **Rationale**: The Stage 1 frontend renders a single `AppShell` with no routing; a
  router is the minimal standard way to gate the protected shell (FR-008) and host the
  register/verify/login screens. `react-router-dom` is the de-facto React router, small,
  and works identically under the PWA and Tauri (Principle II).
- **Alternatives considered**: *TanStack Router* (more type-safe but heavier/newer for
  this simple need) and *hand-rolled conditional rendering* (doesn't scale to feature
  routes and complicates deep links) — both rejected for simplicity.

## 5. Email ownership verification

- **Decision**: Use Cognito's built-in email verification. The Stage 1 pool has
  `selfSignUpEnabled: true` and `autoVerify: { email: true }`, so `signUp` triggers a
  verification code email; the user submits it via `confirmRegistration`, and
  `resendConfirmationCode` covers the "code expired / never arrived" edge cases. Login is
  refused for unconfirmed accounts (`UserNotConfirmedException`) and the UI routes the
  user to the verify screen (FR-003, Story 1/2, edge cases).
- **Rationale**: Verification is native to Cognito, requires no app-side token store, and
  matches the spec's stated assumption that email verification precedes first login.
- **Alternatives considered**: *App-managed verification tokens in DynamoDB* — duplicates
  what Cognito already does and would store verification state the app shouldn't own
  (rejected, Principle IV/VI).

## 6. Duplicate registration without account enumeration

- **Decision**: On `UsernameExistsException`, return the same neutral
  "check your email to continue" outcome the happy path shows, and never reveal whether
  the email exists or is verified (FR-001, FR-005, Acceptance Scenario 1.3). Login
  failures return a single generic "invalid email or password" regardless of whether the
  cause is unknown email or wrong password.
- **Rationale**: Prevents account enumeration as required; keeps messaging uniform across
  both platforms from the shared codebase (FR-014).

## 7. Brute-force throttling / lockout

- **Decision**: Rely on Cognito's built-in protections. Cognito automatically
  rate-limits and temporarily blocks repeated failed authentication attempts per user and
  returns generic failures, satisfying FR-012/SC-007 without disclosing account existence.
  The plan documents this posture and adds a note that Cognito's advanced security
  (adaptive/compromised-credentials) is a *feature-plan* option that can be enabled later
  in `auth-stack.ts` if a stricter policy is specified.
- **Rationale**: The spec assumes "identity provider's standard/recommended defaults
  unless a stricter policy is later specified," so leaning on native protections avoids
  building custom lockout state (Principle VI). The e2e/integration test asserts that a
  burst of wrong-password attempts yields throttled/blocked generic failures.
- **Alternatives considered**: *Custom failed-attempt counters in DynamoDB* — reinvents
  Cognito behavior and adds cross-user-sensitive state (rejected).

## 8. Password strength policy

- **Decision**: Enforce the existing Cognito pool policy (min length 8, requires
  lowercase and digits) as the source of truth, and mirror it in a shared Zod schema
  (`libs/shared`) for immediate client-side field-level validation before the network
  call (FR-002, FR-014). The two stay in sync by construction — the Zod rule encodes the
  same policy set in `auth-stack.ts`.
- **Rationale**: Client validation gives instant, consistent feedback on both platforms;
  Cognito remains the authoritative enforcer so the policy can't be bypassed by calling
  the API directly.

## 9. Representative protected resource for isolation proof

- **Decision**: Bootstrap a minimal **account profile** item on first authenticated
  request — `PK = USER#<sub>`, `SK = PROFILE#<sub>` — and expose `GET /me`. The
  `profile.repository.ts` derives the key solely from the authenticated `sub`, so a
  request can only ever read/write its own item; a request for another user's profile key
  returns not-found with no disclosure (FR-010, FR-011, SC-003). This proves the isolation
  boundary against a real owned resource without creating feature data (Tasks/Projects/
  Notes remain out of scope).
- **Rationale**: The spec requires proving isolation "against a representative protected
  resource" while creating no feature data; a self-scoped profile is the smallest such
  resource and doubles as the account record later stages attach ownership to.

## 10. API Gateway resource layout (public vs. protected)

- **Decision**: Replace the Stage 1 catch-all `LambdaRestApi({ proxy: true })` with an
  explicit split so the Cognito authorizer applies only to protected paths:
  - **Public** (no authorizer): `GET /health`, `POST /auth/resend-verification`.
  - **Protected** (Cognito authorizer + result caching): `GET /me` and a greedy
    `/{proxy+}` for future feature routes.
  - All methods still integrate the **single** backend Lambda (the Express app continues
    to route internally), preserving the one-Lambda architecture (Principle I). API
    Gateway matches specific public paths ahead of the greedy protected proxy.
- **Rationale**: A single proxy-all resource can only carry one authorizer setting;
  splitting is required so registration-adjacent public calls and the health probe stay
  reachable while everything else is gated. Keeping one Lambda behind all methods avoids
  fragmenting the backend.
- **Implementation note**: `identitySource` = `method.request.header.Authorization`;
  `resultsCacheTtl` set to a modest value (≈300s). CDK outputs already surface
  `UserPoolId`/`UserPoolClientId`; the authorizer references the imported user pool.
- **Alternatives considered**: *Keep `proxy: true` and authorize inside Express* — simpler
  infra but defeats the user's goal of edge verification + caching (rejected). *Separate
  Lambdas per public/protected* — violates the single-Lambda constitution (rejected).

## Summary of new dependencies

| Package | Layer | Purpose |
|---------|-------|---------|
| `amazon-cognito-identity-js` | frontend | SRP register/verify/login/refresh/logout against Cognito |
| API Gateway `CognitoUserPoolsAuthorizer` (CDK) | infra | Verify the id token at the edge + cache the result; no runtime dep |
| `aws-jwt-verify` | backend | **Local-dev/test fallback only** — verify the id token in-process when not behind API Gateway |
| `react-router-dom` | frontend | Public auth routes vs. protected shell/guard |
| `@aws-sdk/client-cognito-identity-provider` | backend | Only where a server-side Cognito call is needed (e.g., resend helper); externalized like other AWS SDK v3 modules |
| Tauri secure store (`@tauri-apps/plugin-store` / keychain) | frontend (desktop impl) | Secure token persistence on the desktop target |

All choices comply with the constitution; no NEEDS CLARIFICATION remain.
