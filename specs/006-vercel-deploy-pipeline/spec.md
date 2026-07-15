# Feature Specification: Vercel Migration & Merge-Triggered Deploy Pipeline

**Feature Branch**: `006-vercel-deploy-pipeline`

**Created**: 2026-07-13

**Status**: Draft

**Input**: User description: "Plan a migration from CloudFront to Vercel. CDK should still manage infrastructure but without CloudFront for the frontend. Need a CI pipeline to deploy the AWS backend and Vercel frontend when a pull request is merged to the main branch. App versioning should also be handled with this. Think about the best release approach: tag based or merge based."

## Overview

This feature changes **how WorkBoard is hosted and shipped**, not what the app does for its end
users. The "users" of this capability are the people who maintain and operate WorkBoard — the
developer(s) merging pull requests and anyone who later needs to know what is live or roll it back.

Today the frontend is a static build hosted from a private S3 bucket fronted by a CloudFront
distribution, both provisioned by AWS CDK, and every release is a manual two-pass `npm run deploy`
run from a workstation. This feature (1) moves frontend hosting to **Vercel** and removes the
CloudFront + S3 web-hosting path from CDK while keeping **all backend infrastructure CDK-managed**,
(2) introduces an **automated pipeline that deploys the AWS backend and the Vercel frontend when a
pull request is merged into `main`**, and (3) adds **automatic application versioning** so every
deployment is identifiable, traceable, and reversible.

## Clarifications

### Recommended Release Approach (decision for the "tag-based vs merge-based" question)

The recommended approach is a **hybrid: merge-triggered continuous deployment that automatically
produces a version tag and release record per deploy.**

- **Merge is the trigger.** A merge to `main` is what starts a deploy. This matches the existing
  trunk-style workflow (protected `main`, PRs merged in), avoids a second manual "cut a release"
  step, and keeps `main` continuously deployed so the live app never drifts far from the source.
- **Tags provide traceability and rollback.** The pipeline computes the next semantic version from
  the merged commits (the repo already enforces Conventional Commits via commitlint), stamps that
  version into the build, and creates an annotated git tag + a release record. This gives every
  deploy a durable, human-readable identity and a fixed point to roll back to — the main benefit
  people associate with "tag-based" releases — without requiring a human to push tags by hand.

Pure merge-based (deploy on merge, no versioning) was rejected because it loses traceability and a
rollback target. Pure tag-based (deploy only when a human pushes a tag) was rejected because it
adds a manual gate that this single-maintainer workflow does not need and would let `main` drift
ahead of what is deployed. See **Assumptions** for the versioning scheme details.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Automatic deploy on merge to main (Priority: P1)

As the maintainer, when I merge a pull request into `main`, I want the AWS backend and the Vercel
frontend to deploy automatically, so that shipping a change requires no manual deploy commands from
my workstation and `main` is always what is live.

**Why this priority**: This is the core value of the feature — it replaces the manual
`npm run deploy` process and is the thing every other story builds on. Without it, nothing else is
worth doing.

**Independent Test**: Merge a trivial change (e.g. copy tweak) into `main` on a test/staging setup
and confirm that, with no further human action, the backend redeploys via CDK and the updated
frontend becomes live on Vercel.

**Acceptance Scenarios**:

1. **Given** a pull request that passes all quality gates, **When** it is merged into `main`,
   **Then** a deployment runs that updates the AWS backend (via CDK) and publishes the frontend to
   Vercel without any manual command being run.
2. **Given** a deployment is in progress, **When** it completes successfully, **Then** the live
   frontend on Vercel is talking to the deployed backend (correct API base URL and identity/auth
   configuration), with no local/development configuration leaking into the production build.
3. **Given** a push or commit that is **not** a merge to `main` (e.g. a PR branch commit), **When**
   CI runs, **Then** quality gates run but **no** production deployment occurs.

---

### User Story 2 - Frontend served from Vercel, CloudFront removed (Priority: P1)

As the maintainer, I want the frontend hosted on Vercel and the CloudFront + S3 web-hosting path
removed from CDK, while the backend (Lambda, API Gateway, DynamoDB, Cognito) stays fully
CDK-managed, so that the frontend benefits from Vercel's hosting/CDN and my infrastructure code no
longer carries a hosting path I no longer use.

