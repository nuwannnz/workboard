---
description: "Task list for Vercel Migration & Merge-Triggered Deploy Pipeline"
---

# Tasks: Vercel Migration & Merge-Triggered Deploy Pipeline

**Input**: Design documents from `/specs/006-vercel-deploy-pipeline/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included — the constitution's Principle III (Test-First, NON-NEGOTIABLE) requires Vitest
coverage for changed code. A GitHub Actions workflow itself is not unit-testable (plan.md, research
§7), so pipeline behavior is validated via `quickstart.md`; only the code it touches (infra
template, version-display UI, deploy-helper pure logic) carries automated tests.

**Organization**: Grouped by user story. Note the real dependency the spec calls out: **US1
(auto-deploy) and US2 (Vercel hosting) are both P1 and land together** — US1 publishes to the
target US2 establishes, so US2's publish path is built first.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US5 (maps to spec.md user stories); Setup/Foundational/Polish carry no story label

## Path Conventions

Nx monorepo: `apps/frontend/`, `apps/infra/`, `tools/scripts/`, `.github/workflows/`. Absolute-ish
repo-relative paths shown per task.

---

## Phase 1: Setup (Shared Configuration)

**Purpose**: Config scaffolding needed before any deploy; no deployment performed.

- [X] T001 [P] Add `apps/frontend/vercel.json` with SPA rewrite (`{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`) and `outputDirectory: dist`, replacing CloudFront's 403/404→index.html behavior (contracts/frontend-build-config.md → Vercel project).
- [X] T002 [P] Add `readonly VITE_APP_VERSION?: string;` to `ImportMetaEnv` in `apps/frontend/src/vite-env.d.ts`, and document `VITE_APP_VERSION` (build-injected; dev fallback) in `apps/frontend/.env.example`.
- [X] T003 [P] Document required GitHub Secrets (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`) and the Vercel project-link steps in `specs/006-vercel-deploy-pipeline/quickstart.md` Prerequisites and the README (contracts/deploy-pipeline.md → Required secrets).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The single reusable frontend build-and-publish helper used by BOTH the manual deploy
path (US2) and the CI pipeline (US1), so there is one source of truth for how the frontend ships
(FR-012).

**⚠️ CRITICAL**: US1 and US2 publish steps depend on this phase.

- [X] T004 Create `tools/scripts/deploy-frontend-vercel.mjs` exporting `deployFrontendToVercel({ apiBaseUrl, userPoolId, clientId, version, token, prod })`: move aside `.env.local`/`.env.production.local`, write `.env.production` with `VITE_API_BASE_URL`/`VITE_COGNITO_USER_POOL_ID`/`VITE_COGNITO_CLIENT_ID`/`VITE_COGNITO_ENDPOINT=`/`VITE_APP_VERSION`, run `nx build frontend --skip-nx-cache`, then `vercel deploy --prebuilt` (add `--prod` when `prod`) `--token=$token` against `apps/frontend/dist`, and always restore moved files (reuses the guard logic from `tools/scripts/deploy.mjs`). Also export a pure `buildProdEnv(outputs, version)`.
- [X] T005 [P] Add `tools/scripts/deploy-frontend-vercel.spec.mjs` (Vitest): assert `buildProdEnv` maps CDK outputs → `VITE_*`, sets `VITE_APP_VERSION` (and `0.0.0-dev` default when version absent), forces `VITE_COGNITO_ENDPOINT` empty, and never emits a non-`VITE_` key. Write and run before T004 passes (test-first).

**Checkpoint**: One tested helper publishes a prod frontend to Vercel from CDK outputs.

---

## Phase 3: User Story 2 - Frontend on Vercel, CloudFront removed (Priority: P1) 🎯 MVP

**Goal**: Frontend served by Vercel; the S3 + CloudFront web-hosting construct removed from CDK;
backend stays fully CDK-managed.

**Independent Test**: `nx test infra` + `nx synth infra` show no CloudFront distribution / no
frontend S3 bucket and an intact backend; `npm run deploy` publishes the app to Vercel (quickstart
A, G).

### Tests for User Story 2 ⚠️ (write first, ensure they fail against the current stack)

