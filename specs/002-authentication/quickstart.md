# Quickstart: Stage 2 — Authentication & Data Isolation

Validation/run guide proving the auth feature end-to-end. Implementation details live in
[data-model.md](./data-model.md), [contracts/](./contracts/), and `tasks.md`.

## Prerequisites

- Stage 1 complete and the CDK stack deployed (or `cdk deploy` run), providing the
  `UserPoolId`, `UserPoolClientId`, and `ApiBaseUrl` stack outputs.
- Deployed API Gateway has the **Cognito User Pools authorizer** attached to protected
  methods (result caching ≈300s), with `/health` and `/auth/resend-verification` left
  public — provisioned in `api-stack.ts`.
- Node 22 (`.nvmrc`), dependencies installed once at the workspace root (`npm install`),
  including the new deps: `amazon-cognito-identity-js`, `aws-jwt-verify` (local-dev
  fallback verifier), `react-router-dom`, `@aws-sdk/client-cognito-identity-provider`.
- Frontend env: `VITE_API_BASE_URL`, `VITE_COGNITO_USER_POOL_ID`,
  `VITE_COGNITO_CLIENT_ID` set from the CDK outputs (never committed).
- Backend env: `WORKBOARD_TABLE_NAME`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`,
  `AWS_REGION`, and `AUTH_LOCAL_VERIFY=true` for local runs (so the middleware verifies
  the id token in-process when no API Gateway is in front). Local dev uses DynamoDB Local
  for the profile item.
- A test inbox you control for the verification email (SC-001).

## Run locally (all via Nx targets — Principle V)

```bash
nx serve backend        # Express app with the auth middleware + /me, /auth/* routes
nx serve frontend       # PWA with the protected router and auth screens
# desktop: nx run frontend:tauri   # same shared UI in the Tauri shell
```

## Manual validation — core flow (Story 1→4, SC-001)

1. Open the app → you are redirected to `/login` (not authenticated) — **FR-008**.
2. Go to **Register**, submit a new email + a policy-compliant password → neutral
   "check your email" state; a verification code is emailed — **FR-001/FR-003**.
   - Submit a weak password or bad email → field-level errors, no account — **FR-002**.
   - Register again with the **same** email → identical neutral outcome (no
     enumeration) — **Acceptance 1.3**.
3. Enter the emailed code on **Verify** → account becomes verified/eligible — **FR-003**.
   - Use **Resend** if the code expired → new code, no duplicate account — **edge case**.
4. **Login** with the verified credentials → protected `AppShell` loads — **FR-004**.
   - Wrong password / unknown email → single generic "invalid email or password" —
     **FR-005**.
   - Login before verifying → refused, routed to verify — **Story 2.4**.
5. **Reload** the page and **relaunch** the desktop app → still authenticated, no
   re-entry — **FR-006 / SC-004**.
6. **Logout** → returned to `/login`; reload → still logged out; no cached credentials on
   desktop — **FR-007 / Story 4**.

## Manual validation — data isolation (Story 3, SC-003)

1. Authenticated, call `GET /me` (or observe the app's profile load) → returns your
   `{ id, email }`; identity is available to the handler — **FR-010 / Acceptance 3.2**.
2. Call any protected route with no / tampered / expired token → `401`. Deployed, this is
   returned by the API Gateway Cognito authorizer before the Lambda is invoked; locally it
   comes from the `authenticate` fallback — **FR-009 / Acceptance 3.1, 3.3**.
3. As user B, attempt to read user A's profile key → responds as not-found, no data
   disclosed — **FR-011 / Acceptance 3.4 / SC-003**.

## Automated test commands (Principle III)

```bash
nx test backend         # Vitest: authenticate middleware reads gateway claims + rejects bad
                        #         tokens via the local fallback; profile repository enforces
                        #         PK=USER#<sub>; cross-user get => not-found
nx test infra           # Vitest: api-stack attaches the Cognito authorizer to protected
                        #         methods and leaves /health + /auth/* public
nx test frontend        # Vitest: auth context state machine, shared-schema validation,
                        #         require-auth guard redirects
nx test shared          # Vitest: register/login/verify/me Zod schemas
nx e2e frontend-e2e     # Playwright: register -> verify -> login -> access -> logout,
                        #             unauthenticated denial, cross-user denial,
                        #             throttled repeated failed logins
```

## Expected outcomes (maps to Success Criteria)

- **SC-002**: every protected route + the app shell reject access without a session.
- **SC-003**: 100% of cross-user access attempts denied with no disclosure (e2e).
- **SC-004**: session survives reload + desktop restart until expiry, then routes to login.
- **SC-005**: invalid-credential logins return the generic message (no enumeration).
- **SC-006**: the full flow passes as e2e on both PWA and desktop from the shared code.
- **SC-007**: repeated failed logins are throttled/blocked without disclosing existence.
- **SC-008**: no password/secret in source, DB, or the shipped bundle — verified by
  review + a grep/security check in CI.

## CI

GitHub Actions runs lint + all Vitest suites + Playwright on every PR; `main` stays
green and protected (Principle III). SC-008 is enforced by a bundle/secret scan step.
