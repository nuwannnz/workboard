<!--
Sync Impact Report
- Version change: [TEMPLATE] → 1.0.0 (initial ratification)
- Modified principles: N/A (first concrete version, all placeholders filled)
- Added sections: Core Principles (I–VI), Technology & Architecture Constraints,
  Development Workflow & Quality Gates, Governance
- Removed sections: none
- Templates requiring updates:
  ✅ .specify/templates/plan-template.md (Constitution Check gate references generic
     principle compliance; no hardcoded principle names found, no changes required)
  ✅ .specify/templates/spec-template.md (no constitution-specific references found)
  ✅ .specify/templates/tasks-template.md (no constitution-specific references found)
  ⚠ .specify/templates/checklist-template.md (no constitution-specific references found;
     recommend reviewing generated checklists against new principles going forward)
- Follow-up TODOs: none — RATIFICATION_DATE set to adoption date of this version
-->

# WorkBoard Constitution

## Core Principles

### I. Layered, Feature-Modular Backend
The backend MUST be organized as a single Express.js application deployed to one AWS
Lambda behind API Gateway, structured in strict layers — Routes → Controllers →
Services → Repositories → Domain models — with cross-cutting Middleware, Validation,
and Shared utilities kept separate from business logic. Features (Auth, Tasks,
Projects, Notes, Overview) MUST be organized as self-contained modules within this
layered structure; a module MUST NOT reach into another module's repository or
domain internals directly. Routes and Controllers MUST NOT contain persistence or
business logic — that logic belongs in Services/Repositories.
Rationale: a single Lambda serving a layered, modular Express app keeps cold starts
and infra surface minimal while preventing the "big ball of mud" failure mode common
in monolithic handlers as the feature set (Tasks, Projects, Notes, Overview) grows.

### II. Shared Frontend, One Codebase
The React + TypeScript frontend MUST share a single codebase and component layer
(shadcn/ui) across both the PWA and the Tauri desktop app; platform-specific code
MUST be isolated behind clearly named adapters/entry points rather than duplicated
or forked per platform. UI MUST remain responsive across desktop and smaller
viewports. New UI MUST be built from the shared design system rather than one-off
styling.
Rationale: the PRD requires PWA and desktop to be genuinely one product; divergent
codebases would double maintenance cost and create feature drift between platforms.

### III. Test-First Discipline (NON-NEGOTIABLE)
Vitest unit/integration tests and Playwright end-to-end tests MUST be written before
or alongside implementation for new features and bug fixes, and MUST fail before the
corresponding implementation is written where practical (red-green-refactor). No pull
request MAY merge to `main` with failing tests, and CI (GitHub Actions) MUST pass
before merge. Playwright coverage of core user flows (Week board drag-and-drop,
Project creation, Note auto-save, Overview aggregation) is treated as priority
coverage, not optional polish.
Rationale: the product is a scheduling/task tool where silent regressions (a task
losing its due date, drag-and-drop reordering breaking) directly corrupt user data
trust; automated tests are the primary defense given the app has no undo history.

### IV. Data Isolation & Auth Boundary
Every data-access path (Repository layer, API routes) MUST enforce that a user can
only read or write their own data; there is no cross-user or admin bypass in
application code. Authentication (Cognito-backed email/password registration, login,
logout) MUST be validated at the API Gateway/middleware boundary before any
Controller logic runs. Secrets and credentials MUST NOT be committed to the
repository or embedded in frontend bundles.
Rationale: this is a personal productivity app holding private tasks/notes; a single
missed ownership check in the Repository layer is a full data-leak vulnerability
class, so isolation is enforced at the lowest layer rather than trusted to the UI.