**Why this priority**: This is the migration itself. It is P1 because the pipeline (US1) must
target the new hosting, not the old one — the two land together.

**Independent Test**: Deploy the stack and confirm no CloudFront distribution or web S3 bucket is
created for the frontend, the backend resources still exist and function, and the app is reachable
only via its Vercel URL/domain.

**Acceptance Scenarios**:

1. **Given** the updated infrastructure code, **When** the stack is deployed, **Then** it no longer
   provisions a CloudFront distribution or an S3 bucket for frontend hosting, and no deploy step
   uploads the frontend build to S3.
2. **Given** the migration is complete, **When** a user opens the application's public URL, **Then**
   the frontend is served by Vercel and the previously CloudFront-served URL no longer needs to be
   maintained.
3. **Given** the backend stack, **When** it is deployed after the change, **Then** the API Gateway,
   Lambda, DynamoDB table, and Cognito user pool are unchanged and continue to serve the frontend.
4. **Given** the frontend needs the backend's API URL and identity configuration, **When** it is
   built for Vercel, **Then** it receives those values from managed configuration (not hard-coded,
   not committed secrets).

---

### User Story 3 - Automatic versioning and release records (Priority: P2)

As the maintainer, I want each deployment to carry an automatically assigned version that is
recorded as a tag and a release, and shown in the running app, so that I can always tell exactly
what is live and correlate it to the source that produced it.

**Why this priority**: Versioning makes deployments traceable and enables rollback (US4). It
depends on US1 existing but delivers value on its own.

**Independent Test**: Merge two changes in sequence and confirm each produces a distinct, increasing
version, a corresponding tag/release record, and that the live app reports the newer version.

**Acceptance Scenarios**:

1. **Given** a merge to `main` that triggers a deploy, **When** the pipeline runs, **Then** it
   determines the next version automatically, stamps it into the deployed frontend, and creates a
   matching tag and release record.
2. **Given** a successful deployment, **When** a user or maintainer inspects the running app,
   **Then** the current version is visible (e.g. in a footer/about surface) and matches the release
   record.
3. **Given** two deployments in sequence, **When** the second completes, **Then** its version is
   strictly greater than the first and there is a release record for each.

---

### User Story 4 - Traceability and rollback (Priority: P2)

As the maintainer, when a deployment introduces a problem, I want to identify the currently live
version and redeploy a previous known-good version, so that I can recover quickly without
reconstructing what was shipped.

**Why this priority**: Rollback is the payoff of versioning and a safety net for continuous
deployment, but the system is usable (if riskier) without it, so P2.

**Independent Test**: From a list of releases, select a previous version and trigger its
redeployment, then confirm the live app reports that previous version.

**Acceptance Scenarios**:

1. **Given** the release records, **When** the maintainer looks at them, **Then** they can identify
   which version is currently live and which commit produced it.
2. **Given** a previous known-good release, **When** the maintainer initiates a rollback to it,
   **Then** the frontend (and, where applicable, the backend) is restored to that version's state
   and the live app reports that version.

---

### User Story 5 - PR validation and preview before merge (Priority: P3)

As the maintainer, before I merge a pull request, I want the existing quality gates to run and a
preview of the frontend to be available, so that I can review the change in a running environment
and be confident the merge will deploy cleanly.

**Why this priority**: A convenience/safety enhancement on top of the required merge-triggered
deploy; nice to have but not required for the migration to function.

**Independent Test**: Open a PR that changes the UI and confirm the quality gates run and a
per-PR preview of the frontend is reachable, and that neither touches the production deployment.

**Acceptance Scenarios**:

1. **Given** an open pull request to `main`, **When** CI runs, **Then** lint, unit/integration, and
   end-to-end quality gates run as they do today and must pass before merge is allowed.
2. **Given** an open pull request that changes the frontend, **When** it is processed, **Then** a
   preview deployment of the frontend is available for review without affecting the production
   deployment or its version.

---

### Edge Cases

