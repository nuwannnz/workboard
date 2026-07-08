# WorkBoard

A personal-productivity workspace. **Stage 1** delivers the project foundation only — an Nx monorepo with a shared React frontend (PWA + Tauri desktop), a layered Express backend with a health endpoint, AWS CDK infrastructure, a shared types library, and a Vitest + Playwright test harness gated by CI. It intentionally ships **no** end-user feature behavior (FR-018).

## Required toolchain & versions (FR-015)

| Tool | Version | Needed for |
|------|---------|------------|
| Node.js | 22 LTS (`.nvmrc` → 22; tested on v22.19.0) | everything |
| npm | 10+ | single install / workspaces |
| Rust | stable (+ platform Tauri prereqs) | desktop build only (`nx run frontend:tauri`) |
| Docker | any recent | DynamoDB Local + cognito-local for fully-local dev (`npm run local`) |
| AWS credentials | configured locally | `infra` deploy only — **not** needed for local dev |

Use `nvm use` to select Node 22.

## Install (one command) — FR-003

```bash
npm install
```

Installs **all** workspace dependencies from the repo root with no per-package steps.

## Local development — one command (`npm run local`)

Runs the **entire app locally with no AWS account or credentials** — UI, API, database, and a
working authentication stack — from a single command:

```bash
npm run local
```

It orchestrates everything for you:

1. Starts the Docker backing services — **DynamoDB Local** and **cognito-local** (a no-AWS
   Cognito emulator) via `apps/backend/docker-compose.yml`.
2. Creates the `WorkBoard` DynamoDB table (the container is in-memory, so it's recreated each
   start) — `tools/scripts/bootstrap-dynamo.mjs`.
3. Seeds a local Cognito user pool + public app client — `tools/scripts/seed-cognito.mjs`.
4. Writes `apps/backend/.env` and `apps/frontend/.env.local` from the resolved local values
   (these are git-ignored and regenerated every run — never edit them by hand).
5. Runs the backend and frontend concurrently with combined logs.

| Service | URL | Notes |
|---------|-----|-------|
| Frontend (PWA) | http://localhost:4200 | open this |
| Backend (Express) | http://localhost:3000 | proxied from the UI as `/api` |
| DynamoDB Local | http://localhost:8000 | Docker |
| cognito-local | http://localhost:9229 | Docker; proxied from the UI as `/cognito` |

**Prerequisites:** Docker running and `npm install` done once. **No AWS credentials, no deployed
stack, no real email inbox.**

**Try the auth flow:** open http://localhost:4200 → you're redirected to `/login` → **Register**
with any email + a password (min 8 chars, a lowercase letter and a digit) → on **Verify** enter
the fixed local code **`123456`** → **Login** → the protected app shell loads and `GET /api/me`
returns your profile.

Stop the dev servers with `Ctrl+C`. The Docker containers are left running for fast restarts;
stop them with:

```bash
npm run local:down
```

### How auth works locally

Authentication is **AWS Cognito**, but locally there is no AWS and no real Cognito — the
`jagregory/cognito-local` emulator stands in for the user pool so the exact same client and
server libraries run offline:

- **Frontend** uses `amazon-cognito-identity-js` pointed at the emulator via
  `VITE_COGNITO_ENDPOINT=/cognito` (Vite proxies `/cognito` → `:9229`). Because cognito-local
  implements **only `USER_PASSWORD_AUTH` (no SRP)**, the client forces that flow locally; in
  production (no endpoint set) it uses SRP so passwords never leave the browser in plaintext.
- **Sign-up / verification:** cognito-local can't send email, so the verification code is fixed
  to **`123456`** (`CODE` in `docker-compose.yml`) and also printed to the container logs.
- **Backend** verifies the id token **in-process** with `aws-jwt-verify` (`AUTH_LOCAL_VERIFY=true`)
  using the generic `JwtRsaVerifier` against the emulator's local issuer + JWKS
  (`COGNITO_ISSUER` / `COGNITO_JWKS_URI`, over http). Deployed, the API Gateway Cognito
  authorizer verifies at the edge instead and this fallback is off.
- **Requests** carry the Cognito **id token** as `Authorization: Bearer <token>`; the profile row
  is keyed solely by the authenticated `sub` (`PK = USER#<sub>`), so users can only ever reach
  their own data.

**Local vs. production differences:** local uses `USER_PASSWORD_AUTH` + in-process token
verification against cognito-local; production uses SRP + real Cognito + the API Gateway
authorizer. cognito-local also has known limitations (refresh-token handling is quirky, most
Lambda triggers unsupported) — keep local auth to the register → verify → login → logout path.
For a run against **real** Cognito instead, deploy the CDK stack and set the `COGNITO_*` /
`VITE_COGNITO_*` values from its outputs (leaving `VITE_COGNITO_ENDPOINT` and the backend
`COGNITO_ISSUER`/`COGNITO_JWKS_URI` empty).

## Deploy to AWS — one command (`npm run deploy`)

Deploys the full stack (S3 + CloudFront hosting, API Gateway + Lambda, Cognito, DynamoDB) with a
correctly-configured production frontend:

```bash
npm run deploy      # requires AWS credentials + a bootstrapped account (cdk bootstrap)
```

