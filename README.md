# WorkBoard

A personal-productivity workspace. **Stage 1** delivers the project foundation only — an Nx monorepo with a shared React frontend (PWA + Tauri desktop), a layered Express backend with a health endpoint, AWS CDK infrastructure, a shared types library, and a Vitest + Playwright test harness gated by CI. It intentionally ships **no** end-user feature behavior (FR-018).

## Required toolchain & versions (FR-015)

| Tool | Version | Needed for |
|------|---------|------------|
| Node.js | 22 LTS (`.nvmrc` → 22; tested on v22.19.0) | everything |
| npm | 10+ | single install / workspaces |
| Rust | stable (+ platform Tauri prereqs) | desktop build only (`nx run frontend:tauri`) |
| Docker | any recent | DynamoDB Local for backend/health dev |
| AWS credentials | configured locally | `infra` deploy only |

Use `nvm use` to select Node 22.

## Install (one command) — FR-003

```bash
npm install
```

Installs **all** workspace dependencies from the repo root with no per-package steps.

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

Runtime config (table name, Cognito IDs, API base URL) is supplied via **environment variables** and **CDK stack outputs** — never committed and never inlined into the frontend bundle. Copy [`.env.example`](./.env.example) to `.env` for local development. In CI, values come from GitHub Actions secrets.

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
