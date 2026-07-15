# Phase 0 Research: Vercel Migration & Merge-Triggered Deploy Pipeline

All decisions below resolve the Technical Context. No open `NEEDS CLARIFICATION` remains. The
Vercel account/project + token and deploy-capable AWS credentials are treated as prerequisites
(spec Assumptions), not built by this feature.

## §1 — Release approach (tag-based vs merge-based)

**Decision**: **Hybrid — merge-triggered continuous deployment that auto-produces a version tag +
GitHub Release per deploy.** A merge to `main` (a `push` event on `main`) is the trigger; the
pipeline computes the next SemVer from Conventional Commits, stamps it into the build, and creates
an annotated `vX.Y.Z` tag + Release **only after both deploys succeed**.

**Rationale**: Matches the existing trunk workflow (protected `main`, PR-only merges) and the
constitution's "`main` is always production-deployable." Merge-as-trigger removes a manual
"cut a release" step; auto-tagging preserves the traceability and rollback target people want from
tag-based releases. Deferring the tag to after a successful deploy makes a version mean "this is
live," satisfying FR-010/FR-015/SC-007.

**Alternatives considered**:
- *Pure merge-based (deploy, no version)* — rejected: no traceability, no rollback target (fails
  FR-013/FR-015/US4).
- *Pure tag-based (deploy only when a human pushes a tag)* — rejected: adds a manual gate a
  single-maintainer flow doesn't need and lets `main` drift ahead of what's deployed.

## §2 — Version computation & tagging tool

**Decision**: Compute the next version from Conventional Commits in the workflow using a small,
widely-used **GitHub Action** (`mathieudutour/github-tag-action` or equivalent), which outputs the
`new_version` and creates the annotated tag; create the GitHub Release with `gh release create` /
`softprops/action-gh-release`. The computed version is passed forward as `VITE_APP_VERSION` for the
build. No `package.json` version bump commit is required (avoids a bot push back to `main`).

