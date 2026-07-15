# Contract: Frontend Build Configuration (Vercel)

The build-time env contract for the frontend and how it is fed to Vercel. Extends today's
`VITE_*` model with `VITE_APP_VERSION`; the delivery mechanism changes from S3/CloudFront upload to
Vercel publish. Only `VITE_`-prefixed values reach the bundle.

## Build-time env vars (all public — safe to bundle)

| Var | Meaning | Prod source | Local dev |
|-----|---------|-------------|-----------|
| `VITE_API_BASE_URL` | API Gateway base URL | CDK output `ApiBaseUrl` | `/api` (Vite proxy) |
| `VITE_COGNITO_USER_POOL_ID` | Cognito pool id (public) | CDK output `UserPoolId` | cognito-local id |
| `VITE_COGNITO_CLIENT_ID` | Cognito app client id (public) | CDK output `UserPoolClientId` | cognito-local id |
| `VITE_COGNITO_ENDPOINT` | local emulator endpoint | *(empty in prod → real SRP)* | `/cognito` |
| `VITE_APP_VERSION` | **NEW** app version string | pipeline-computed SemVer (§2) | unset → `0.0.0-dev` fallback |

**Typing** (`apps/frontend/src/vite-env.d.ts`): add `readonly VITE_APP_VERSION?: string;` to
`ImportMetaEnv`.

**Reader** (`apps/frontend/src/app/app-version.ts`, new): export the version string, defaulting to
`0.0.0-dev` when the env var is absent, so local/dev builds render a sensible value.

## Production build → publish flow (replaces S3/CloudFront)

1. Backend deployed first; CDK outputs read (deploy-pipeline §3).
2. Move aside any `.env.local` / `.env.production.local` so local values cannot override the prod
   build (existing `deploy.mjs` guard — prevents `/api` `/cognito` leakage). (FR-004, SC-008)
3. `nx build frontend --skip-nx-cache` with the prod `VITE_*` values (incl. `VITE_APP_VERSION`) in
   env. `--skip-nx-cache` because Nx doesn't track `.env`/env inputs, so a cached bundle could carry
   stale values (existing rationale).
4. `vercel deploy --prebuilt --prod --token=$VERCEL_TOKEN` publishes `apps/frontend/dist`.
5. Restore moved-aside env files.

This is the same shape as today's `tools/scripts/deploy.mjs`, refactored so the publish step is the
Vercel helper (`tools/scripts/deploy-frontend-vercel.mjs`) instead of a second `cdk deploy`. Both the
CI `deploy` job and the manual `npm run deploy` call the same helper (single source of truth,
FR-012).

## Vercel project

- Linked via `VERCEL_ORG_ID` + `VERCEL_PROJECT_ID` (+ `VERCEL_TOKEN`); no source-committed secrets.
- SPA routing: Vercel serves `index.html` for unknown client routes (rewrite to `/index.html`),
  replacing CloudFront's 403/404→`index.html` error responses. Configured via `vercel.json`
  (rewrites `/(.*)` → `/index.html`) or the project's SPA framework preset.

## Invariants

- **INV-1**: only public `VITE_*` values enter the bundle; no secrets (FR-004, FR-011, SC-008).
- **INV-2**: prod build never inherits local `.env.local` values (move-aside guard).
- **INV-3**: the published frontend targets the just-deployed backend's outputs (no drift; FR-009).
- **INV-4**: `VITE_APP_VERSION` in the bundle equals the release version (FR-016, SC-005).