The frontend must be built with the **deployed** API URL and Cognito IDs, which only exist after
the stack is created — a chicken-and-egg the script resolves automatically:

1. Deploys the infra (no site upload yet) and reads the CDK outputs (`ApiBaseUrl`, `UserPoolId`,
   `UserPoolClientId`, `CloudFrontUrl`).
2. Builds the frontend with those production values — real Cognito (SRP; `VITE_COGNITO_ENDPOINT`
   is empty, **not** the local `/cognito`) and the absolute API Gateway URL. It moves any local
   `.env.local` aside and forces a fresh build (`--skip-nx-cache`) so local values can't leak in.
3. Deploys again — the S3 upload publishes the build and invalidates CloudFront.

Notes:
- **Why the upload step exists:** the S3 bucket is private behind CloudFront (OAC). Without the
  build in the bucket, CloudFront returns S3 `AccessDenied` for every path — deploying the infra
  alone is not enough.
- **CORS:** the SPA (CloudFront origin) calls the API (API Gateway origin) cross-origin. The API
  enables CORS (`allowOrigins: *`, since requests carry a Bearer token, not cookies) including on
  error responses, so the client's refresh-on-401 works. Tighten `*` to the CloudFront domain in
  `apps/infra/lib/api-stack.ts` if you want.
- **Auth in production** uses **real Cognito with SRP** and the **API Gateway Cognito authorizer**
  (edge verification) — the local `USER_PASSWORD_AUTH` + in-process verifier path is off. Register
  a real email; Cognito emails a real verification code (no fixed `123456`).

## Workspace-wide commands (Nx) — FR-001

Every registered package is reachable through Nx with no bespoke scripts:

```bash
npx nx run-many -t build      # build every package (frontend, backend, infra, shared)
npx nx run-many -t lint       # lint every package
npx nx run-many -t test       # Vitest unit/integration across every package
npx nx affected -t lint test  # only packages affected by a change (used in CI)
npx nx show projects          # list registered packages
```

A newly registered package is included in `run-many`/`affected` automatically (FR-004). A directory that is **not** registered is surfaced by `nx show projects`, not silently skipped.

## Per-package commands

| Package | Command | What it does |
|---------|---------|--------------|
| frontend | `npx nx serve frontend` | Browser PWA (installable) shell |
| frontend | `npx nx run frontend:tauri` | Tauri desktop window (requires Rust) |
| frontend | `npx nx build frontend` | Production PWA build |
| backend | `npx nx serve backend` | Local Express server exposing `GET /health` |
| backend | `npx nx build backend` | Bundle backend (incl. Lambda entry) |
| frontend-e2e | `npx nx e2e frontend-e2e` | Playwright end-to-end sample |
| infra | `npx nx synth infra` | Synthesize the CDK stack |
| infra | `npx nx deploy infra` | Deploy all AWS resources (needs credentials) |
| shared | `npx nx build shared` / `npx nx test shared` | Build/test the shared types + Zod schemas |

## Backend health check (Stage 1's only runtime interface)

```bash
# Start DynamoDB Local
docker compose -f apps/backend/docker-compose.yml up -d
npx nx serve backend
curl -s http://localhost:3000/health   # 200 {"status":"healthy",...}
# Stop DynamoDB Local and re-call → 503 {"status":"unhealthy",...}
```

The request flows route → controller → service → repository (DynamoDB connectivity probe); no logic lives in the route/controller (Principle I).

## Configuration & secrets (FR-017)

Runtime config (table name, Cognito IDs, API base URL) is supplied via **environment variables** and **CDK stack outputs** — never committed and never inlined into the frontend bundle. For local dev, `npm run local` generates the git-ignored `apps/backend/.env` and `apps/frontend/.env.local` for you (see [`.env.example`](./apps/backend/.env.example) files for the shape). In CI, values come from GitHub Actions secrets.

## Commit & branching standards (FR-016)

- **Conventional Commits** enforced by commitlint via a husky `commit-msg` hook (`type(scope): subject`).
- **SemVer** at the release level.
- Feature-branch + PR workflow; `main` is the production branch.

## Branch protection (`main`) — FR-013

`main` must be protected in the repository settings:

- Require a pull request before merging (no direct pushes to `main`).
- Require the CI status check (`.github/workflows/ci.yml`: lint + Vitest + Playwright) to pass before merging.
- Require branches to be up to date before merging.

A failing quality gate therefore blocks the merge.

## Repository layout

```text
apps/
  frontend/       React + Vite + shadcn/ui PWA; Tauri desktop in src-tauri/; platform adapter in src/platform/
  frontend-e2e/   Playwright end-to-end project
  backend/        Layered Express app (routes/controllers/services/repositories/domain/...) + modules/* placeholders
  infra/          AWS CDK v2 app (S3+CloudFront, API Gateway, Lambda, DynamoDB, Cognito)
libs/
  shared/         Cross-package TypeScript types + Zod schemas (Task/Project/Note/User)
tools/vitest/     Shared Vitest base preset
```

## Testing (Principle III)

- **Vitest** for unit/integration in every package (`nx run-many -t test`).
- **Playwright** for e2e against the frontend (`nx e2e frontend-e2e`).
- CI runs both on every PR and blocks merges on failure.
