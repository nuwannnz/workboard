# Contract: Deploy Pipeline (GitHub Actions)

Defines the CI/CD contract that replaces the manual `npm run deploy`. Implemented by extending
`.github/workflows/ci.yml`. This is a behavioral contract, not literal final YAML.

## Triggers

| Event | Jobs that run | Deploys? |
|-------|---------------|----------|
| `pull_request` → `main` | `quality-gates`, `preview` (optional, US5) | Frontend **preview** only; never production |
| `push` → `main` (merged PR) | `quality-gates`, then `deploy` | **Yes** — backend + frontend production |
| any other push/branch | `quality-gates` | No (FR-007) |

## Job: `quality-gates` (unchanged)

Existing job: install → Nx affected lint+test → build frontend → secret/bundle scan → Playwright
e2e. Remains the merge gate (constitution Principle III). **`deploy` depends on it** (FR-008).

## Job: `deploy`

```yaml
needs: quality-gates
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
concurrency:
  group: deploy-main
  cancel-in-progress: false        # queue overlapping merges; never abandon a running deploy
```

**Ordered steps (all-or-nothing; a failure stops before tagging):**

1. **Checkout** (full history + tags: `fetch-depth: 0`) and **setup Node 22** + `npm ci`.
2. **Configure AWS credentials** from GitHub Secrets (`aws-actions/configure-aws-credentials`).
3. **Deploy backend** — `nx run infra:deploy` (`cdk deploy --all --require-approval never`) writing
   `--outputs-file`; parse `ApiBaseUrl`, `UserPoolId`, `UserPoolClientId` (FR-003, FR-009).
   *(After WebStack removal there is no `CloudFrontUrl`/`WebBucketName`.)*
4. **Compute next version** — Conventional-Commits tag action → `new_version` output (§2). Does
   **not** create the tag yet (tag is step 7, after deploys succeed).
5. **Build frontend** — `nx build frontend` with env: `VITE_API_BASE_URL`, `VITE_COGNITO_USER_POOL_ID`,
   `VITE_COGNITO_CLIENT_ID` (from step 3) and `VITE_APP_VERSION` (from step 4). Reuse the
   `.env.local` move-aside guard so no local value leaks (FR-004, SC-008).
6. **Publish to Vercel** — `vercel deploy --prebuilt --prod --token=$VERCEL_TOKEN` (project linked via
   `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID`) against `apps/frontend/dist` (FR-001, FR-006).
7. **Tag + Release** — create annotated `v<new_version>` on the merge commit and a GitHub Release
   (FR-015). **This is the last step**, so a version exists only when both deploys succeeded
   (FR-010, SC-007).

**Failure semantics**: any step 2–6 failing fails the job before step 7 → **no new tag/Release**,
prior live version intact (SC-007). Backend-before-frontend ordering is fixed (FR-009).

## Job: `preview` (optional, US5 / P3)

```yaml
if: github.event_name == 'pull_request'
```

Build the frontend (against the existing production backend outputs or a documented preview config)
and `vercel deploy` **without** `--prod`; surface the returned preview URL (e.g. PR comment/summary).
Must not touch the production deployment or advance the version (US5 acceptance #2).

## Required secrets / variables (GitHub Secrets)

| Name | Purpose | Never in |
|------|---------|----------|
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` | `cdk deploy` (FR-003) | repo / bundle / logs |
| `VERCEL_TOKEN` | `vercel deploy` (FR-001) | repo / bundle / logs |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | Vercel project link | (non-secret ok) |
| `GITHUB_TOKEN` (built-in) | create tag + Release (FR-015) | — |

All satisfy FR-011 (managed secrets, never committed) and SC-008.

## Invariants

- **INV-1**: Production deploy happens **only** on `push` to `main` behind green gates (FR-006/7/8).
- **INV-2**: Backend deploys before the frontend build/publish (FR-009).
- **INV-3**: A tag/Release is created **iff** both deploys succeeded (FR-010, FR-015, SC-007).
- **INV-4**: Overlapping merges are serialized, never run concurrently (edge case).
- **INV-5**: No secret enters the frontend bundle or logs (FR-011, SC-008).
- **INV-6**: All build/deploy commands run through Nx targets / npm scripts (FR-012).
