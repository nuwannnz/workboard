# Quickstart & Validation Guide: Stage 1 — Project Setup & Foundation

Runnable scenarios that prove the Stage 1 skeleton works end to end. Commands reference the [Nx workspace contract](./contracts/nx-workspace-contract.md) and the [health API contract](./contracts/health-api.md); exact target names are finalized during implementation.

## Prerequisites

- Node.js 22 LTS (`node -v` → v22.x) and npm 10+
- Rust stable + platform Tauri prerequisites (desktop build only) — see Tauri docs
- Docker (for DynamoDB Local during backend/health validation)
- AWS credentials configured locally (US4 deploy validation only)

## Setup (one command)

```bash
npm install
```

**Expected**: all workspace dependencies install with no per-package steps (FR-003). Validates US1 AS1.

## Scenario 1 — Monorepo builds/lints/tests (US1, SC-001, SC-002)

```bash
npx nx run-many -t build
npx nx run-many -t lint
npx nx run-many -t test
```

**Expected**: every registered package (frontend, backend, infra, shared) succeeds; zero packages skipped; sample Vitest tests pass. Clean-clone → install → build completes in under 15 minutes (SC-001).

Confirm registration coverage:

```bash
npx nx show projects
```

**Expected**: frontend, frontend-e2e, backend, infra, and shared are listed.

## Scenario 2 — Frontend runs as PWA and desktop (US2, SC-003)

Browser/PWA:

```bash
npx nx serve frontend
```

**Expected**: app loads in the browser, is installable as a PWA, and shows a left sidebar with **Week, Projects, Notes, Overview** placeholders from the shared design system; layout stays responsive when the viewport narrows.

Desktop (Tauri):

```bash
npx nx run frontend:tauri   # or the documented desktop target
```

**Expected**: a native desktop window opens rendering the identical shell from the same source.

## Scenario 3 — Backend health through the layered structure (US3, SC-004)

Start DynamoDB Local, then:

```bash
npx nx serve backend
curl -s http://localhost:3000/health
```

**Expected**: `200` with `status: "healthy"` and `checks.persistence: "healthy"`. Stop DynamoDB Local and re-call → `503` `status: "unhealthy"` (SC-004). See [health-api.md](./contracts/health-api.md).

Inspect the skeleton:

**Expected**: `apps/backend/src` contains `routes/controllers/services/repositories/domain/middleware/validation/shared` and empty `modules/{auth,tasks,projects,notes,overview}` (US3 AS3), plus a `lambda.ts` serverless entry (US3 AS4).

## Scenario 4 — Infrastructure as code deploys (US4, SC-005)

```bash
npx nx synth infra      # or documented CDK synth target
npx nx deploy infra     # or documented CDK deploy target
```

**Expected**: synth produces the full stack (CloudFront + S3, API Gateway, Lambda, DynamoDB, Cognito) with no errors; deploy provisions all resources with no console steps. Then:

- Open the CloudFront URL → the frontend shell loads (US4 AS3).
- `curl <api-gateway-url>/health` → `200` healthy (US4 AS4).
- Re-run `nx deploy infra` → converges with no manual cleanup (edge case).

## Scenario 5 — CI and test harness gates (US5, SC-006, SC-007)

- Open a PR with a deliberately failing test → CI runs lint + Vitest + Playwright, reports failure, and merge to `main` is blocked (US5 AS2).
- Fix the test → CI passes and the PR becomes mergeable (US5 AS3).
- Locally:

```bash
npx nx run-many -t test        # Vitest sample(s) pass
npx nx e2e frontend-e2e        # Playwright sample passes
```

**Expected**: at least one unit/integration sample and one e2e sample exist and pass (SC-007).

## Done when

All five scenarios pass, confirming the foundation is ready for feature stages. Stage 1 intentionally ships **no** end-user feature behavior (FR-018).