- [X] T006 [US2] Update `apps/infra/lib/stack.spec.ts`: remove the S3 + CloudFront assertion; assert `resourceCountIs('AWS::CloudFront::Distribution', 0)`, no frontend-hosting bucket, `resourceCountIs('AWS::Lambda::Function', 1)` (only the backend Lambda remains), and DynamoDB/API Gateway/Cognito still present; reword the CORS-test comment from "CloudFront-hosted SPA" to "Vercel-hosted SPA".

### Implementation for User Story 2

- [X] T007 [P] [US2] Delete `apps/infra/lib/web-stack.ts` (the `WebBucket` + `WebDistribution` + `BucketDeployment` construct).
- [X] T008 [US2] Edit `apps/infra/lib/workboard-stack.ts`: remove the `WebStack` import and `new WebStack(this, 'Web')`, and delete the `CloudFrontUrl` and `WebBucketName` `CfnOutput`s (keep `ApiBaseUrl`, `TableName`, `UserPoolId`, `UserPoolClientId`).
- [X] T009 [US2] Refactor `tools/scripts/deploy.mjs`: drop the two-pass CloudFront/S3 flow — deploy the (now web-less) stack once, read outputs (`ApiBaseUrl`/`UserPoolId`/`UserPoolClientId`), then call `deployFrontendToVercel(...)` from T004; remove `CloudFrontUrl`/`WebBucketName` handling and log the Vercel URL.
- [X] T010 [P] [US2] Update the deploy section of `README.md`: replace the S3 + CloudFront one-command description with the Vercel publish flow and a pointer to the CI pipeline as the primary path.

**Checkpoint**: `nx test infra` green; `npm run deploy` puts the app on Vercel with no CloudFront/S3.

---

## Phase 4: User Story 1 - Auto-deploy on merge to main (Priority: P1) 🎯 MVP

**Goal**: Merging a PR into `main` deploys the AWS backend then the Vercel frontend automatically,
behind the existing quality gates, with no manual command.

**Independent Test**: Merge a trivial PR to `main`; the `deploy` job runs backend `cdk deploy` then
publishes to Vercel with no human step; a PR-branch push runs gates only (quickstart C, no tag yet).

**Depends on**: Phase 2 (T004 publish helper) and US2 (the Vercel target / web-less stack).

### Implementation for User Story 1

- [X] T011 [US1] Extend `.github/workflows/ci.yml` with a `deploy` job: `needs: quality-gates`, `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`, workflow `concurrency: { group: deploy-main, cancel-in-progress: false }`; steps: `actions/checkout` (`fetch-depth: 0`) → `setup-node@v4` (node 22) → `npm ci` → `aws-actions/configure-aws-credentials` from GitHub Secrets → `nx run infra:deploy` with `--outputs-file` → parse `ApiBaseUrl`/`UserPoolId`/`UserPoolClientId` (contracts/deploy-pipeline.md steps 1–3; FR-006/7/8/9).
- [X] T012 [US1] In the `deploy` job, add the frontend publish step: invoke `deployFrontendToVercel({ ...parsedOutputs, prod: true, token: VERCEL_TOKEN })` (from T004) with `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` env, publishing production to Vercel after the backend deploy (FR-001/6/9). (Version injection is added in US3.)

**Checkpoint**: A merge to `main` deploys backend + frontend end-to-end with no manual command.

---

## Phase 5: User Story 3 - Automatic versioning & version in the UI (Priority: P2)

**Goal**: Each deploy gets an auto-computed SemVer stamped into the build and shown in the app, and
recorded as a git tag + GitHub Release created only after both deploys succeed.

**Independent Test**: UI part — `VITE_APP_VERSION=9.9.9 nx build frontend` shows `v9.9.9` in the
shell (quickstart B). Pipeline part — two sequential merges yield strictly-increasing versions +
tags/Releases and the live app reports the newer one (quickstart D).

**Depends on**: US1 for the pipeline steps; the UI subtasks (T013–T015) are independent of the
pipeline and can run any time after Setup.

### Tests for User Story 3 ⚠️ (write first)

