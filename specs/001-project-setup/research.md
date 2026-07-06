# Phase 0 Research: Stage 1 — Project Setup & Foundation

The technology stack is fixed by the [Constitution](/.specify/memory/constitution.md) and [PRD](/PRD.md), so research here resolves *how* to wire the mandated tools together rather than *whether* to use them. No `NEEDS CLARIFICATION` markers remain.

## Decision 1 — Monorepo tooling

- **Decision**: Nx workspace with `apps/` (frontend, backend, infra), `apps/frontend-e2e` (Playwright), and `libs/shared`. Every build/lint/test/serve is an Nx target; a single root `package.json` provides one install command (`npm install`).
- **Rationale**: Constitution Principle V mandates Nx as the single source of truth and forbids ad-hoc scripts bypassing the graph. Nx's inferred/target defaults make workspace-wide `nx run-many`/`nx affected` cover new packages automatically (FR-001, FR-004, SC-002).
- **Alternatives considered**: Turborepo/pnpm workspaces (rejected — constitution fixes Nx); Lerna (rejected — legacy, no task graph parity).

## Decision 2 — Shared frontend across PWA + desktop

- **Decision**: One React 18 + TypeScript app built with Vite. PWA installability via `vite-plugin-pwa` (manifest + service worker). Desktop via Tauri 2 wrapping the same Vite build output, with platform-specific access isolated behind a `src/platform/` adapter interface.
- **Rationale**: Principle II requires genuinely one codebase with platform code behind named adapters, not forks. Vite is the standard React bundler and is what both `vite-plugin-pwa` and Tauri consume, so both targets render the identical shell (FR-004, FR-005, SC-003).
- **Alternatives considered**: Separate Electron app (rejected — heavier, constitution names Tauri); Next.js (rejected — SSR unneeded for an installable SPA/desktop shell and complicates Tauri packaging).

## Decision 3 — Backend layering + serverless entry

- **Decision**: A single Express 4 app assembled by an `app.ts` factory, exposed through two thin entry points: `main.ts` (local `listen`) and `lambda.ts` (API Gateway handler via `@codegenie/serverless-express`). Strict layer directories plus empty `modules/{auth,tasks,projects,notes,overview}`.
- **Rationale**: Principle I mandates the layers and self-contained feature modules with no logic in routes/controllers, and FR-008 requires one app deployable to a single Lambda behind API Gateway. Sharing one `app.ts` between both entries guarantees local and Lambda behavior stay identical (FR-006, FR-007, FR-008).
- **Alternatives considered**: AWS Lambda Powertools/native handler per route (rejected — fragments the single-Lambda model in Principle I); NestJS (rejected — constitution/PRD specify Express).

## Decision 4 — Persistence & repository abstraction

- **Decision**: DynamoDB single-table design accessed only through the Repository layer using `@aws-sdk/lib-dynamodb` (Document client). Local dev runs DynamoDB Local (Docker); the health endpoint issues a lightweight table describe/read to report persistence connectivity.
- **Rationale**: Principle IV requires ownership enforcement at the lowest (repository) layer, and FR-011 requires a defined data-access abstraction rather than scattered calls. A single table matches DynamoDB key-design constraints called out in the constitution. The health check's persistence probe satisfies FR-007/SC-004 (unhealthy when the store is unreachable).
- **Alternatives considered**: Multi-table relational-style modeling (rejected — constitution warns against assuming relational semantics); direct SDK calls in services (rejected — violates the repository abstraction requirement).

## Decision 5 — Infrastructure as code

- **Decision**: One AWS CDK v2 (TypeScript) app defining S3 + CloudFront (static PWA hosting/CDN), API Gateway + a single Lambda (the Express app), a DynamoDB table, and a Cognito user pool. Deploy via `cdk deploy`; deployments are idempotent/convergent on re-run.
- **Rationale**: Principle V and FR-009/FR-010 require every resource as versioned IaC with no console-created resources, and the edge case requires re-running deploy to converge without manual cleanup — native CloudFormation behavior under CDK.
- **Alternatives considered**: Terraform/SAM/Serverless Framework (rejected — constitution fixes AWS CDK as the only supported IaC tool).

## Decision 6 — Test harness & CI gates

- **Decision**: Vitest for unit/integration in every package (with at least one passing sample each) and Playwright for e2e in `apps/frontend-e2e` (sample: shell renders the four nav areas). GitHub Actions workflow runs lint + Vitest + Playwright on every PR; `main` is a protected branch requiring the workflow to pass and disallowing direct pushes.
- **Rationale**: Principle III (non-negotiable test-first) plus FR-012/FR-013/FR-014 and SC-006/SC-007 require automated gates that block merges and demonstrable samples proving both layers are wired.
- **Alternatives considered**: Jest (rejected — constitution specifies Vitest, and Vite/Vitest share config); Cypress (rejected — constitution specifies Playwright).

## Decision 7 — Config, secrets & standards

- **Decision**: Runtime config (table names, Cognito IDs, API base URL) supplied via environment variables / CDK outputs and (in CI) GitHub Actions secrets; nothing sensitive committed or inlined into the frontend bundle. Conventional Commits + SemVer at release level + feature-branch/PR workflow with `main` as production.
- **Rationale**: Principle IV and FR-017 forbid committed/bundled secrets; FR-016 mandates the commit/versioning/branching standards.
- **Alternatives considered**: Committing a `.env` with defaults (rejected — risks secret leakage, violates FR-017).
