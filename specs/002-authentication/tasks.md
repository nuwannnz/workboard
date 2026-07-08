---
description: "Task list for Stage 2 — Authentication & Data Isolation"
---

# Tasks: Stage 2 — Authentication & Data Isolation

**Input**: Design documents from `/specs/002-authentication/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ (auth-api.md, auth-client-contract.md) ✅

**Tests**: INCLUDED — the feature spec mandates them (FR-016) and Constitution Principle III (Test-First) is NON-NEGOTIABLE. Within each phase, test tasks are written first and MUST fail before the matching implementation task.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US4)
- All paths are repository-relative and follow the Nx layout in plan.md

## Path Conventions (from plan.md — Nx monorepo)

- Frontend: `apps/frontend/src/`
- Backend: `apps/backend/src/`
- Shared: `libs/shared/src/`
- Infra (CDK): `apps/infra/lib/`
- E2E: `apps/frontend-e2e/src/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install and register the new dependencies and environment configuration for Stage 2. No feature behavior yet.

- [X] T001 Install new workspace dependencies at the repo root: `amazon-cognito-identity-js` and `react-router-dom` (frontend), `aws-jwt-verify` and `@aws-sdk/client-cognito-identity-provider` (backend), `@tauri-apps/plugin-store` (frontend desktop) — add to root `package.json` and run `npm install`
- [X] T002 [P] Register `@aws-sdk/client-cognito-identity-provider` (and keep `aws-jwt-verify`) as esbuild externals for the backend bundle in `apps/backend/project.json` (mirror the existing AWS SDK externalization), so the Lambda bundle stays lean
- [X] T003 [P] Add frontend build-time env vars to `apps/frontend/.env.example`: `VITE_API_BASE_URL`, `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID` (values sourced from CDK outputs; never committed)
- [X] T004 [P] Extend backend config loader `apps/backend/src/shared/config.ts` to read `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `AWS_REGION`, and `AUTH_LOCAL_VERIFY`, and document them in `apps/backend/.env.example`

**Checkpoint**: Dependencies installed and configuration wired — foundational work can begin.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared schemas, the identity boundary (infra authorizer + backend middleware + auth module skeleton), the frontend auth backbone (token store, Cognito wrapper, API client, auth context, protected router). These are prerequisites shared by ALL user stories.

**⚠️ CRITICAL**: No user story (Phase 3+) can be completed until this phase is done.

### Shared schemas (used by every story)

- [X] T005 [P] Write failing unit tests for the shared auth schemas in `libs/shared/src/schemas/auth.spec.ts` (valid/invalid email; password policy min-8 + lowercase + digit; verify code non-empty) per data-model.md §Validation rules
- [X] T006 [P] Create shared Zod schemas in `libs/shared/src/schemas/auth.ts`: `registerRequestSchema`, `verifyRequestSchema`, `resendVerificationRequestSchema`, `loginRequestSchema`, `meResponseSchema` (data-model.md §Shared schemas)
- [X] T007 Extend `libs/shared/src/schemas/user.ts` so `userSchema` exposes `{ id, email }`, and export the new auth schemas from `libs/shared/src/index.ts`

### Infrastructure — identity boundary (IaC)

- [X] T008 [P] Write failing infra test in `apps/infra/lib/stack.spec.ts` asserting the API attaches a `CognitoUserPoolsAuthorizer` (with `resultsCacheTtl`) to protected methods (`GET /me`, `/{proxy+}`) and leaves `GET /health` and `POST /auth/resend-verification` public (research.md §10)
- [X] T009 Extend `apps/infra/lib/auth-stack.ts`: ensure the app client enables `authFlows.userSrp`, set id/access/refresh token validity, and document the brute-force/lockout posture (research.md §7, §8)
- [X] T010 Rework `apps/infra/lib/api-stack.ts`: replace the Stage 1 catch-all `LambdaRestApi({ proxy: true })` with an explicit resource split — public `GET /health` and `POST /auth/resend-verification`, protected `GET /me` and greedy `/{proxy+}` behind the Cognito authorizer (`identitySource = method.request.header.Authorization`, `resultsCacheTtl ≈300s`), all still integrating the single backend Lambda (research.md §2, §10)

### Backend — authentication boundary & auth module skeleton

- [X] T011 [P] Write failing tests for `apps/backend/src/middleware/authenticate.spec.ts`: (a) reads `event.requestContext.authorizer.claims` and populates `req.auth = { sub, email, username }`; (b) local-dev fallback verifies an id token with `aws-jwt-verify` when `AUTH_LOCAL_VERIFY=true`; (c) returns `401 { error: "unauthenticated" }` on missing/malformed/expired/tampered token (contracts/auth-api.md)
- [X] T012 Implement `apps/backend/src/middleware/authenticate.ts`: crypto-free claims extractor in production; `aws-jwt-verify` (`tokenUse: "id"`) fallback gated by `AUTH_LOCAL_VERIFY` for local dev/tests (research.md §2)
- [X] T013 [P] Scaffold the self-contained auth module files under `apps/backend/src/modules/auth/`: `auth.routes.ts`, `auth.controller.ts`, `auth.service.ts`, `profile.repository.ts` (empty typed stubs wired together, thin controller) per plan.md structure
- [X] T014 Mount the auth router and apply the `authenticate` middleware to protected routes in `apps/backend/src/app.ts` (protected `/me`; public `/auth/resend-verification`)

### Frontend — auth backbone (shared codebase)

- [X] T015 [P] Extend the platform adapter contract in `apps/frontend/src/platform/platform.ts`: add `TokenBundle`, `TokenStore` (`load`/`save`/`clear`), and `tokenStore` on `PlatformAdapter` (contracts/auth-client-contract.md)
- [X] T016 [P] Implement the web token store (`localStorage`-backed) in `apps/frontend/src/platform/web.ts`
- [X] T017 [P] Implement the desktop token store (`@tauri-apps/plugin-store` / OS keychain) in `apps/frontend/src/platform/tauri.ts`
- [X] T018 [P] Create the Cognito SRP wrapper base in `apps/frontend/src/auth/cognito-client.ts`: initialize `CognitoUserPool` from `VITE_COGNITO_*` env (method stubs for signUp/confirm/resend/authenticate/getSession/signOut filled per story)
- [X] T019 [P] Create `apps/frontend/src/auth/api-client.ts`: `fetch` wrapper attaching `Authorization: Bearer <idToken>`, base URL from `VITE_API_BASE_URL`; on `401` attempt one silent refresh then route to `/login` (contracts/auth-client-contract.md §API client)
- [X] T020 Create the auth context skeleton in `apps/frontend/src/auth/auth-context.tsx` and hook `apps/frontend/src/auth/use-auth.ts`: `AuthStatus` state machine (`loading`/`unauthenticated`/`authenticated`), provider, `user` state (method bodies for register/verify/login/logout added in their stories) (contracts/auth-client-contract.md §Auth context)
- [X] T021 [P] Create the route guard `apps/frontend/src/auth/require-auth.tsx`: render children when `authenticated`, redirect to `/login` when `unauthenticated`, neutral placeholder while `loading` (FR-008)
- [X] T022 Create `apps/frontend/src/app/router.tsx` (`react-router-dom` v6): public `/login`, `/register`, `/verify`; protected `/*` rendering `AppShell` behind `require-auth`; redirect authenticated users away from public auth routes; wire the `AuthProvider` + router into `apps/frontend/src/main.tsx`

**Checkpoint**: Identity boundary, shared schemas, and frontend auth backbone exist. User stories can now be implemented (in parallel if staffed).

---

## Phase 3: User Story 1 - Register a new account (Priority: P1) 🎯 MVP

**Goal**: A visitor registers with email + password, receives a verification code, confirms email ownership (with resend support), and the account becomes eligible to log in — with duplicate-email and weak-password handling that discloses nothing.

**Independent Test**: Submit the register form with a new valid email + policy-compliant password → neutral "check your email" state; submit the emailed code on Verify → account verified; re-registering the same email yields the identical neutral outcome; weak password / bad email shows field-level errors and creates no account.

### Tests for User Story 1 ⚠️ (write first, must fail)

- [X] T023 [P] [US1] Vitest for register/verify auth-context behavior in `apps/frontend/src/auth/auth-context.register.spec.tsx`: neutral outcome on `UsernameExistsException`; field errors from shared schema on weak password/bad email; verify transitions state (contracts/auth-client-contract.md)
- [X] T024 [P] [US1] Vitest for `POST /auth/resend-verification` in `apps/backend/src/modules/auth/auth.resend.spec.ts`: always returns neutral `{ status: "ok" }`, `400` on malformed email, `503` when provider unreachable (contracts/auth-api.md)

### Implementation for User Story 1

- [X] T025 [US1] Implement `signUp`, `confirmRegistration`, and `resendConfirmationCode` in `apps/frontend/src/auth/cognito-client.ts`, mapping `UsernameExistsException` to a neutral success (no enumeration) (research.md §5, §6)
- [X] T026 [US1] Implement `register`, `verify`, and `resendVerification` methods in `apps/frontend/src/auth/auth-context.tsx` using the shared schemas for field-level validation (returns per the `AuthApi` contract)
- [X] T027 [P] [US1] Build `RegisterScreen` in `apps/frontend/src/auth/screens/register-screen.tsx` (shared shadcn/ui, responsive; field-level validation + neutral submit outcome + "try again later" on provider/network failure) (FR-002, FR-014, FR-015)
- [X] T028 [P] [US1] Build `VerifyScreen` in `apps/frontend/src/auth/screens/verify-screen.tsx` (code entry + Resend action) (FR-003)
- [X] T029 [US1] Implement the resend helper end-to-end on the backend: `auth.routes.ts` (public `POST /auth/resend-verification`) → `auth.controller.ts` → `auth.service.ts` calling Cognito `ResendConfirmationCode` via `@aws-sdk/client-cognito-identity-provider`; always return neutral `{ status: "ok" }`, map unreachable provider to `503 { error: "try_again_later" }` (contracts/auth-api.md)

**Checkpoint**: Registration + email verification (with resend) works and is independently testable.

---

## Phase 4: User Story 2 - Log in and access the app (Priority: P1)

**Goal**: A verified user logs in with email + password, the protected `AppShell` loads, and the session persists across page reload and desktop restart (with silent refresh) until expiry or logout.

**Independent Test**: Log in with valid verified credentials → protected shell loads; reload page / relaunch desktop → still authenticated with no re-entry; wrong password/unknown email → single generic "invalid email or password"; login before verifying → refused and routed to Verify.

### Tests for User Story 2 ⚠️ (write first, must fail)

- [X] T030 [P] [US2] Vitest for login + session rehydration in `apps/frontend/src/auth/auth-context.login.spec.tsx`: generic failure on wrong creds, `unverified` reason routes to verify, `unavailable` on provider error, and rehydrate-from-store on mount with silent refresh of an expired access token (FR-005, FR-006, Story 2.4/2.5)
- [X] T031 [P] [US2] Vitest for `require-auth` redirect + authenticated pass-through in `apps/frontend/src/auth/require-auth.spec.tsx`

### Implementation for User Story 2

- [X] T032 [US2] Implement `authenticateUser` (SRP) and `getSession`/`refreshSession` in `apps/frontend/src/auth/cognito-client.ts`; surface `UserNotConfirmedException` distinctly for routing (research.md §1, §5)
- [X] T033 [US2] Implement the `login` method in `apps/frontend/src/auth/auth-context.tsx` returning `{ ok }` / `{ ok:false, reason: 'invalid' | 'unverified' | 'unavailable' }`; persist the token bundle via `platform.tokenStore.save` (contracts/auth-client-contract.md)
- [X] T034 [US2] Implement session rehydration on mount in `apps/frontend/src/auth/auth-context.tsx`: load tokens from `platform.tokenStore`, silently refresh an expired access token when the refresh token is valid, resolve `authenticated`/`unauthenticated` (FR-006)
- [X] T035 [US2] Build `LoginScreen` in `apps/frontend/src/auth/screens/login-screen.tsx` (shared shadcn/ui, responsive): generic "invalid email or password", guided path to Verify on `unverified`, "try again later" on `unavailable` (FR-005, FR-014, FR-015)

**Checkpoint**: Login + persistent session works; combined with US1 a user can register → verify → log in → reach the shell.

---

## Phase 5: User Story 3 - Protected access & data isolation (Priority: P1)

**Goal**: Protected routes and the app shell are reachable only when authenticated; the verified identity is available to handlers before business logic; and a user can never read/write another user's data — cross-user access returns not-found with no disclosure. Proven against the representative account-profile resource via `GET /me`.

**Independent Test**: Call a protected route with no/tampered/expired token → `401` before any business logic; call `GET /me` with valid creds → returns `{ id, email }` from the handler; as user B request user A's profile key → responds as not-found, nothing disclosed.

### Tests for User Story 3 ⚠️ (write first, must fail)

- [X] T036 [P] [US3] Vitest for `profile.repository` ownership in `apps/backend/src/modules/auth/profile.repository.spec.ts`: `PK` derived only from `sub`; get-or-create at `PK=USER#<sub>, SK=PROFILE#<sub>`; a read resolving to another user's partition returns not-found (FR-011, SC-003)
- [X] T037 [P] [US3] Vitest for `GET /me` in `apps/backend/src/modules/auth/me.spec.ts`: `200 { id, email }` (validated by `meResponseSchema`) with valid claims; `401` when the authenticate middleware rejects (contracts/auth-api.md)

### Implementation for User Story 3

- [X] T038 [US3] Implement `apps/backend/src/modules/auth/profile.repository.ts`: get-or-create the account profile item using `@aws-sdk/lib-dynamodb`, deriving `PK=USER#<sub>`/`SK=PROFILE#<sub>` solely from the authenticated `sub`, with no caller-supplied owner and no cross-user/admin path (data-model.md §Account Profile)
- [X] T039 [US3] Implement `auth.service.ts` (profile bootstrap orchestration) and the thin `auth.controller.ts` for `GET /me` reading `req.auth.sub`/`email`; add the protected `GET /me` route to `auth.routes.ts` (contracts/auth-api.md)
- [X] T040 [US3] Verify/adjust `apps/backend/src/app.ts` so `authenticate` guards `GET /me` and the greedy protected proxy while `/auth/resend-verification` stays public (FR-008, FR-009)

**Checkpoint**: The data-isolation boundary is enforced and proven; unauthenticated and cross-user access are denied.

---

## Phase 6: User Story 4 - Log out (Priority: P2)

**Goal**: An authenticated user logs out — Cognito `signOut` plus clearing the platform token store — so subsequent protected access requires re-authentication and no residual credentials remain (important on desktop/shared devices).

**Independent Test**: Log in, invoke logout → session cleared and returned to `/login`; reload → still logged out; on desktop no cached tokens remain for silent re-entry.

### Tests for User Story 4 ⚠️ (write first, must fail)

- [X] T041 [P] [US4] Vitest for logout in `apps/frontend/src/auth/auth-context.logout.spec.tsx`: `logout` calls `platform.tokenStore.clear`, sets status `unauthenticated`, and clears `user` (FR-007, Story 4)

### Implementation for User Story 4

- [X] T042 [US4] Implement `signOut` in `apps/frontend/src/auth/cognito-client.ts` and the `logout` method in `apps/frontend/src/auth/auth-context.tsx` (Cognito `signOut` + `platform.tokenStore.clear`) (FR-007)
- [X] T043 [US4] Add a Log Out action to the authenticated shell in `apps/frontend/src/app/app-shell.tsx` that calls `logout()` and redirects to `/login`

**Checkpoint**: Full register → verify → login → access → logout lifecycle is complete.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end coverage of the core flow and rejection cases, plus the SC-008 secret-scan gate.

- [X] T044 [P] Playwright e2e for the core flow in `apps/frontend-e2e/src/auth-core-flow.e2e.ts`: register → verify → login → access protected shell → logout (SC-006, FR-016)
- [X] T045 [P] Playwright e2e for rejections in `apps/frontend-e2e/src/auth-rejections.e2e.ts`: unauthenticated access denied (SC-002), cross-user access denied with no disclosure (SC-003), and repeated failed logins throttled/blocked with a generic message (SC-007)
- [X] T046 [P] Add a CI secret/bundle-scan step (SC-008) verifying no password or long-lived secret appears in source or the shipped frontend bundle, wired into the GitHub Actions workflow
- [X] T047 Run the `quickstart.md` validation (manual core-flow + data-isolation checks) and confirm all Nx test targets (`nx test shared|backend|infra|frontend`, `nx e2e frontend-e2e`) pass green

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Stories (Phase 3–6)**: All depend on Foundational. US1, US2, US3 are all P1; US4 (P2) depends only on the backbone but is naturally validated after login exists.
- **Polish (Phase 7)**: Depends on the user stories it exercises (US1–US4 for the core-flow e2e).

### User Story Dependencies

- **US1 (Register, P1)**: Independent after Foundational.
- **US2 (Login, P1)**: Independent after Foundational (shares the cognito-client and auth-context backbone; adds its own methods/screen).
- **US3 (Protected access & isolation, P1)**: Independent after Foundational (backend-focused; the middleware and router guard exist from Phase 2).
- **US4 (Logout, P2)**: Independent after Foundational; end-to-end meaningfully demoed once US2 exists.

### Within Each Story

- Tests are written first and MUST fail before implementation (Principle III).
- Shared schemas → repository → service → controller/route (backend); cognito-client method → auth-context method → screen (frontend).

### Parallel Opportunities

- Setup: T002, T003, T004 run in parallel.
- Foundational: schema tasks (T005–T006), the three token-store tasks (T015–T017), and the independent frontend backbone files (T018, T019, T021) run in parallel; infra (T008–T010) and backend middleware/module (T011–T014) proceed alongside the frontend backbone.
- Once Foundational completes, US1/US2/US3/US4 can be staffed in parallel; within a story all `[P]` test tasks and independent screen files run together.
- Polish e2e tasks T044–T046 run in parallel.

---

## Parallel Example: User Story 1

```bash
# Write both failing tests together first:
Task: "Vitest register/verify context in apps/frontend/src/auth/auth-context.register.spec.tsx"  # T023
Task: "Vitest resend-verification in apps/backend/src/modules/auth/auth.resend.spec.ts"           # T024

# Then build the two screens in parallel:
Task: "RegisterScreen in apps/frontend/src/auth/screens/register-screen.tsx"  # T027
Task: "VerifyScreen in apps/frontend/src/auth/screens/verify-screen.tsx"      # T028
```

---

## Implementation Strategy

### MVP First

1. Complete Phase 1 (Setup) and Phase 2 (Foundational) — the identity boundary + backbone.
2. Complete **Phase 3 (US1 Register)** → **STOP and VALIDATE** registration + verification independently.
3. This is the thinnest demoable increment (account creation). Add US2 next to reach a usable login.

### Incremental Delivery

1. Setup + Foundational → boundary and backbone ready.
2. US1 (Register) → test → demo.
3. US2 (Login) → test → demo (register → verify → login → shell).
4. US3 (Protected access & isolation) → test → demo (`GET /me`, cross-user denial).
5. US4 (Logout) → test → demo (full lifecycle).
6. Polish → e2e core-flow + rejections + secret scan green.

### Parallel Team Strategy

After Foundational: Dev A → US1, Dev B → US2, Dev C → US3 (backend-heavy), Dev D → US4; stories integrate through the shared auth-context/cognito-client backbone without breaking independence.

---

## Notes

- `[P]` = different files, no dependencies on incomplete tasks.
- `[Story]` label maps each task to a user story for traceability.
- Verify every test task fails before writing its implementation (Principle III, NON-NEGOTIABLE).
- No password/secret in source, DB, or bundle (FR-013/SC-008); Cognito owns credentials.
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.
