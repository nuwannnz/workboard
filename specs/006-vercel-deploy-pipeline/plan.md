# Implementation Plan: Vercel Migration & Merge-Triggered Deploy Pipeline

**Branch**: `006-vercel-deploy-pipeline` | **Date**: 2026-07-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-vercel-deploy-pipeline/spec.md`

## Summary

This stage changes **how WorkBoard ships**, not what it does. It (1) moves frontend hosting from the
CDK-provisioned **S3 + CloudFront** path to **Vercel** and deletes that web-hosting construct from
the stack while leaving the **entire AWS backend (API Gateway, Lambda, DynamoDB, Cognito)
CDK-managed and unchanged**; (2) turns the manual two-pass `npm run deploy` into an **automated
GitHub Actions pipeline that deploys the backend then the frontend when a PR merges to `main`**,
gated behind the existing quality gates; and (3) adds **automatic semantic versioning** — the
pipeline computes the next version from Conventional Commits, stamps it into the frontend build
(surfaced in the UI, per the user's explicit request), and creates a git tag + GitHub Release as
the last step so a version only exists once both deploys have succeeded.

The technical spine deliberately **reuses the existing `deploy.mjs` shape** (deploy infra → read
CDK outputs → build the frontend against those real values → publish), swapping only the publish
step: instead of a second `cdk deploy` that uploads to S3 and invalidates CloudFront, the pipeline
runs **`vercel deploy --prebuilt --prod`** against the Nx-built `apps/frontend/dist`. Because CI
owns the build (`nx build frontend`) and injects `VITE_API_BASE_URL`, `VITE_COGNITO_*`, and the new
`VITE_APP_VERSION` from CDK outputs + the computed version, the build stays inside the Nx graph
(Principle V, FR-012) and no configuration is duplicated into a Vercel dashboard that could drift.

The release model is the **hybrid** chosen in the spec: **merge is the trigger, tags provide
traceability/rollback**. Versioning is SemVer derived from Conventional Commits (the repo already
enforces `@commitlint/config-conventional`): `fix:`→patch, `feat:`→minor, breaking→major. Deploys
are **serialized** with a GitHub Actions `concurrency` group so two close merges can't race the
version or fight over the live deploy (edge case), and the **tag/Release is created only after both
backend and frontend deploys succeed** (FR-010, FR-015, SC-007). Rollback is redeploying a prior
tag's build to Vercel (frontend) and, if needed, `cdk deploy` from that tag (backend); DynamoDB data
is retained and never reverted (FR-019).

The one honest tension is with the **constitution's Technology Constraint** that names "CloudFront +
S3 serve the PWA." This migration supersedes that line by the user's directive; it is recorded as a
justified deviation in **Complexity Tracking** with a recommended constitution amendment.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 LTS; YAML for GitHub Actions; Rust/Tauri toolchain unchanged. No new application runtime language.

**Primary Dependencies**: (inherited) Nx, React 18 + Vite + shadcn/ui, AWS CDK v2, Vitest, Playwright. **New tooling (CI-only, not app runtime):** the **Vercel CLI** (`vercel`, invoked via `npx` in the pipeline — no committed runtime dep) for frontend publish; a **Conventional-Commits version/tag GitHub Action** (e.g. `mathieudutour/github-tag-action`) to compute the next SemVer and create the annotated tag; `gh release` / `softprops/action-gh-release` for the GitHub Release. No new **frontend or backend** dependency is added — the version reaches the UI as a build-time `VITE_APP_VERSION` env var (Principle VI).

**Storage**: Unchanged. DynamoDB single-table `WorkBoard` is retained across deploys; no schema/access-pattern change. No new persistence is introduced — "Release" records live as **git tags + GitHub Releases**, not in the app database.

**Testing**: Vitest for the infra template assertions (updated to assert **no** CloudFront/S3 web-hosting and an intact backend) and the frontend version-display component; Vitest for the pure parts of the deploy helper (version/URL resolution, prod-env injection guarding against local leakage); Playwright smoke that the running shell shows a version. The pipeline itself is validated end-to-end via `quickstart.md` (a real test-merge), since a GitHub Actions workflow is not unit-testable.

**Target Platform**: Frontend served by **Vercel** (PWA + Tauri consume the same build); AWS Lambda behind API Gateway backend; Cognito identity — backend platform unchanged.

**Project Type**: Nx monorepo — web frontend + serverless backend + IaC + shared library; plus CI/CD workflow and IaC hosting change. Unchanged shape.

**Performance Goals**: No app runtime performance change. Delivery targets from the spec: a merge to `main` reaches the live Vercel frontend within a single automated run with no human step between merge and live (SC-003); a failed backend **or** frontend deploy leaves the prior live version fully intact (SC-007).

**Constraints**: `main` stays continuously deployable and every production deploy originates from a merge (SC-001); backend deploys **before** the frontend so the live UI never targets an un-deployed backend (FR-009); the frontend build carries only public config (API URL + public Cognito IDs) and the version — **never** secrets (FR-004/FR-011, SC-008); all deploy credentials come from **GitHub Secrets**, never the repo or bundle (FR-011); the pipeline runs through **Nx targets / npm scripts**, not ad-hoc bypasses (FR-012); the version is **strictly increasing** and tag/Release identifies the exact commit (FR-014/FR-015).

**Scale/Scope**: Single-maintainer personal MVP, one production environment for the backend; Vercel per-PR previews for the frontend (US5). One IaC stack edited (remove `WebStack`), one CI workflow extended (add `deploy` + optional `preview` jobs), one manual deploy script refactored, one small shared-UI addition (version in `AppShell`), plus docs. No infra beyond removing hosting; no GSI; no new AWS resources (optionally one IAM OIDC role as a documented hardening, not required for MVP).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Obligation | Compliance in this plan |
|-----------|-----------|--------------------------|
| I. Layered, Feature-Modular Backend | No cross-module reach-in; layered backend | **No backend code change.** The backend Lambda/Express app is untouched; this stage only changes hosting + delivery. Compliant by non-interference. |
| II. Shared Frontend, One Codebase | One shared React/shadcn UI across PWA + Tauri; responsive; design-system components | The **only** UI change — the app version indicator — is added once to the shared `AppShell` (sidebar footer) from the existing design system, so it renders identically in the PWA and the Tauri desktop build. No platform fork. |
| III. Test-First Discipline (NON-NEGOTIABLE) | Vitest + Playwright before/with implementation; CI green before merge | Infra template test is **updated first** to assert the new reality (no CloudFront/S3 web hosting, backend intact) and fails against the old stack; the version-display component ships with a Vitest test; the deploy helper's pure logic (version/env resolution) is unit-tested; a Playwright smoke asserts the shell shows a version. The workflow's own behavior is validated via `quickstart.md` (unit-testing a YAML workflow is not practical — documented). The new `deploy` job is itself gated by the existing green quality gates (FR-008). |
| IV. Data Isolation & Auth Boundary | Auth at the boundary; ownership at the repository; **no secrets committed or bundled** | Auth/isolation are unchanged (backend untouched). The migration strengthens this principle's secrets clause: all deploy credentials (AWS, Vercel token, repo token) live in **GitHub Secrets**, never in the repo, logs, or the frontend bundle; the frontend build carries only the same public values it does today plus the version (SC-008, enforced by the existing secret/bundle scan which stays in the gate). |
| V. Infrastructure as Code & Single Nx Graph | AWS infra via CDK; Nx is the single build/test source of truth; no console resources | Backend infra stays **100% CDK** (FR-003); the change is a **deletion** of the `WebStack` construct, still as code. The frontend build runs through the **`nx build frontend`** target and the pipeline invokes Nx targets / npm scripts (FR-012), so the build stays in the Nx graph. **Deviation:** the frontend is now hosted on **Vercel**, which is not AWS/CDK — see Complexity Tracking (the constitution's "CloudFront + S3" constraint is superseded by the user directive; amendment recommended). |
| VI. Simplicity & Scope Discipline (YAGNI) | Simplest option unless a concrete need justifies more | Reuses the existing `deploy.mjs` deploy→outputs→build→publish shape rather than a new release framework; version via a single Conventional-Commits tag action + `VITE_APP_VERSION` build env (no `semantic-release`, no changelog engine, no in-app release DB); static AWS keys in GitHub Secrets for the MVP (OIDC noted as optional hardening, not built); Vercel previews reuse the same CLI. No speculative multi-env or backend versioning surface. |

**Result**: PASS with **one recorded deviation** (Principle V hosting-technology constraint) — justified, unavoidable given the feature's purpose, and captured in Complexity Tracking with a recommended constitution amendment. All other principles are satisfied.

## Project Structure

### Documentation (this feature)

```text
specs/006-vercel-deploy-pipeline/
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Phase 0 — resolved decisions (release model, Vercel publish, AWS auth, concurrency)
├── data-model.md        # Phase 1 — the release/version/config model (git tags + Releases + env matrix; no DB)
├── quickstart.md        # Phase 1 — validate the pipeline end-to-end (test merge → live → version → rollback)
├── contracts/           # Phase 1
│   ├── deploy-pipeline.md         # CI/CD contract: triggers, jobs, ordering, secrets, failure semantics
│   ├── versioning-and-release.md  # SemVer-from-commits, tag/Release format, version→UI path
│   └── frontend-build-config.md   # Build-time env contract incl. new VITE_APP_VERSION; how Vercel is fed
├── checklists/
│   └── requirements.md  # (existing) spec quality checklist
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
.github/
└── workflows/
    └── ci.yml                       # EXTEND: keep quality-gates; ADD a `deploy` job (needs: quality-gates,
                                     #   if push to main) → cdk deploy backend → build → vercel deploy → tag+release;
                                     #   ADD optional `preview` job (if pull_request) → vercel preview deploy

