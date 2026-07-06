# Implementation Plan: Stage 1 — Project Setup & Foundation

**Branch**: `001-project-setup` | **Date**: 2026-07-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-project-setup/spec.md`

## Summary

Stand up the WorkBoard foundation with no end-user features: an Nx monorepo containing a shared React + TypeScript frontend (running as both a PWA and a Tauri desktop app from one codebase), a layered Express backend with feature-module placeholders and a Lambda-compatible entry point, a DynamoDB-backed repository abstraction, an AWS CDK infrastructure package (CloudFront + S3, API Gateway, Lambda, DynamoDB, Cognito), and a Vitest + Playwright test harness gated by GitHub Actions CI. Success is a contributor cloning the repo, installing once, and building/linting/testing/running every package through Nx, then deploying a reachable skeleton to AWS entirely from code.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 LTS (matches local `v22.19.0`); Rust stable (Tauri toolchain, desktop build only)

**Primary Dependencies**: Nx (monorepo/task runner); React 18 + Vite + shadcn/ui + Tailwind + `vite-plugin-pwa` (frontend); Tauri 2 (desktop shell); Express 4 + `@codegenie/serverless-express` (backend Lambda adapter); `@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb` (persistence); Zod (shared validation); AWS CDK v2 (infra); Vitest (unit/integration); Playwright (e2e)

**Storage**: DynamoDB (single-table design), accessed only through the backend Repository layer; local development uses DynamoDB Local via Docker

**Testing**: Vitest for unit/integration across all packages; Playwright for end-to-end against the running frontend; at least one passing sample test per layer

**Target Platform**: Browser/installable PWA and native desktop (Tauri) for the frontend; AWS Lambda behind API Gateway for the backend; developer machines (macOS/Linux) + GitHub Actions Linux runners for build/CI

**Project Type**: Nx monorepo — web frontend + serverless backend + IaC + shared library (multi-package)

**Performance Goals**: Stage 1 has no runtime performance features; the developer-experience target is clean-clone → install → full build in under 15 minutes (SC-001)

**Constraints**: Single shared frontend codebase (no per-platform fork); backend strict layering (Routes → Controllers → Services → Repositories → Domain); no persistence/business logic in routes or controllers; no manually created cloud resources (all IaC); no secrets committed or embedded in frontend bundles; no end-user feature behavior in scope (FR-018)

**Scale/Scope**: Single-developer/personal-productivity MVP; one deployable environment for Stage 1; ~4 packages (frontend, backend, infra, shared) plus one e2e project

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Stage 1 obligation | Compliance in this plan |
|-----------|--------------------|--------------------------|
| I. Layered, Feature-Modular Backend | Establish the layers and empty feature modules; no logic in routes/controllers | Backend scaffold creates `routes/controllers/services/repositories/domain/middleware/validation/shared` plus empty `modules/{auth,tasks,projects,notes,overview}`; health flows route → controller → service → repository |
| II. Shared Frontend, One Codebase | One React/shadcn codebase across PWA + Tauri, responsive | Single `apps/frontend`; Tauri isolated in `src-tauri/` + a platform adapter; PWA via `vite-plugin-pwa`; responsive shell from shared design system |
| III. Test-First Discipline | Vitest + Playwright wired with passing samples; CI blocks merge | Sample unit/integration + e2e tests ship in Stage 1; GitHub Actions runs lint + Vitest + Playwright; `main` protected |
| IV. Data Isolation & Auth Boundary | Provision Cognito + repository abstraction; no secrets committed | Cognito defined in CDK; all DynamoDB access behind Repository layer (ownership enforcement point ready for later stages); config via env/secrets, none in bundles |
| V. Infrastructure as Code & Single Nx Graph | All AWS resources via CDK; all tasks via Nx | `infra` CDK package defines every resource; every build/lint/test/run is an Nx target — no bypass scripts |
| VI. Simplicity & Scope Discipline (YAGNI) | Scaffolding + placeholders only; no speculative features | FR-018 enforced: no CRUD, auth flows, drag-and-drop, auto-save, or aggregation; out-of-scope MVP items not scaffolded |

**Result**: PASS — no violations. Complexity Tracking is intentionally empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-project-setup/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── health-api.md
│   └── nx-workspace-contract.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
workboard/                          # Nx workspace root
├── apps/
│   ├── frontend/                   # React + TS + Vite + shadcn/ui (PWA)
│   │   ├── public/                 # PWA manifest, icons
│   │   ├── src/
│   │   │   ├── app/                # App shell (sidebar: Week/Projects/Notes/Overview placeholders)
│   │   │   ├── components/ui/      # shared design system (shadcn/ui)
│   │   │   ├── platform/           # platform adapter (web vs. tauri) behind one interface
│   │   │   └── main.tsx
│   │   ├── src-tauri/              # Tauri 2 desktop shell (isolated platform code)
│   │   ├── index.html
│   │   ├── vite.config.ts          # includes vite-plugin-pwa
│   │   └── project.json            # Nx targets: build/serve/lint/test
│   ├── frontend-e2e/               # Playwright end-to-end project
│   │   └── src/                    # sample e2e: shell renders four nav areas
│   ├── backend/                    # Express layered app
│   │   ├── src/
│   │   │   ├── app.ts              # express app factory (shared by both entries)
│   │   │   ├── main.ts             # local server entry
│   │   │   ├── lambda.ts           # serverless handler entry (API Gateway)
│   │   │   ├── routes/
│   │   │   ├── controllers/
│   │   │   ├── services/
│   │   │   ├── repositories/       # DynamoDB data-access abstraction
│   │   │   ├── domain/
│   │   │   ├── middleware/
│   │   │   ├── validation/
│   │   │   ├── shared/
│   │   │   └── modules/            # empty feature-module placeholders
│   │   │       ├── auth/
│   │   │       ├── tasks/
│   │   │       ├── projects/
│   │   │       ├── notes/
│   │   │       └── overview/
│   │   └── project.json
│   └── infra/                      # AWS CDK v2 app
│       ├── bin/                    # CDK entry
│       ├── lib/                    # stack(s): S3+CloudFront, API GW, Lambda, DynamoDB, Cognito
│       └── project.json
├── libs/
│   └── shared/                     # cross-cutting types + Zod validation (Task/Project/Note/User)
│       └── src/
├── .github/workflows/ci.yml        # lint + Vitest + Playwright on every PR
├── nx.json                         # Nx task graph + target defaults
├── tsconfig.base.json              # shared TS config + path aliases
├── package.json                    # single install root; workspace deps
└── README.md                       # toolchain, install, build/run/test/deploy docs
```

**Structure Decision**: Nx monorepo with `apps/` for deployables (frontend, backend, infra), a co-located `frontend-e2e` Playwright project, and `libs/shared` for the cross-package type/validation library. This directly satisfies FR-001/FR-002 (single task runner, distinct packages incl. a shared lib), Principle V (single Nx graph), and keeps the backend's mandated layering (Principle I) as first-class directories. Tauri desktop code lives under `apps/frontend/src-tauri/` with a `platform/` adapter so the shared codebase (Principle II) is not forked per target.

## Complexity Tracking

> No Constitution Check violations. This section is intentionally empty.
