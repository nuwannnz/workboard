# Contract: Nx Workspace & Developer Command Surface

The monorepo's task runner is the "interface" contributors depend on (FR-001, FR-003, FR-015, Principle V). These commands MUST exist and behave as described; exact target implementations live in `tasks.md`/implementation.

## Single install

| Command | Contract |
|---------|----------|
| `npm install` (repo root) | Installs **all** workspace dependencies on a clean checkout with no per-package manual steps (FR-003, US1 AS1). |

## Workspace-wide targets

Every registered package MUST be reachable through these without bespoke scripts (FR-001, SC-002). A newly registered package is included automatically (FR-004, US1 AS4).

| Command | Contract |
|---------|----------|
| `npx nx run-many -t build` | Builds every package (frontend, backend, infra, shared). US1 AS2. |
| `npx nx run-many -t lint` | Lints every package. US1 AS3. |
| `npx nx run-many -t test` | Runs Vitest unit/integration across every package; all samples pass. US1 AS3, SC-007. |
| `npx nx affected -t build lint test` | Runs the above only for packages affected by a change (CI efficiency). |

## Per-package run/serve targets

| Command | Contract |
|---------|----------|
| `npx nx serve frontend` | Starts the frontend as a browser PWA (installable). US2 AS1. |
| `npx nx run frontend:tauri` (or documented desktop target) | Launches the Tauri desktop window rendering the same shell. US2 AS2. |
| `npx nx serve backend` | Starts the local Express server exposing `GET /health`. US3 AS1. |
| `npx nx e2e frontend-e2e` | Runs the Playwright end-to-end sample(s). SC-007. |
| `npx nx synth infra` (or documented CDK synth target) | Synthesizes the full CDK stack without errors. US4 AS1. |
| `npx nx deploy infra` (or documented CDK deploy target) | Deploys all resources as code, no console steps. US4 AS2. |

## Registration contract

| Given | When | Then |
|-------|------|------|
| A new package is added and registered in the Nx workspace | `nx run-many`/`nx affected` runs | It is included in build/lint/test automatically (FR-004). |
| A package directory exists but is **not** registered in the Nx graph | Workspace runs execute | It is detectably excluded (not silently skipped) — surfaced via `nx show projects` (edge case). |

## Documentation contract (FR-015, SC-008)

`README.md` MUST document the required toolchain and versions, the single install command, and how to build, run, test, and deploy every package — sufficient for a new contributor to operate all packages without asking a maintainer.
