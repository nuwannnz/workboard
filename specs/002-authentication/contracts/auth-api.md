# Contract: Backend Auth & Identity API

Base: API Gateway → single Express Lambda. All request/response bodies are JSON and
validated against the shared Zod schemas in `libs/shared`. Registration, verification,
and login SRP happen **client-side** against Cognito; the backend exposes only the
identity boundary, one representative protected resource, and a resend helper.

## Authentication boundary (API Gateway Cognito authorizer + middleware)

Protected methods are guarded first at the **API Gateway edge** by a
`CognitoUserPoolsAuthorizer` (result caching enabled), then read by a thin Express
middleware.

- **Client** sends `Authorization: Bearer <idToken>` on protected requests.
- **API Gateway** verifies the token signature/expiry against the user pool and caches
  the authorizer result per token (TTL ≈300s):
  - **Failure** (missing / malformed / expired / tampered / wrong pool): API Gateway
    returns `401` **before invoking the Lambda** — no Express/controller code runs
    (FR-009). The response is generic and reveals no factor detail (FR-005).
  - **Success**: API Gateway forwards decoded claims to the Lambda in
    `event.requestContext.authorizer.claims`.
- **`middleware/authenticate.ts`** (crypto-free in production) reads those claims and
  attaches `req.auth = { sub, email, username }`, then calls `next()`. Running outside API
  Gateway (local dev / unit tests), it falls back to verifying the id token in-process with
  `aws-jwt-verify` (`tokenUse: "id"`), gated by `AUTH_LOCAL_VERIFY`, and returns
  `401 { "error": "unauthenticated" }` on failure.

## Endpoints

### `GET /me` — authenticated profile (protected)

Proves the identity boundary and lazily bootstraps the account profile (FR-010).

- **Auth**: required (API Gateway Cognito authorizer, then middleware).
- **Behavior**: `auth.controller` reads `req.auth.sub`; `auth.service` asks
  `profile.repository` to get-or-create `PK=USER#<sub>, SK=PROFILE#<sub>`.
- **200**:
  ```json
  { "id": "<sub>", "email": "user@example.com" }
  ```
  Validated against `meResponseSchema`.
- **401**: no/invalid token — returned by the API Gateway authorizer before the Lambda is
  invoked (or by the local-dev fallback when running without a gateway).

### `POST /auth/resend-verification` — resend email code (public)

Covers the "code expired / never arrived" edge cases (FR-003).

- **Auth**: none.
- **Request** (`resendVerificationRequestSchema`):
  ```json
  { "email": "user@example.com" }
  ```
- **200 (always, neutral)**:
  ```json
  { "status": "ok" }
  ```
  Returns the same body whether or not the email exists — no account enumeration
  (FR-001, FR-005). Backend calls Cognito `ResendConfirmationCode` via
  `@aws-sdk/client-cognito-identity-provider`; provider errors are not reflected to the
  caller beyond the neutral response, except infrastructure-unreachable which maps to
  `503` (FR-015).
- **400**: malformed email (shared schema validation).
- **503**: identity provider unreachable — `{ "error": "try_again_later" }` (FR-015).

### Data-isolation guarantee (applies to `/me` and all future protected resources)

- The repository derives `PK` **only** from `req.auth.sub`; it never trusts a
  caller-supplied owner id.
- A request whose identity does not own the addressed item receives the same response as
  a non-existent item (not-found / empty), disclosing nothing (FR-011, SC-003).
- There is no admin/cross-user code path.

## Client-side Cognito operations (not backend endpoints — documented for completeness)

Performed by the frontend `cognito-client.ts` via `amazon-cognito-identity-js`:

| Operation | Cognito call | Notes |
|-----------|--------------|-------|
| Register | `signUp(email, password)` | `UsernameExistsException` → neutral success (no enumeration) |
| Verify | `confirmRegistration(email, code)` | Transitions account to CONFIRMED |
| Login | `authenticateUser` (SRP) | `UserNotConfirmedException` → route to verify; wrong creds → generic error |
| Refresh | `getSession` / `refreshSession` | Silent renew when access token expired |
| Logout | `signOut` + clear token store | No residual credentials (FR-007) |

## Error-message policy

- Login/credential failures: single generic **"invalid email or password"** (FR-005).
- Registration with existing email: neutral success identical to first-time signup
  (FR-001).
- Provider/network failure: explicit **"try again later"** state, never a silent failure
  or false success (FR-015).
- Throttled/blocked attempts (Cognito): generic failure that does not disclose account
  existence (FR-012, SC-007).