**Rationale**: The repo already enforces `@commitlint/config-conventional`, so commit messages are
already machine-readable; a focused action keeps this to a few workflow lines with **zero new
committed dependencies** (Principle VI). Mapping: `fix:`→patch, `feat:`→minor, `!`/`BREAKING
CHANGE`→major (constitution's SemVer policy).

**Alternatives considered**:
- *`semantic-release`* — rejected: heavyweight, npm-publish-oriented, large plugin surface for a
  personal MVP (Principle VI).
- *`commit-and-tag-version` / `standard-version` committed as a devDependency + a bot commit* —
  rejected: adds a dep and a push-back-to-`main` commit that complicates branch protection; the
  action computes the same result without a commit.
- *Hand-rolled commit parser* — rejected: reinvents a solved problem.

## §3 — Who builds the frontend, and how Vercel is fed

**Decision**: **CI builds the frontend** via `nx build frontend`, injecting `VITE_API_BASE_URL`,
`VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID` (from the just-deployed CDK outputs) and
`VITE_APP_VERSION` (from §2). The prebuilt output is published with **`vercel deploy --prebuilt
--prod --token=$VERCEL_TOKEN`** (Vercel project linked via `VERCEL_ORG_ID` + `VERCEL_PROJECT_ID`).
This mirrors today's `deploy.mjs` (deploy infra → read outputs → build → publish), swapping the
pass-2 S3 upload for the Vercel publish.

**Rationale**: Keeps the build inside the **Nx graph** and driven by CDK outputs (Principle V,
FR-012), so there is a single source of truth for the production config and no Vercel-dashboard env
that could silently drift from the deployed backend (edge case: config drift). Reuses the existing
clever `.env.local` move-aside guard so local values can never leak into a production bundle
(FR-004, SC-008).

**Alternatives considered**:
- *Vercel Git integration builds on push* — rejected: splits the build out of the Nx graph and
  forces production API/Cognito values to be maintained in the Vercel dashboard, which drifts from
  CDK outputs; also harder to sequence "backend first" (FR-009).
- *`vercel deploy` uploading source (Vercel runs `nx build`)* — rejected for the same env-drift and
  Nx-graph reasons; prebuilt gives CI full control of build inputs.

## §4 — AWS authentication for the pipeline

**Decision**: **Static AWS deploy credentials stored as GitHub Secrets** (`AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, region) for the MVP, consumed via `aws-actions/configure-aws-credentials`.
GitHub **OIDC role assumption** is documented as the recommended hardening path but is **not built**
in this stage.

**Rationale**: Matches the existing "AWS credentials configured as for any `cdk deploy`" model and
keeps setup friction low for a single-maintainer MVP (Principle VI). GitHub Secrets are not
committed, so this satisfies the constitution's secrets clause (Principle IV). OIDC removes the
long-lived key entirely and is the right next step, but adds an IAM OIDC provider + role (extra
infra) that YAGNI doesn't justify for the first cut.

**Alternatives considered**:
- *GitHub OIDC → assume-role now* — deferred, not rejected: more secure (no long-lived key) but
  extra CDK/IAM scope; recorded as the recommended follow-up.

## §5 — Ordering, concurrency & partial-failure semantics

**Decision**: Single serialized deploy path. In `ci.yml`, a `deploy` job with
`needs: quality-gates` and `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`
runs steps **in order**: (1) `cdk deploy` backend → capture outputs, (2) build frontend, (3)
`vercel deploy --prod`, (4) create tag + Release. A workflow-level
`concurrency: { group: deploy-main, cancel-in-progress: false }` **queues** overlapping runs. Any
failing step fails the job and **stops before tagging**, leaving the previous tag/Release as the
live marker.

**Rationale**: Backend-before-frontend guarantees the live UI never targets an un-deployed backend
(FR-009). `cancel-in-progress: false` prevents two close merges from racing the version or aborting
a half-finished deploy (edge case: concurrent merges). Tagging last makes "a version exists" ⇔
"both deploys succeeded" (FR-010, FR-015, SC-007).

**Alternatives considered**:
- *Parallel backend/frontend jobs* — rejected: violates ordering (FR-009) and complicates
  all-or-nothing tagging.
- *`cancel-in-progress: true`* — rejected: could abandon an in-flight deploy mid-way, risking a
  partial live state.

## §6 — Surfacing the version in the UI

**Decision**: Inject `VITE_APP_VERSION` at build time; a tiny `app-version.ts` helper reads
`import.meta.env.VITE_APP_VERSION` with a `0.0.0-dev` fallback; `AppShell` renders `v{version}` in
the sidebar footer with `data-testid="app-version"`. Add `VITE_APP_VERSION?` to `vite-env.d.ts`.

**Rationale**: Build-time env is how every other production value already reaches the bundle
(`VITE_API_BASE_URL`, `VITE_COGNITO_*`), so this adds **no new dependency or runtime fetch**
(Principle VI) and renders identically in the PWA and Tauri (Principle II). The `data-testid` gives
a stable Playwright/Vitest hook (FR-016, SC-005).

**Alternatives considered**:
- *Fetch version from a backend `/health` field* — rejected: a runtime round-trip and a backend
  change for a value already known at build time.
- *Read `package.json` at runtime* — rejected: not available in the browser bundle cleanly; the
  authoritative version is the pipeline-computed one, not the workspace file.

## §7 — CDK web-hosting removal & test impact

**Decision**: Delete `web-stack.ts`; remove `new WebStack(...)` and the `CloudFrontUrl` +
`WebBucketName` outputs from `workboard-stack.ts`. Update `stack.spec.ts`: drop the S3/CloudFront
assertion, assert the backend is intact, and (now that the bucket's auto-delete + BucketDeployment
custom-resource Lambdas are gone) the function count can be asserted as the single backend Lambda;
reword the CORS test comment from "CloudFront-hosted SPA" to "Vercel-hosted SPA."

**Rationale**: Backend resources are unaffected (FR-003, SC-002); the only removed resources are the
web bucket, the distribution, and their deploy-time helper Lambdas. Updating the test **first** to
the new expectation keeps Principle III (the test fails against the old stack, passes after
removal).

**CORS note**: API Gateway currently allows `*` origins with a Bearer-token (no-cookie) model, which
already works for a Vercel origin — **no CORS change is required**. Tightening `allowOrigins` to the
Vercel domain is noted as optional future hardening (Principle VI: not done now).

## §8 — Cutover & rollback

**Decision**: Cutover order (FR-021): (1) stand up the Vercel project + secrets, (2) run the
pipeline so Vercel serves the app, (3) verify against the Vercel URL/domain, (4) point DNS at Vercel
if a custom domain is used, (5) only then remove `WebStack` / decommission CloudFront. Rollback:
re-run the pipeline (or a `workflow_dispatch`) against a previous `vX.Y.Z` tag to rebuild+republish
that frontend to Vercel; for the backend, `cdk deploy` from that tag. **DynamoDB is retained and
never reverted** (FR-019).

**Rationale**: Removing CloudFront only after Vercel is confirmed live avoids an unreachable window
(FR-021). Because the frontend build is fully reconstructible from a tag (deterministic inputs:
source + CDK outputs + version), rollback needs no stored artifact — just a re-run at that ref
(US4, SC-006).

**Alternatives considered**:
- *Store built frontend artifacts per release for rollback* — rejected: unnecessary; the build is
  reproducible from the tagged source, and Vercel also retains prior deployments that can be
  promoted (a documented manual fallback).
