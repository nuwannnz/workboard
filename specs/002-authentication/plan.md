# Implementation Plan: Stage 2 — Authentication & Data Isolation

**Branch**: `002-authentication` | **Date**: 2026-07-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-authentication/spec.md`

## Summary

Deliver WorkBoard's first end-user capability — accounts — on top of the Stage 1
skeleton. A visitor registers with email + password, verifies email ownership,
logs in, stays logged in across reloads/restarts, and logs out. Authentication is
delegated entirely to the Cognito user pool provisioned in Stage 1 (no credentials
stored by the app). The frontend performs SRP registration/verification/login via
`amazon-cognito-identity-js` against the existing public app client; protected requests
carry the Cognito **id token**, which is verified by a native **API Gateway Cognito
User Pools authorizer** (with authorizer-result caching keyed on the token) at the edge,
before the request ever reaches the Lambda. The Express `authenticate` middleware then
becomes a thin, crypto-free extractor that reads the gateway-verified claims
(`requestContext.authorizer.claims`) and exposes the account identity (`sub`, `email`)
to handlers; a local-dev fallback verifies the token in-process with `aws-jwt-verify`
when running outside API Gateway. The Repository layer enforces per-user ownership at the lowest
layer (`PK = USER#<sub>`), proven against one representative protected resource
(the account profile) — including cross-user denial that discloses nothing. A
protected app shell (added via `react-router-dom`) gates all authenticated UI, with
auth screens built from the shared shadcn/ui design system so the PWA and Tauri
desktop app behave identically. Token persistence is handled behind an extended
platform adapter (web `localStorage`; desktop Tauri secure store). Vitest + Playwright
cover the full register → verify → log in → access → log out flow plus unauthenticated
and cross-user rejection.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 LTS; Rust stable (Tauri toolchain, desktop build only) — unchanged from Stage 1

**Primary Dependencies**: (inherited) Nx, React 18 + Vite + shadcn/ui + Tailwind, Tauri 2, Express 4 + `@codegenie/serverless-express`, `@aws-sdk/lib-dynamodb`, Zod, AWS CDK v2, Vitest, Playwright. **New for Stage 2**: `amazon-cognito-identity-js` (frontend SRP auth against Cognito, public client, no secret); **API Gateway Cognito User Pools authorizer** (native token verification at the edge with result caching — CDK `CognitoUserPoolsAuthorizer`, no new runtime dependency); `aws-jwt-verify` (backend **local-dev fallback** verifier only — production trusts the gateway-verified claims); `react-router-dom` v6 (protected routing + auth screens); `@aws-sdk/client-cognito-identity-provider` (backend resend/admin-free helper calls only where the SDK is required); `@tauri-apps/plugin-store` or Tauri OS-keychain binding for desktop token persistence

**Storage**: DynamoDB single-table `WorkBoard` (`PK`/`SK`), accessed only through the Repository layer. Stage 2 writes/reads one representative owned item per account: `PK = USER#<sub>`, `SK = PROFILE#<sub>`. Credentials/passwords are never stored here — Cognito owns them.

**Testing**: Vitest unit/integration (frontend auth state, backend middleware, repository ownership, validation); Playwright e2e for the core flow and rejection cases against the running frontend

**Target Platform**: Browser/installable PWA and native desktop (Tauri) frontend; AWS Lambda behind API Gateway backend; Cognito user pool as identity provider

**Project Type**: Nx monorepo — web frontend + serverless backend + IaC + shared library (multi-package), unchanged

**Performance Goals**: No new runtime performance targets. UX targets from spec: complete register → verify → logged-in in under 3 minutes on-screen (SC-001); token verification adds negligible per-request latency (JWKS cached in the Lambda)

**Constraints**: No password/secret in source, DB, or frontend bundle (FR-013, SC-008); identity validated at the **API Gateway boundary** (Cognito authorizer) before the request reaches the Lambda/any controller (FR-009); ownership enforced in the Repository layer with no bypass path (FR-011); single shared frontend codebase across PWA + desktop (FR-014); email/password only — no social/SSO/MFA (spec Assumptions); no password-reset flow this stage (spec Assumptions); no feature data (Tasks/Projects/Notes) created