- **Partial deploy failure**: the backend deploy succeeds but the frontend deploy fails (or vice
  versa). The pipeline must surface a clear failure, must not create/advertise a version/release as
  "shipped" when it is not fully live, and must leave the previously live version intact.
- **Concurrent merges**: two PRs merge to `main` close together. Deployments and version assignment
  must not race into a corrupted or ambiguous "what is live" state (e.g. out-of-order version
  numbers or two builds fighting over the same deploy).
- **Frontend/backend config drift**: the frontend build is published pointing at the wrong API URL
  or identity configuration (stale, local, or another environment's values).
- **Version collision / non-increasing version**: the computed version equals or is lower than the
  last released version.
- **Migration cutover**: users still reaching the old CloudFront URL after the switch, or DNS/domain
  pointing at the old distribution during the transition.
- **Secrets absent or invalid**: required deploy credentials (AWS, Vercel, repository tokens) are
  missing, expired, or misconfigured when the pipeline runs.
- **Failed quality gates on `main`**: a change reaches `main` whose gates fail — should not produce a
  live deployment or a release record.
- **Backend rollback with data**: rolling back the backend must not destroy or corrupt persisted
  user data in DynamoDB.

## Requirements *(mandatory)*

### Functional Requirements

**Hosting migration**

- **FR-001**: The frontend MUST be hosted on Vercel and reachable at a stable public URL/domain.
- **FR-002**: The infrastructure-as-code MUST NOT provision a CloudFront distribution or an S3
  bucket for frontend hosting, and no deployment step may upload the frontend build to S3 for
  hosting.
- **FR-003**: All backend infrastructure (API Gateway, Lambda, DynamoDB, Cognito) MUST remain
  defined and managed as code via AWS CDK; the migration MUST NOT convert any backend resource to
  manual/console management.
- **FR-004**: The frontend deployed to Vercel MUST be configured with the correct production API
  base URL and identity/auth configuration derived from the deployed backend, with no
  local/development values and no committed secrets in the bundle.
- **FR-005**: Stack outputs the frontend depends on (API base URL, identity pool/client identifiers)
  MUST remain available as code-managed outputs and MUST be consumable by the frontend build/deploy
  process.

**Deployment pipeline**

- **FR-006**: The system MUST automatically deploy the AWS backend and the Vercel frontend when a
  pull request is merged into `main`, with no manual deploy command required.
- **FR-007**: The pipeline MUST NOT perform a production deployment for events other than a merge
  into `main` (e.g. PR-branch pushes, forks) — those run quality gates only.
- **FR-008**: The pipeline MUST run the existing quality gates (lint, unit/integration tests,
  frontend build, secret/bundle scan, end-to-end tests) and MUST NOT deploy if the gates fail.
- **FR-009**: The pipeline MUST deploy the backend before (or in a defined order relative to) the
  frontend such that the live frontend always targets a compatible, already-deployed backend.
- **FR-010**: The pipeline MUST fail loudly and stop advancing the live version if either the
  backend or the frontend deploy step fails, leaving the previously live version intact.
- **FR-011**: All credentials the pipeline needs (AWS deploy credentials, Vercel deploy token,
  repository tokens) MUST be supplied via managed secrets and MUST NOT be committed to the
  repository or exposed in logs or the frontend bundle.
- **FR-012**: The pipeline MUST be reproducible from the monorepo's existing task/build system (Nx
  targets) rather than ad-hoc scripts that bypass the monorepo graph.

**Versioning & releases**

- **FR-013**: Each production deployment MUST be assigned an application version automatically,
  without a human manually choosing or pushing the version.
- **FR-014**: The assigned version MUST be strictly increasing across successive deployments and MUST
  follow a defined, documented scheme.
- **FR-015**: Each production deployment MUST create a durable release record and a version tag that
  identifies the exact source commit that was deployed.
- **FR-016**: The running application MUST expose its current version in a user-visible surface (e.g.
  footer/about), and that version MUST match the release record for what is live.
- **FR-017**: The maintainer MUST be able to determine, from release records, which version is
  currently live and which commit produced it.
- **FR-018**: The maintainer MUST be able to roll back to a previous released version, restoring the
  frontend (and backend where applicable) to that version's state, without a manual rebuild-by-hand.