apps/
├── infra/
│   └── lib/
│       ├── web-stack.ts             # DELETE: the S3 bucket + CloudFront distribution + BucketDeployment
│       ├── workboard-stack.ts       # EDIT: drop `new WebStack(...)`, remove CloudFrontUrl + WebBucketName outputs
│       └── stack.spec.ts            # EDIT: remove S3/CloudFront assertion; assert backend intact + Lambda count = 1;
│                                    #   reword the CORS test comment (Vercel-hosted SPA, not CloudFront)
└── frontend/
    ├── src/
    │   ├── app/
    │   │   ├── app-shell.tsx        # EDIT: render `v{VITE_APP_VERSION}` in the sidebar footer (data-testid=app-version)
    │   │   └── app-shell.spec.tsx   # EDIT/ADD: assert the version indicator renders the injected value
    │   ├── app/app-version.ts       # NEW (optional): tiny helper reading import.meta.env.VITE_APP_VERSION with a dev fallback
    │   └── vite-env.d.ts            # EDIT: add readonly VITE_APP_VERSION?: string to ImportMetaEnv
    └── .env.example                 # EDIT: document VITE_APP_VERSION (build-injected; dev fallback)

tools/scripts/
├── deploy.mjs                       # EDIT: remove CloudFront/S3 references; publish via the Vercel helper instead of pass-2 cdk
├── deploy-frontend-vercel.mjs       # NEW: build frontend with prod env (+ VITE_APP_VERSION) and `vercel deploy --prebuilt --prod`
└── (reuse) prod-env injection logic # reused from today's deploy.mjs (move-aside .env.local so local values can't leak)

