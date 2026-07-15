# Phase 1 Data Model: Release & Delivery Model

This feature introduces **no application database entities** — nothing is written to DynamoDB. The
"data" here is **delivery metadata**: how a release is identified, where it is recorded, and the
configuration that binds a frontend build to its backend. Entities below map to the spec's Key
Entities.

## Entity: Version

The automatically assigned, strictly increasing identifier for a production deployment.

| Field | Value / Format | Source | Rules |
|-------|----------------|--------|-------|
| `version` | `MAJOR.MINOR.PATCH` (SemVer, e.g. `1.4.0`) | Computed by the tag action from Conventional Commits since the last tag | Strictly greater than the previous released version (FR-014). `fix:`→patch, `feat:`→minor, `!`/`BREAKING CHANGE`→major |
| `tagRef` | `vMAJOR.MINOR.PATCH` (e.g. `v1.4.0`) | Git annotated tag created by the pipeline | Points at the exact merge commit deployed (FR-015) |
| `buildVersion` | same string as `version` | Injected as `VITE_APP_VERSION` into the frontend build | Surfaced in the UI; must equal the live Release's version (FR-016, SC-005) |

**Initial state**: no tags exist today (`git tag -l` is empty). The first pipeline run establishes
the baseline (e.g. `v0.1.0` or per the action's default seed). Documented in `quickstart.md`.

## Entity: Release

A durable record of one successful production deployment. **Stored as a git tag + a GitHub
Release** — not in the app database.

| Field | Value | Notes |
|-------|-------|-------|
| `version` | the `Version.version` | Human-readable identity |
| `commit` | merge commit SHA on `main` | Exact source that produced backend + frontend (FR-015, FR-017) |
| `createdAt` | tag/Release timestamp | When it went live |
| `isLive` | the **most recent** Release is live | Determined by "latest tag whose deploy succeeded"; the pipeline only tags after both deploys pass, so the newest Release ⇔ what's live (FR-010, FR-017) |
| `notes` | auto-generated from Conventional Commit subjects (optional) | GitHub Release body; nice-to-have, not required |

**Lifecycle**: created only as the **final step** of a fully successful deploy run. A failed run
creates **no** Release, so the prior Release stays authoritative (SC-007).

## Entity: Deployment Run

A single execution of the pipeline's `deploy` job.

| Field | Value | Notes |
|-------|-------|-------|
| `trigger` | `push` to `main` (a merged PR) | Never for PR-branch pushes/forks (FR-007) |
| `gates` | must be green (`needs: quality-gates`) | No deploy on failing gates (FR-008) |
| `steps` | backend deploy → frontend build → Vercel publish → tag+Release | Strict order (FR-009); tag last (FR-015) |
| `concurrency` | group `deploy-main`, queued (no cancel) | Serializes overlapping merges (edge case) |
| `outcome` | success ⇒ new live Release; failure ⇒ no version advance | All-or-nothing live marker (SC-007) |

**State transitions**:

```text
merged PR (push:main) ──▶ quality-gates
        gates fail ──────────────▶ [no deploy, no release]           (FR-008)
        gates pass ──▶ cdk deploy backend
              backend fails ──────▶ [stop; prior Release stays live] (SC-007)
              backend ok ──▶ build frontend (with outputs + version)
                    build fails ──▶ [stop; prior Release stays live]
                    build ok ──▶ vercel deploy --prod
                          vercel fails ─▶ [stop; prior Release stays live]
                          vercel ok ──▶ create tag + GitHub Release   (now live)  (FR-015)
```

## Entity: Environment Configuration

The managed, non-committed values that bind a frontend build to its backend for a deployment.

| Key | Kind | Where it lives | Consumed by |
|-----|------|----------------|-------------|
| `VITE_API_BASE_URL` | public (build-time) | CDK output `ApiBaseUrl` (read at deploy time) | frontend bundle (`api-client.ts`) |
| `VITE_COGNITO_USER_POOL_ID` | public (build-time) | CDK output `UserPoolId` | frontend bundle (`cognito-client.ts`) |
| `VITE_COGNITO_CLIENT_ID` | public (build-time) | CDK output `UserPoolClientId` | frontend bundle (`cognito-client.ts`) |
| `VITE_APP_VERSION` | public (build-time) | computed Version (§2/§6) | frontend bundle (`AppShell` version indicator) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / region | **secret** | GitHub Secrets | `cdk deploy` step only (never bundled) |
| `VERCEL_TOKEN` | **secret** | GitHub Secrets | `vercel deploy` step only |
| `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` | config (non-secret) | GitHub Secrets/vars or `.vercel/project.json` | Vercel CLI project link |

**Invariant**: only **public** values (`VITE_*`: API URL, public Cognito IDs, version) ever enter
the frontend bundle. Secrets are used only by deploy steps and never printed or bundled (FR-004,
FR-011, SC-008); the existing secret/bundle scan gate continues to enforce this.

## Removed infrastructure (no longer modeled)

| Resource | Was | After |
|----------|-----|-------|
| Frontend S3 bucket (`WebBucket`) | CDK `WebStack` | **deleted** — no frontend-hosting bucket (FR-002, SC-002) |
| CloudFront distribution (`WebDistribution`) | CDK `WebStack` | **deleted** (FR-002, SC-002) |
| `BucketDeployment` (S3 upload + CDN invalidation) | CDK `WebStack` | **deleted** — replaced by `vercel deploy` |
| CDK outputs `CloudFrontUrl`, `WebBucketName` | `workboard-stack.ts` | **removed** |
| Backend: DynamoDB, Lambda, API Gateway, Cognito | CDK | **unchanged** (FR-003) |