**Scale/Scope**: Single-developer/personal MVP; one environment; adds an `auth` backend module, an auth feature area + protected router in the frontend, token-storage on the platform adapter, and small infra additions (app-client auth flows/token validity, optional lockout posture)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Stage 2 obligation | Compliance in this plan |
|-----------|--------------------|--------------------------|
| I. Layered, Feature-Modular Backend | Auth as a self-contained module in the layered app; no logic in routes/controllers | New `modules/auth/` holds auth routes → controller → service → repository; JWT verification lives in `middleware/`; profile ownership in the repository; controllers stay thin. Auth module does not reach into other modules' internals. |
| II. Shared Frontend, One Codebase | One React/shadcn auth UX across PWA + Tauri, responsive; platform code behind adapters | Auth screens (register/verify/login) built from shared shadcn/ui; a single auth feature area; token persistence added to the existing `platform/` adapter interface (web vs. Tauri impls) — no per-target fork. |
| III. Test-First Discipline (NON-NEGOTIABLE) | Vitest + Playwright written before/with implementation; CI green; core flow is priority e2e | Tests-first per task ordering: repository ownership + middleware rejection (Vitest), auth store/validation (Vitest), full register→verify→login→access→logout e2e + unauth + cross-user denial (Playwright); CI blocks merge. |
| IV. Data Isolation & Auth Boundary | Cognito email/password validated at the boundary before controllers; ownership at Repository; no secrets committed | The **API Gateway Cognito authorizer** verifies the token at the literal API Gateway boundary and rejects invalid tokens before the Lambda runs (FR-009); the `authenticate` middleware only reads the gateway-verified claims. Repository scopes every access to `USER#<sub>` and denies cross-user as not-found (FR-011); Cognito holds credentials, config via env/CDK outputs, nothing committed or bundled (FR-013). |
| V. Infrastructure as Code & Single Nx Graph | Any Cognito/config change via CDK; all tasks via Nx targets | App-client auth flows, token validity, and lockout posture set in the existing `auth-stack.ts` CDK construct; new outputs (UserPoolId/ClientId) already surfaced. Every build/lint/test/run remains an Nx target; new deps registered in the workspace. |
| VI. Simplicity & Scope Discipline (YAGNI) | Only registration/login/logout + isolation; nothing speculative | No password reset, no profile management, no social/SSO/MFA, no multi-env, no feature CRUD. One representative protected resource proves isolation; `amazon-cognito-identity-js` chosen over Amplify to avoid a heavy dependency. |

**Result**: PASS — no violations. Complexity Tracking is intentionally empty.

## Project Structure

### Documentation (this feature)

```text
specs/002-authentication/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── auth-api.md      # Backend protected + identity endpoints (/me, /auth/*)
│   └── auth-client-contract.md  # Frontend auth adapter + token-storage contract
├── checklists/          # (existing) requirements checklist
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
apps/
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── app-shell.tsx           # now rendered only inside a protected route
│       │   └── router.tsx              # NEW: public (auth) vs. protected routes
│       ├── auth/                       # NEW: auth feature area (shared UI)
│       │   ├── auth-context.tsx        # session state: current user, tokens, status
│       │   ├── cognito-client.ts       # amazon-cognito-identity-js wrapper (SRP)
│       │   ├── api-client.ts           # fetch wrapper attaching the id token (Bearer)
│       │   ├── use-auth.ts             # hook exposing register/verify/login/logout
│       │   ├── require-auth.tsx        # route guard → redirect unauthenticated
│       │   └── screens/                # RegisterScreen, VerifyScreen, LoginScreen
│       └── platform/
│           ├── platform.ts             # EXTEND: token/secret storage on the adapter
│           ├── web.ts                  # localStorage-backed token store
│           └── tauri.ts                # Tauri secure-store-backed token store
└── backend/
    └── src/
        ├── app.ts                      # mount auth router; apply authenticate middleware to protected routes
        ├── middleware/
        │   └── authenticate.ts         # NEW: reads gateway-verified claims (requestContext.authorizer.claims);
        │                               #      local-dev fallback verifies the id token via aws-jwt-verify
        └── modules/
            └── auth/                   # NEW: self-contained auth module
                ├── auth.routes.ts      # /me (protected), /auth/resend-verification
                ├── auth.controller.ts  # thin: reads req identity, calls service
                ├── auth.service.ts     # profile bootstrap, resend-verification orchestration
                └── profile.repository.ts # ownership-enforced access: PK=USER#<sub>

libs/shared/
└── src/schemas/
    ├── user.ts                         # EXTEND: registration/login/verify request schemas
    └── auth.ts                         # NEW: shared Zod schemas for auth payloads

apps/infra/lib/
├── auth-stack.ts                       # EXTEND: app-client auth flows, token validity, lockout posture
└── api-stack.ts                        # EXTEND: split public vs. protected resources; attach a
                                        #   CognitoUserPoolsAuthorizer (result caching) to protected methods

apps/frontend-e2e/src/                  # NEW e2e: full auth flow, unauth denial, cross-user denial
```

**Structure Decision**: Reuse the Stage 1 Nx layout unchanged. The Auth boundary is
enforced at the edge by an API Gateway Cognito authorizer configured in `api-stack.ts`
(Principle IV/V); the backend gains a self-contained `modules/auth/` (Principle I) plus a
single `middleware/authenticate.ts` that reads the gateway-verified claims (and verifies
locally only in dev) for every protected router. The frontend
gains an `auth/` feature area and a `router.tsx` that renders the existing `AppShell`
only behind a route guard; token persistence is added to the existing `platform/`
adapter so PWA and desktop share one codebase (Principle II). Shared request/response
shapes live in `libs/shared` so frontend and backend validate identically (Principle V).
Cognito changes stay in the existing `auth-stack.ts` CDK construct (Principle V).

## Complexity Tracking

> No Constitution Check violations. This section is intentionally empty.