- [X] T015 [US3] Update `apps/frontend/src/app/app-shell.spec.tsx`: assert the sidebar renders the version at `data-testid="app-version"` — showing the injected `VITE_APP_VERSION` when set and `0.0.0-dev` fallback when unset (FR-016, SC-005).

### Implementation for User Story 3

- [X] T013 [P] [US3] Add `apps/frontend/src/app/app-version.ts` exporting the version string from `import.meta.env.VITE_APP_VERSION` with a `'0.0.0-dev'` fallback (contracts/frontend-build-config.md → Reader).
- [X] T014 [US3] Edit `apps/frontend/src/app/app-shell.tsx`: render `v{appVersion}` in the sidebar footer area (near the Log out control) with `data-testid="app-version"`, using the T013 helper; keep it responsive (hidden label pattern already used in the shell).
- [X] T016 [US3] In the `.github/workflows/ci.yml` `deploy` job, add a version-compute step BEFORE the build (Conventional-Commits tag action, e.g. `mathieudutour/github-tag-action`, `dry_run`/no-push so the tag is created later) exposing `new_version`; pass it into the T012 publish step as `version` → `VITE_APP_VERSION` (research §2, FR-013/14).
- [X] T017 [US3] In the `deploy` job, add a FINAL step (after backend + frontend both succeed) that creates the annotated `v<new_version>` tag on the merge commit and a GitHub Release via `gh release create`/`softprops/action-gh-release` (contracts/deploy-pipeline.md step 7; FR-010/15, SC-007).
- [X] T018 [P] [US3] Add a Playwright smoke in `apps/frontend-e2e/src/` asserting the authenticated shell displays a version at `data-testid="app-version"` (FR-016).

**Checkpoint**: App shows its version; deploys produce increasing tags/Releases matching the live UI.

---

## Phase 6: User Story 4 - Traceability & rollback (Priority: P2)

**Goal**: Identify the live version from Releases and redeploy a previous known-good version without
a manual rebuild; DynamoDB data untouched.

**Independent Test**: Trigger the pipeline at a previous `vX.Y.Z`; the live app reports that version
and no data changes (quickstart F).

**Depends on**: US3 (tags/Releases must exist).

### Implementation for User Story 4

- [X] T019 [US4] Add a `workflow_dispatch` trigger (input: `ref`/tag) to the deploy workflow in `.github/workflows/ci.yml` so a prior tag can be checked out and redeployed (frontend rebuild+republish; backend `cdk deploy` from that ref); ensure the checkout step honors the dispatched `ref`. The tag/Release creation step must no-op when redeploying an existing tag (FR-018).
- [X] T020 [P] [US4] Add a rollback runbook section to `specs/006-vercel-deploy-pipeline/quickstart.md` / README: read Releases to find the live version + commit, dispatch a redeploy of the prior tag, and confirm DynamoDB is retained/never reverted (FR-017/18/19, SC-006).

**Checkpoint**: A prior version can be redeployed from its tag; data preserved.

---

## Phase 7: User Story 5 - PR validation & preview (Priority: P3)

**Goal**: Existing gates run on PRs and a non-production Vercel preview of the frontend is available,
without touching production or the version.

**Independent Test**: Open a UI PR; gates run and a preview URL is produced; production/version
unchanged (quickstart C step 2).

### Implementation for User Story 5

- [X] T021 [US5] Add a `preview` job to `.github/workflows/ci.yml` (`if: github.event_name == 'pull_request'`): build the frontend and run `vercel deploy` WITHOUT `--prod`, surfacing the returned preview URL in the run summary / PR comment; must not run `cdk deploy`, publish to prod, or create a tag/Release (US5 acceptance; contracts/deploy-pipeline.md → Job: preview).

