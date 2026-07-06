---
description: "Task list for Stage 1 — Project Setup & Foundation"
---

# Tasks: Stage 1 — Project Setup & Foundation

**Input**: Design documents from `/specs/001-project-setup/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (health-api.md, nx-workspace-contract.md), quickstart.md

**Tests**: INCLUDED. The spec mandates a test-first harness with passing samples (FR-014, SC-007) and Constitution Principle III (test-first) is non-negotiable, so sample Vitest/Playwright tasks are part of each relevant story.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Exact file paths are relative to the Nx workspace root (repository root)

## Path Conventions

- Nx monorepo: `apps/{frontend,frontend-e2e,backend,infra}`, `libs/shared`, workspace config at repo root
- Backend layering under `apps/backend/src/`; shared types/validation under `libs/shared/src/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Stand up the Nx workspace root and repository-wide tooling every package depends on.

- [ ] T001 Initialize the Nx workspace at repo root: create `nx.json`, root `package.json` (workspace/`workspaces` config, `engines.node` = 22, single `npm install` entry), and commit the generated `package-lock.json`
- [ ] T002 [P] Create `tsconfig.base.json` at repo root with shared compiler options and the `@workboard/shared` path alias
- [ ] T003 [P] Configure repo-root linting/formatting: `eslint.config.mjs` (flat config) and `.prettierrc`
- [ ] T004 [P] Add `.gitignore` (node_modules, dist, `.env`, `cdk.out`, `src-tauri/target`) and `.nvmrc` (Node 22) at repo root
- [ ] T005 [P] Configure Conventional Commits + SemVer tooling: `commitlint.config.js` and a commit-msg hook (husky) at repo root (FR-016)
- [ ] T006 [P] Create `README.md` skeleton at repo root with the required-toolchain/versions section (FR-015)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Workspace-wide task-graph behavior and config that every package's build/lint/test targets rely on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T007 Configure Nx `targetDefaults` in `nx.json` (build/lint/test/serve caching, `dependsOn: ["^build"]`) so every registered package is covered by workspace-wide runs (FR-001, SC-002)
- [ ] T008 [P] Add a shared Vitest base preset at `tools/vitest/vitest.base.ts` (and register `vitest.workspace.ts` at repo root) reusable by all packages
- [ ] T009 [P] Add `.env.example` at repo root and document the env/secret convention (no secrets committed or bundled) in `README.md` (FR-017)

**Checkpoint**: Workspace graph + shared config ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - Monorepo builds and runs locally (Priority: P1) 🎯 MVP

**Goal**: A contributor installs once and can build, lint, and test every registered package through Nx with no ad-hoc scripts; new packages join workspace runs automatically.

**Independent Test**: On a clean checkout run `npm install`, then `npx nx run-many -t build lint test` — all registered packages succeed with zero skipped — and `npx nx show projects` lists the registered packages.

### Tests for User Story 1

- [ ] T010 [P] [US1] Add sample Vitest test validating the shared Zod schemas in `libs/shared/src/schemas/task.spec.ts` (proves the test layer is wired; run by `nx run-many -t test`)

### Implementation for User Story 1

- [ ] T011 [P] [US1] Scaffold the `libs/shared` package: `libs/shared/project.json` (build/lint/test targets), `libs/shared/tsconfig.json`, `libs/shared/src/index.ts`
- [ ] T012 [P] [US1] Define Zod schemas + inferred TypeScript types for Task, Project, Note, and User/Account in `libs/shared/src/schemas/{task,project,note,user}.ts` per data-model.md
- [ ] T013 [US1] Export all schemas/types via the barrel `libs/shared/src/index.ts` (depends on T012)
- [ ] T014 [US1] Verify workspace-wide `nx run-many -t build lint test` and `nx affected` behavior against the nx-workspace-contract in `nx.json` (registration coverage, no bespoke scripts)
- [ ] T015 [US1] Document the single install command and workspace-wide build/lint/test commands + package-registration behavior in `README.md` (FR-003, FR-015)

**Checkpoint**: `nx run-many -t build lint test` passes and `nx show projects` lists `shared` — US1 is independently testable.

---

## Phase 4: User Story 2 - Shared frontend runs as PWA and desktop app (Priority: P1)

**Goal**: One React/Vite codebase renders the same placeholder shell (sidebar: Week/Projects/Notes/Overview) both as an installable PWA and as a Tauri desktop window, responsively.

**Independent Test**: `npx nx serve frontend` loads the installable PWA shell in a browser; `npx nx run frontend:tauri` opens a desktop window rendering the identical shell; narrowing the viewport keeps the layout intact.

### Tests for User Story 2

- [ ] T016 [P] [US2] Add sample Vitest component test asserting the shell renders the four nav areas (Week/Projects/Notes/Overview) in `apps/frontend/src/app/app-shell.spec.tsx`

### Implementation for User Story 2

