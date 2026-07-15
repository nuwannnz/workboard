# Quickstart: Validate the Vercel Migration & Deploy Pipeline

Runnable validation that the migration + pipeline + versioning work end-to-end. A GitHub Actions
workflow can't be unit-tested, so this guide is the primary acceptance path (Principle III).
References the contracts instead of repeating them.

## Prerequisites (one-time)

1. **Vercel**: a Vercel account + project for the frontend. Link it once from the repo root —
   `npx vercel link --cwd apps/frontend` — which creates `apps/frontend/.vercel/project.json`
   (git-ignored) and shows the org + project IDs. Create a deploy token in the Vercel dashboard
   (Account → Settings → Tokens). You now have `VERCEL_TOKEN`, `VERCEL_ORG_ID`,
   `VERCEL_PROJECT_ID`.
2. **AWS**: deploy-capable `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION`; account
   already `cdk bootstrap`-ed (as for today's manual deploy).
3. **GitHub Secrets** (repo → Settings → Secrets and variables → Actions): add all six —
   `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`,
   `VERCEL_PROJECT_ID` (see contracts/deploy-pipeline.md → Required secrets). None of these may
   ever appear in the repo, the frontend bundle, or logs (FR-011, SC-008).
4. **Branch protection**: `main` protected, PR-only, `quality-gates` required (already configured).

## A. Verify the infra change (no CloudFront/S3) — local, no deploy

```bash
npx nx test infra          # updated stack.spec.ts: backend intact, NO CloudFront/S3 web hosting
npx nx synth infra         # or: cd apps/infra && npx cdk synth
```

**Expect**: synth succeeds; the template has **no** `AWS::CloudFront::Distribution` and **no**
frontend-hosting `AWS::S3::Bucket`; DynamoDB, Lambda, API Gateway, Cognito still present (FR-002,
FR-003, SC-002). `stack.spec.ts` passes with the new assertions.

## B. Verify the version indicator — local, no deploy

```bash
npx nx test frontend       # app-shell.spec: renders v{VITE_APP_VERSION} (fallback 0.0.0-dev)
VITE_APP_VERSION=9.9.9 npx nx build frontend
# open apps/frontend/dist/index.html served statically → sidebar footer shows "v9.9.9"
```

**Expect**: with no env, the shell shows `v0.0.0-dev`; with `VITE_APP_VERSION=9.9.9`, it shows
`v9.9.9` at `data-testid="app-version"` (FR-016, SC-005).

## C. Verify a full production deploy on merge — the core path

1. Open a PR to `main` with a Conventional-Commit change (e.g. `feat: add release footer note`).
2. Confirm **`quality-gates`** runs on the PR and (optional) a **preview** URL is produced (US5).
   The preview must not change production or the version.
3. **Merge** the PR.

**Expect** (watch the `deploy` job — contract: deploy-pipeline §Ordered steps):

- Runs **only** because it's a `push` to `main` behind green gates (FR-006/7/8).
- Backend `cdk deploy` runs first; outputs captured (FR-009).
- Next version computed from commits; frontend built with those outputs + `VITE_APP_VERSION`.
- `vercel deploy --prod` publishes; the Vercel URL serves the app (FR-001).
- **Last**: an annotated `vX.Y.Z` tag + GitHub Release appear (FR-015).
- Open the live Vercel URL → sidebar shows **`vX.Y.Z`** matching the Release (SC-003, SC-005).
- Log in and exercise Week/Projects/Notes → all work through the new hosting (FR-020).

## D. Verify version increments across deploys

Merge a second `fix:` PR. **Expect**: a new, strictly-greater PATCH version, a second tag/Release,
and the live app reports the newer version (FR-014, SC-004, US3 #3).

## E. Verify partial-failure safety (SC-007)

Temporarily invalidate the `VERCEL_TOKEN` secret and merge a trivial PR. **Expect**: backend may
deploy but the Vercel step fails → the job fails **before** tagging → **no** new tag/Release, and
the previously live version still serves (SC-007). Restore the token afterward.

## F. Verify rollback (US4, SC-006)

Runbook (no manual rebuild — FR-018):

1. **Identify the live version**: GitHub → Releases. The newest Release is what's live (the
   pipeline tags only after both deploys succeed); each Release names its exact commit (FR-017).
2. **Pick the known-good tag** to return to (e.g. `v1.3.2`).
3. **Dispatch a redeploy**: Actions → CI → *Run workflow*, entering the tag in the `ref` input
   (or `gh workflow run ci.yml -f ref=v1.3.2`). The run checks out that tag, re-runs the gates,
   `cdk deploy`s the backend from that source, rebuilds the frontend with that tag's version,
   and republishes it to Vercel. **No new tag/Release is created** for an existing tag (FR-018).

**Expect**: the live app reports the previous version at `data-testid="app-version"`, and no
DynamoDB data is altered — the table and its contents are retained and never reverted (FR-019).

## G. Cutover checklist (FR-021)

Do these in order; only the **last** removes CloudFront:

1. Secrets configured (Prereqs).
2. First successful pipeline run → Vercel serves the app (step C).
3. Verify the Vercel URL/domain works (login + a feature flow).
4. If using a custom domain, point DNS at Vercel and confirm.
5. **Then** land the `WebStack` removal (this PR) and let the next deploy drop CloudFront/S3; confirm
   the app is still reachable only via Vercel (no unreachable window — FR-021, SC-002).

## Success criteria mapping

| Check | Validates |
|-------|-----------|
| A | FR-002, FR-003, SC-002 |
| B | FR-016, SC-005 |
| C | FR-001, FR-004, FR-006–009, FR-015, FR-020, SC-001, SC-003 |
| D | FR-013, FR-014, SC-004 |
| E | FR-010, SC-007 |
| F | FR-018, FR-019, SC-006 |
| G | FR-021, SC-002 |
| secret/bundle scan (in gates) | FR-011, SC-008 |