**Checkpoint**: PRs get gates + a preview URL; production untouched.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T022 [P] Open the recommended constitution-amendment note/PR editing `.specify/memory/constitution.md` Technology & Architecture Constraints (replace "CloudFront + S3 serve the PWA/static assets" with "Vercel serves the frontend; the AWS backend remains CDK-managed"), per the amendment procedure and plan.md Complexity Tracking. *(Amended in this feature branch — v1.0.0 → v1.1.0, adopted when this PR merges; deviation called out per Governance.)*
- [ ] T023 Run the full `specs/006-vercel-deploy-pipeline/quickstart.md` A–G validation and confirm every SC (SC-001…SC-008) maps green; capture the first baseline version tag. *(Local halves done: A — infra tests + synth show no CloudFront/S3, backend intact; B — `VITE_APP_VERSION=9.9.9` build stamps the bundle, unit + e2e version tests green; secret/bundle scan green. C–G require the live GitHub/AWS/Vercel environment — configure the six GitHub Secrets + `vercel link`, then merge a test PR per quickstart.)*
- [X] T024 [P] Final docs pass: ensure `README.md` and quickstart reflect the shipped pipeline, secrets, and rollback; remove any lingering CloudFront references outside historical specs.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (P1)**: no dependencies — start immediately.
- **Foundational (P2)**: depends on Setup; **blocks the publish steps of US1 and US2**.
- **US2 (Phase 3, P1)**: depends on Foundational (T004 used by T009). MVP part 1.
- **US1 (Phase 4, P1)**: depends on Foundational (T004) and US2 (the Vercel target). MVP part 2 — ships with US2.
- **US3 (Phase 5, P2)**: UI subtasks (T013–T015) depend only on Setup; pipeline subtasks (T016–T017) depend on US1.
- **US4 (Phase 6, P2)**: depends on US3 (tags exist).
- **US5 (Phase 7, P3)**: depends on Foundational (T004 build path); independent of US1's prod deploy.
- **Polish (Phase 8)**: after the desired stories are complete.

### Within Each User Story

- Tests before implementation (T006 before T007–T010; T015 before T013/T014).
- Helper (T004) before consumers (T009, T012).
- Backend removal (T007/T008) before the manual-deploy refactor (T009).
- Version-compute (T016) before the tag/Release step (T017).

### Parallel Opportunities

- **Setup**: T001, T002, T003 all `[P]` — run together.
- **Foundational**: T005 (test) `[P]` alongside authoring T004.
- **US2**: T007 (delete web-stack) and T010 (README) `[P]`; T006 first (test).
- **US3 UI vs pipeline**: T013 + the UI work can proceed in parallel with US1/US4 pipeline tasks since they touch different files (frontend vs workflow).
- Cross-story: the entire **US3 UI slice** (T013–T015, frontend files) is independent of every workflow-editing task and can be done any time after Setup.

---

## Parallel Example: Setup

```bash
# All three setup tasks touch different files — run together:
Task: "Add apps/frontend/vercel.json (SPA rewrite)"
Task: "Add VITE_APP_VERSION typing + .env.example doc"
Task: "Document GitHub Secrets + Vercel link in quickstart/README"
```

## Parallel Example: User Story 2

```bash
# After T006 (test) is written and failing:
Task: "Delete apps/infra/lib/web-stack.ts"           # T007 [P]
Task: "Update README deploy section"                  # T010 [P]
# Then sequentially: T008 (workboard-stack), T009 (deploy.mjs) — T009 needs T004 + T008.
```

---

## Implementation Strategy

### MVP (both P1 stories — they ship together)

1. Phase 1 Setup → Phase 2 Foundational (tested publish helper).
2. Phase 3 US2: remove CloudFront/S3, prove `npm run deploy` publishes to Vercel.
3. Phase 4 US1: wire the merge-triggered `deploy` job reusing the helper.
4. **STOP & VALIDATE**: merge a test PR → backend + frontend deploy automatically (quickstart C, minus tagging).

### Incremental Delivery

1. MVP (US2 + US1) → auto-deploy to Vercel, no CloudFront.
2. Add US3 → versions stamped in the UI + tags/Releases per deploy.
3. Add US4 → rollback via tag redeploy.
4. Add US5 → PR previews.
5. Polish → constitution amendment, full quickstart validation, docs.

---

## Notes

- `[P]` = different files, no incomplete-task dependency.
- The GitHub Actions workflow is validated via `quickstart.md` (not unit tests) — plan.md /
  research §7; the code it drives (infra template, version UI, publish helper) is unit-tested.
- No secret ever enters the frontend bundle or logs (FR-011, SC-008) — the existing secret/bundle
  scan stays in the gate and guards this.
- Commit per task or logical group; each checkpoint is an independently validatable slice.