- **FR-019**: Rollback of the backend MUST NOT destroy or corrupt persisted user data.

**Migration & continuity**

- **FR-020**: The migration MUST NOT change the application's behavior or data for end users; auth,
  data isolation, and all existing feature flows MUST continue to work through the new hosting.
- **FR-021**: The cutover from CloudFront to Vercel MUST be describable as a sequence that avoids a
  window where the application is unreachable, and MUST allow the old distribution to be
  decommissioned only after the Vercel hosting is confirmed live.

### Key Entities *(include if feature involves data)*

- **Release**: A record of one production deployment. Attributes: version identifier, source commit,
  timestamp, and whether it is the currently live release. Relates to the exact frontend build and
  backend deployment that were shipped together.
- **Version**: The automatically assigned, strictly increasing identifier for a Release, following
  the documented scheme; stamped into the running frontend and surfaced to users.
- **Deployment run**: A single execution of the pipeline triggered by a merge to `main`; produces
  (on success) a Release, a live backend, and a live frontend, or (on failure) no advance of the
  live version.
- **Environment configuration**: The managed, non-committed set of values (API base URL, identity
  configuration, deploy credentials) that binds the frontend and backend together for a deployment.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Shipping a merged change to production requires **zero** manual deploy commands — 100%
  of production deployments originate from a merge to `main`.
- **SC-002**: After the migration, **no** CloudFront distribution or frontend-hosting S3 bucket
  exists in the deployed infrastructure, and the backend resources remain 100% code-managed.
- **SC-003**: A change merged to `main` reaches the live Vercel frontend within a single automated
  run with no human intervention between merge and live.
- **SC-004**: Every production deployment has a distinct, strictly increasing version and a matching
  release record — 100% of deployments are traceable to their source commit.
- **SC-005**: The version reported by the running application matches the live release record 100% of
  the time immediately after a deployment completes.
- **SC-006**: The maintainer can identify the live version and roll back to a previous known-good
  version using only the release records and the pipeline — no manual reconstruction of a build.
- **SC-007**: A deploy that fails on either the backend or the frontend leaves the previously live
  version fully functional (no partial or broken "live" state) in 100% of failure cases.
- **SC-008**: No credentials or secrets appear in the repository, the frontend bundle, or pipeline
  logs (existing secret/bundle scan continues to pass).

## Assumptions

- **Release approach**: The hybrid merge-triggered + auto-tagged approach described in
  **Clarifications** is adopted. Versioning follows **Semantic Versioning** derived from Conventional
  Commits (the repo already enforces `@commitlint/config-conventional`): `fix:` → patch, `feat:` →
  minor, a breaking-change marker → major. This is the documented scheme referenced by FR-014.
- **Single environment**: Consistent with the project's single-environment personal-MVP scope, there
  is one production environment for the backend. Vercel provides per-PR **preview** deployments for
  the frontend (US5); the backend is not preview/staged per PR.
- **Domain/DNS**: A custom domain may be pointed at Vercel; if no custom domain is used, the Vercel
  project URL is the stable public URL. DNS changes required for cutover are performed by the
  maintainer as part of FR-021.
- **CI platform**: The pipeline is built on the existing GitHub Actions setup (the repo already has
  `.github/workflows/ci.yml` running quality gates on PRs and pushes to `main`); this feature extends
  that rather than introducing a new CI system.
- **Vercel account**: A Vercel account/project and a deploy token are available and configured as
  repository secrets; establishing the Vercel account itself is a prerequisite, not part of the app.
- **AWS credentials**: Deploy-capable AWS credentials are available to the pipeline as managed
  secrets, and the AWS account is CDK-bootstrapped (as it is for the current manual deploy).
- **Backend rollback scope**: Backend rollback means redeploying a previous version's
  infrastructure/code definition; it explicitly excludes reverting DynamoDB data (FR-019), since the
  data table is retained across deploys.
- **Frontend build configuration**: The mechanism that injects production API/identity values into
  the frontend build (today handled by the manual deploy script from CDK outputs) is adapted to run
  in the pipeline for the Vercel build, replacing the S3/CloudFront upload path.