README.md                            # EDIT: replace the CloudFront one-command deploy section with the CI pipeline + Vercel flow
.specify/memory/constitution.md      # RECOMMENDED follow-up (separate PR): amend Tech Constraints CloudFront→Vercel (see Complexity Tracking)
```

**Structure Decision**: Keep the Nx layout unchanged. This is a **subtractive infra change + an additive CI/versioning change**, not a new feature module. The backend and shared library are untouched. The frontend gains a single shared-shell version indicator (Principle II). The delivery logic is centralized in the existing `.github/workflows/ci.yml` (gates → deploy) so there is one place that describes "how WorkBoard ships," and the reusable build/publish steps run through Nx targets and npm scripts (Principle V, FR-012) so the manual `npm run deploy` and CI stay in lockstep rather than diverging.

## Complexity Tracking

> One justified deviation from the constitution's stated Technology & Architecture Constraints.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|-----------|--------------------------------------|
| Frontend hosted on **Vercel** instead of the constitution-mandated **CloudFront + S3** (Principle V / Tech Constraints) | This is the **explicit purpose of the feature** as directed by the user ("migrate from CloudFront to Vercel"). The backend remains fully CDK-managed, so only the frontend-hosting technology constraint is affected. | Staying on CloudFront + S3 would defeat the feature. Because a Core Principle's wording is affected, this is not silently overridden: the plan **recommends a constitution amendment** (per the amendment procedure — a PR editing `.specify/memory/constitution.md`, PATCH/MINOR bump) to replace "CloudFront + S3 serve the PWA/static assets" with "Vercel serves the frontend; the AWS backend remains CDK-managed." Until that merges, this plan's PR description must call out the deviation per the Governance compliance-review rule. |