- [ ] T017 [US2] Generate the `apps/frontend` React + Vite app via Nx with build/serve/lint/test targets in `apps/frontend/project.json`
- [ ] T018 [P] [US2] Configure Tailwind + shadcn/ui base design system under `apps/frontend/src/components/ui/` and `apps/frontend/tailwind.config.ts`
- [ ] T019 [US2] Configure `vite-plugin-pwa` (manifest + service worker) in `apps/frontend/vite.config.ts` and add PWA manifest/icons in `apps/frontend/public/`
- [ ] T020 [P] [US2] Define the platform adapter interface + web implementation in `apps/frontend/src/platform/` (single interface, no per-target fork)
- [ ] T021 [US2] Add the Tauri 2 desktop shell in `apps/frontend/src-tauri/` (+ tauri adapter impl) and a `tauri` target in `apps/frontend/project.json`
- [ ] T022 [US2] Build the responsive app shell with a left sidebar of Week/Projects/Notes/Overview placeholders from the shared design system in `apps/frontend/src/app/`

**Checkpoint**: Frontend runs as PWA and desktop from one codebase showing the shared shell — US2 is independently testable.

---

## Phase 5: User Story 3 - Backend skeleton responds through the layered structure (Priority: P1)

**Goal**: A single Express app, structured in the mandated layers with empty feature-module placeholders, exposes `GET /health` that flows route → controller → service → repository (DynamoDB probe), plus a Lambda-compatible entry point.

**Independent Test**: `npx nx serve backend` then `curl http://localhost:3000/health` returns `200` `status: "healthy"`; with DynamoDB Local stopped it returns `503` `status: "unhealthy"`; the source shows all layer dirs, empty `modules/*`, and a `lambda.ts` entry.

### Tests for User Story 3

- [ ] T023 [P] [US3] Add sample Vitest integration test for `GET /health` covering healthy (200) and persistence-unreachable (503) cases in `apps/backend/src/routes/health.spec.ts` per contracts/health-api.md

### Implementation for User Story 3

- [ ] T024 [US3] Generate the `apps/backend` Nx Node/Express app with build/serve/lint/test targets in `apps/backend/project.json`
- [ ] T025 [P] [US3] Create the mandated layer directories `routes/`, `controllers/`, `services/`, `repositories/`, `domain/`, `middleware/`, `validation/`, `shared/` under `apps/backend/src/`
- [ ] T026 [P] [US3] Create empty feature-module placeholders `modules/{auth,tasks,projects,notes,overview}` (with `.gitkeep`) under `apps/backend/src/modules/`
- [ ] T027 [US3] Create the Express app factory and both entries: `apps/backend/src/app.ts`, `apps/backend/src/main.ts` (local listen), and `apps/backend/src/lambda.ts` (`@codegenie/serverless-express` handler) sharing one `app.ts` (FR-008)
- [ ] T028 [US3] Implement the DynamoDB repository abstraction + connectivity probe using `@aws-sdk/lib-dynamodb` in `apps/backend/src/repositories/health.repository.ts` (FR-011)
- [ ] T029 [US3] Implement the health flow through the layers: `apps/backend/src/routes/health.routes.ts` → `controllers/health.controller.ts` → `services/health.service.ts` (returns healthy/unhealthy per persistence, no logic in route/controller)
- [ ] T030 [P] [US3] Add a DynamoDB Local `docker-compose.yml` for backend/health dev in `apps/backend/`

**Checkpoint**: Health endpoint returns healthy/unhealthy through the full layer stack and the Lambda entry exists — US3 is independently testable.

---

## Phase 6: User Story 4 - Infrastructure is defined as code and deployable (Priority: P2)

**Goal**: One AWS CDK app synthesizes and deploys the full skeleton stack (S3+CloudFront, API Gateway, single Lambda, DynamoDB, Cognito) with no manually created resources and idempotent re-deploys.

**Independent Test**: `npx nx synth infra` produces the full stack without errors; `npx nx deploy infra` provisions all resources; the CloudFront URL loads the shell and `GET <api-gw-url>/health` returns `200`; re-running deploy converges.

### Tests for User Story 4

- [ ] T031 [P] [US4] Add a sample Vitest CDK assertion test verifying the synthesized template contains the DynamoDB table, Lambda, API Gateway, S3/CloudFront, and Cognito resources in `apps/infra/lib/stack.spec.ts`

### Implementation for User Story 4

- [ ] T032 [US4] Generate the `apps/infra` AWS CDK v2 app with build/lint/test + `synth`/`deploy` targets in `apps/infra/project.json` and the CDK entry in `apps/infra/bin/infra.ts`
- [ ] T033 [P] [US4] Define the DynamoDB single table `WorkBoard` (PK/SK) in `apps/infra/lib/data-stack.ts` per data-model.md
- [ ] T034 [P] [US4] Define the Cognito user pool in `apps/infra/lib/auth-stack.ts`
- [ ] T035 [US4] Define the single Lambda (packaging the backend) + API Gateway in `apps/infra/lib/api-stack.ts` (depends on T027)
- [ ] T036 [US4] Define S3 + CloudFront static hosting for the frontend build in `apps/infra/lib/web-stack.ts`
- [ ] T037 [US4] Wire stack outputs (API base URL, CloudFront URL, table name, user-pool IDs) in `apps/infra/lib/` (consumed via env, not committed)