### V. Infrastructure as Code & Single Source of Deployment
All AWS infrastructure (Lambda, API Gateway, DynamoDB, S3, CloudFront, Cognito) MUST
be defined via AWS CDK; no manual/console-created resources are permitted for
anything that ships to users. The Nx monorepo MUST remain the single source of truth
for how frontend, backend, and infra packages build, test, and depend on one
another — build/test commands MUST be run through Nx targets, not ad-hoc scripts
that bypass the monorepo graph.
Rationale: reproducible, versioned infra prevents drift between environments, and a
single Nx graph keeps shared code (types, validation schemas) consistent between the
Express backend and the React frontend.

### VI. Simplicity & Scope Discipline (YAGNI)
Implementation MUST stay within the current PRD scope; explicitly out-of-scope
capabilities for the MVP (AI features, real-time collaboration, calendar view,
recurring tasks, notifications/reminders, file attachments) MUST NOT be built
speculatively or scaffolded "for later." When a design choice could add
configurability, abstraction layers, or new dependencies beyond what the current
feature requires, the simpler option MUST be chosen unless a concrete, current
requirement justifies the complexity.
Rationale: this is a personal MVP with a fixed, deliberately small feature set;
premature abstraction or speculative features slow delivery of the core Week/
Projects/Notes/Overview experience without a validated need.

## Technology & Architecture Constraints

- Frontend: React + TypeScript, shadcn/ui component library, responsive layout,
  shared across PWA and Tauri desktop builds.
- Backend: Express.js on a single AWS Lambda, fronted by AWS API Gateway.
- Database: DynamoDB is the only persistence store; schema/access-pattern changes
  MUST account for DynamoDB's single-table/key-design constraints rather than
  assuming relational semantics.
- Infrastructure: AWS CDK is the only supported IaC tool; CloudFront + S3 serve the
  PWA/static assets, Cognito is the only supported identity provider.
- Monorepo: Nx manages all packages (frontend, backend, infra); new packages MUST be
  registered in the Nx workspace graph.
- Testing: Vitest for unit/integration tests, Playwright for end-to-end tests,
  GitHub Actions for CI. New feature modules MUST ship with both levels of coverage
  appropriate to their risk (see Principle III).

## Development Workflow & Quality Gates

- Commits MUST follow semantic commit conventions (e.g., `feat:`, `fix:`, `chore:`,
  `docs:`) so history and changelogs remain machine-readable.
- Versioning MUST follow semantic versioning (MAJOR.MINOR.PATCH) at the release
  level.
- `main` is always production-deployable; all work happens on feature branches and
  merges to `main` only via Pull Request.
- Every PR MUST pass CI (lint, Vitest, Playwright where applicable) before merge.
  Direct pushes to `main` that bypass PR review are not permitted.
- Constitution compliance is part of PR review: reviewers MUST check new/changed
  code against the Core Principles above, not just functional correctness.

## Governance

This constitution supersedes ad-hoc conventions and prior undocumented practice for
this repository. Where a PR or design conflicts with a principle here, the principle
wins unless the constitution itself is amended first.

**Amendment procedure**: Amendments are proposed via PR modifying this file. The PR
description MUST state the semantic version bump (MAJOR/MINOR/PATCH) and rationale
per the versioning policy below, and MUST identify any dependent artifacts
(`.specify/templates/*.md`, agent guidance files) that need corresponding updates.
Amendments are adopted on merge to `main`.

**Versioning policy**:
- MAJOR: Backward-incompatible governance changes, or removal/redefinition of an
  existing Core Principle.
- MINOR: A new Core Principle or materially expanded section is added.
- PATCH: Wording clarifications, typo fixes, or non-semantic refinements.

**Compliance review**: All PRs/reviews MUST verify compliance with the Core
Principles above; any deviation MUST be explicitly justified in the PR description
(what principle, why the exception, and the plan to reconcile it, if any).
Unjustified complexity or scope creep relative to Principle VI is grounds for
requesting changes. Runtime development guidance for coding agents lives in
`CLAUDE.md` and any `.specify` planning artifacts; those MUST stay consistent with
this constitution.

**Version**: 1.0.0 | **Ratified**: 2026-07-06 | **Last Amended**: 2026-07-06