**Checkpoint**: The stack synthesizes/deploys from code with a reachable site and API health endpoint — US4 is independently testable.

---

## Phase 7: User Story 5 - CI and test harness enforce quality gates (Priority: P2)

**Goal**: Every PR runs lint + Vitest + Playwright automatically; `main` is protected so a failing gate blocks merge and direct pushes are disallowed; sample unit/integration and e2e tests pass.

**Independent Test**: Open a PR with a deliberately failing test → CI reports failure and merge to `main` is blocked; fix it → CI passes and the PR is mergeable. Locally `npx nx run-many -t test` and `npx nx e2e frontend-e2e` pass.

### Tests for User Story 5

- [ ] T038 [US5] Add the sample Playwright e2e asserting the shell renders the four nav areas in `apps/frontend-e2e/src/app-shell.e2e.ts`

### Implementation for User Story 5

- [ ] T039 [US5] Scaffold the `apps/frontend-e2e` Playwright project with `playwright.config.ts`, an `e2e` target in `apps/frontend-e2e/project.json`
- [ ] T040 [US5] Create the GitHub Actions CI workflow running `nx affected -t lint test` + Playwright on every PR in `.github/workflows/ci.yml` (FR-012)
- [ ] T041 [P] [US5] Document `main` branch protection (PR required, all gates must pass to merge, no direct pushes) in `README.md`/repo docs (FR-013)

**Checkpoint**: CI gates run on PRs and block merges on failure with passing samples across both test layers — US5 is independently testable.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Documentation completeness and scope/quality verification across all stories.

- [ ] T042 [P] Complete `README.md` with build/run/test/deploy commands for every package (frontend, backend, infra, shared) sufficient for a new contributor (FR-015, SC-008)
- [ ] T043 Run all five quickstart.md validation scenarios end to end and record results
- [ ] T044 [P] Final scope/security check: confirm no secrets committed or bundled (FR-017) and no end-user feature behavior was added (FR-018)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Stories (Phase 3–7)**: All depend on Foundational completion
  - US1, US2, US3 (all P1) then US4, US5 (P2) — run in priority order, or in parallel by different developers
- **Polish (Phase 8)**: Depends on all targeted user stories being complete

### User Story Dependencies

- **US1 (P1)**: Delivers `libs/shared`; foundation for cross-package types. No dependency on other stories.
- **US2 (P1)**: Consumes shared types from US1 but is independently testable (frontend shell renders standalone).
- **US3 (P1)**: Consumes shared types from US1 but is independently testable (health endpoint runs standalone).
- **US4 (P2)**: Packages the backend from US3 (T035 depends on the backend `app.ts`/`lambda.ts`); other resources are independent.
- **US5 (P2)**: Exercises the frontend (US2) e2e and all packages' Vitest samples; CI wiring itself is independent.

### Within Each User Story

- Tests are authored alongside implementation and must pass before the story is considered done
- Models/types before services; services before endpoints; core before integration

### Parallel Opportunities

- Setup tasks T002–T006 can run in parallel
- Foundational tasks T008–T009 can run in parallel
- Once Foundational completes, US1/US2/US3 can proceed in parallel (different packages)
- Within a story, [P]-marked tasks touch different files and can run together

---

## Parallel Example: User Story 3

```bash
# Different files within US3 — safe to parallelize:
Task: "Create backend layer directories under apps/backend/src/" (T025)
Task: "Create empty feature-module placeholders under apps/backend/src/modules/" (T026)
Task: "Add DynamoDB Local docker-compose in apps/backend/" (T030)
Task: "Add sample Vitest integration test in apps/backend/src/routes/health.spec.ts" (T023)
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1 (`libs/shared` + workspace commands)
4. **STOP and VALIDATE**: `npm install` → `nx run-many -t build lint test` → `nx show projects`
5. This is the irreducible foundation every later stage builds on.

### Incremental Delivery

1. Setup + Foundational → workspace ready
2. US1 → shared lib + workspace commands (MVP!)
3. US2 → frontend PWA/desktop shell
4. US3 → backend layered health skeleton
5. US4 → deployable infrastructure
6. US5 → CI + quality gates enforced

### Parallel Team Strategy

After Foundational completes: Developer A → US1/US2 (frontend track), Developer B → US3 (backend), Developer C → US4 (infra); US5 wires CI once packages exist.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps each task to its user story for traceability
- Stage 1 ships scaffolding, placeholders, and health/status wiring only — NO end-user feature behavior (FR-018)
- Commit after each task or logical group using Conventional Commits
- Stop at any checkpoint to validate the story independently
