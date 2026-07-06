# Feature Specification: Stage 1 — Project Setup & Foundation

**Feature Branch**: `001-project-setup`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "read the prd and speckout the stage 1: setup"

## Overview

Stage 1 establishes the foundational skeleton for WorkBoard: the Nx monorepo, the shared React frontend (targeting both PWA and Tauri desktop), the layered Express backend (deployable to a single AWS Lambda), the DynamoDB persistence layer, the AWS CDK infrastructure definitions, and the CI/testing harness. This stage delivers **no end-user product features** (Week, Projects, Notes, Overview, Auth flows are later stages). Its "users" are the developers building those later stages; success means a contributor can clone the repo, run every app locally, run the full test suite, and deploy a reachable skeleton to AWS entirely through the monorepo.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Monorepo builds and runs locally (Priority: P1)

A developer clones the repository, installs dependencies once, and can build, lint, test, and run each workspace package (frontend, backend, infrastructure, shared libraries) through the monorepo's task runner without ad-hoc scripts.

**Why this priority**: Nothing else in the project can proceed until the monorepo graph exists and the packages build and run. This is the irreducible foundation every later stage depends on.

**Independent Test**: Fully testable by cloning the repo on a clean machine, running the documented install command, then running the workspace build/lint/test targets and confirming they all succeed with zero packages skipped.

**Acceptance Scenarios**:

1. **Given** a clean checkout, **When** the developer runs the single documented install command, **Then** all workspace dependencies install successfully with no manual per-package steps.
2. **Given** installed dependencies, **When** the developer runs the workspace-wide build target, **Then** every registered package (frontend, backend, infra, shared) builds successfully.
3. **Given** installed dependencies, **When** the developer runs the workspace-wide lint and test targets, **Then** both complete successfully across all packages.
4. **Given** a new package is added, **When** it is registered in the workspace, **Then** it is automatically included in workspace-wide build/lint/test runs without extra configuration.

---

### User Story 2 - Shared frontend runs as PWA and desktop app (Priority: P1)

A developer starts the frontend from a single shared codebase and runs it both as a Progressive Web App in the browser and as a Tauri desktop application, seeing the same placeholder shell (navigation scaffold with the four primary view areas) in both.

**Why this priority**: The PRD requires PWA and desktop to be genuinely one product from one codebase. Proving the shared shell runs on both targets de-risks the platform strategy before any feature UI is built.

**Independent Test**: Testable by launching the frontend in browser mode and in desktop mode from the same source and confirming both render the shared application shell.

**Acceptance Scenarios**:

1. **Given** the frontend package, **When** the developer starts it in web/PWA mode, **Then** the app loads in a browser and is installable as a PWA.
2. **Given** the frontend package, **When** the developer starts it in desktop mode, **Then** a native desktop window opens rendering the same shared shell.
3. **Given** the running shell, **When** the developer views it, **Then** a left sidebar with the four primary navigation areas (Week, Projects, Notes, Overview) is visible as placeholders built from the shared design system.
4. **Given** either target, **When** the viewport is resized to a smaller width, **Then** the shell remains responsive without broken layout.

---

### User Story 3 - Backend skeleton responds through the layered structure (Priority: P1)

A developer runs the Express backend locally and calls a health/status endpoint that flows through the established layered structure (route → controller → service), confirming the backend architecture and Lambda-compatible entry point are wired correctly.

**Why this priority**: Every later feature module (Auth, Tasks, Projects, Notes, Overview) plugs into this layered skeleton. Establishing the layers and the Lambda-compatible entry point first prevents rework and enforces the architecture from day one.

**Independent Test**: Testable by starting the backend locally and calling the health endpoint, confirming a success response that demonstrably passed through the layered structure.

**Acceptance Scenarios**:

1. **Given** the backend package, **When** the developer starts it locally, **Then** the Express application starts and exposes a health/status endpoint.
2. **Given** the running backend, **When** the health endpoint is called, **Then** it returns a success response indicating the service and its persistence connectivity are healthy.
3. **Given** the codebase, **When** a developer inspects the backend, **Then** the layered directories (routes, controllers, services, repositories, domain, middleware, validation, shared) and empty feature-module folders (auth, tasks, projects, notes, overview) exist as the agreed skeleton.
4. **Given** the same backend code, **When** it is packaged for the serverless target, **Then** it exposes a handler entry point compatible with a single AWS Lambda behind API Gateway.

---

### User Story 4 - Infrastructure is defined as code and deployable (Priority: P2)

A developer synthesizes and deploys the cloud infrastructure — static hosting/CDN, API gateway, the single Lambda, the database, and the identity provider — entirely from versioned infrastructure-as-code definitions, with no manually created cloud resources.

**Why this priority**: A reproducible, deployable skeleton validates the end-to-end architecture and gives later stages a real environment to target, but local development (Stories 1–3) can begin before the cloud stack is complete.

**Independent Test**: Testable by synthesizing the infrastructure definitions and deploying to a cloud account, then confirming the static site loads and the API health endpoint is reachable through the provisioned gateway.

**Acceptance Scenarios**:

1. **Given** the infrastructure package, **When** the developer synthesizes it, **Then** it produces the full stack definition (CDN, static hosting, API gateway, Lambda, database, identity provider) without errors.
2. **Given** a target cloud account, **When** the developer deploys the stack, **Then** all resources are provisioned as code with no manual console steps required.
3. **Given** a successful deployment, **When** the developer opens the CDN URL, **Then** the frontend shell loads.
4. **Given** a successful deployment, **When** the API health endpoint is called through the provisioned gateway, **Then** it returns success.

---

### User Story 5 - CI and test harness enforce quality gates (Priority: P2)

A developer opens a pull request and an automated CI pipeline runs linting, unit/integration tests, and end-to-end tests; the pull request cannot merge to the production branch while any gate fails.

**Why this priority**: The test-first, no-broken-`main` discipline must exist before feature work begins so that quality gates apply to the very first feature PR, but it depends on the packages and test tooling from Stories 1–3 being in place.

**Independent Test**: Testable by opening a pull request with a deliberately failing test and confirming CI reports failure and blocks merge, then fixing it and confirming CI passes.

**Acceptance Scenarios**:

1. **Given** the repository, **When** a pull request is opened, **Then** CI automatically runs lint, unit/integration tests, and end-to-end tests.
2. **Given** a pull request with a failing test, **When** CI completes, **Then** the pipeline reports failure and merge to the production branch is blocked.
3. **Given** a pull request where all gates pass, **When** CI completes, **Then** the pull request is eligible to merge.
4. **Given** the test harness, **When** a developer runs it locally, **Then** at least one sample unit/integration test and one sample end-to-end test exist and pass, demonstrating both layers are wired.

---

### Edge Cases

- What happens when a developer runs install/build on a clean machine that has never built the project? The documented one-command install must succeed without hidden prerequisites beyond the stated toolchain versions.
- How does the system handle a package that is not registered in the monorepo graph? It must be excluded from workspace runs in a way that is detectable, so unregistered packages do not silently escape lint/test.
- What happens when the backend cannot reach the database on the health check? The health endpoint must report an unhealthy/degraded status rather than a generic success.
- How does CI behave when only one test layer fails (e.g., end-to-end passes but unit fails)? Any single failing gate must fail the overall pipeline and block merge.
- What happens if infrastructure deployment partially fails? Re-running the deploy must converge to the desired state without requiring manual cleanup of orphaned resources.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The project MUST be organized as a single monorepo whose task runner drives build, lint, and test for all packages, with no ad-hoc scripts that bypass the workspace graph.
- **FR-002**: The monorepo MUST contain distinct packages for the frontend application, the backend application, the infrastructure definitions, and at least one shared library for cross-cutting types/validation.
- **FR-003**: A single documented install command MUST install all workspace dependencies on a clean checkout with no manual per-package steps.
- **FR-004**: The frontend MUST be a single shared codebase that runs both as a browser-based, installable PWA and as a native desktop application.
- **FR-005**: The frontend MUST render a placeholder application shell containing a left sidebar with the four primary navigation areas (Week, Projects, Notes, Overview) built from the shared design system, and MUST remain responsive on smaller viewports.
- **FR-006**: The backend MUST be a single Express application structured in the required layers (routes, controllers, services, repositories, domain models, middleware, validation, shared utilities) with placeholder feature-module folders for Auth, Tasks, Projects, Notes, and Overview.
- **FR-007**: The backend MUST expose a health/status endpoint that flows through the layered structure and reports service and persistence connectivity.
- **FR-008**: The backend MUST provide a serverless-compatible entry point so the same application can be deployed to a single cloud function behind an API gateway.
- **FR-009**: All cloud infrastructure (static hosting/CDN, API gateway, the single function, the database, and the identity provider) MUST be defined as versioned infrastructure-as-code with no manually created resources.
- **FR-010**: The infrastructure definitions MUST synthesize and deploy successfully, resulting in a reachable static site and a reachable API health endpoint.
- **FR-011**: The persistence layer MUST be provisioned as the project's chosen non-relational store, and the repository layer MUST access it through a defined data-access abstraction rather than direct calls scattered across the codebase.
- **FR-012**: A CI pipeline MUST run automatically on every pull request, executing lint, unit/integration tests, and end-to-end tests.
- **FR-013**: The production branch MUST be protected so that a pull request cannot merge while any CI gate fails, and direct pushes that bypass pull-request review MUST be disallowed.
- **FR-014**: The test harness MUST include configured unit/integration and end-to-end tooling, each with at least one passing sample test that proves the layer is wired.
- **FR-015**: The repository MUST document the required toolchain, the install command, and the commands to build, run, test, and deploy each package.
- **FR-016**: The repository MUST enforce the agreed development standards: semantic commit conventions, semantic versioning at the release level, and a feature-branch-plus-pull-request workflow with `main` as the production branch.
- **FR-017**: No secrets or credentials may be committed to the repository or embedded in frontend bundles; configuration MUST be supplied through environment/secret mechanisms.
- **FR-018**: Stage 1 MUST NOT implement any end-user feature behavior (task/project/note CRUD, authentication flows, drag-and-drop, auto-save, overview aggregation); only scaffolding, placeholders, and health/status wiring are in scope.

### Key Entities

Stage 1 provisions the persistence store and shared type definitions but does **not** implement domain feature logic. The domain entities below are established later; here they exist only as placeholder shared types / table shape decisions:

- **Task**: The core work item (title, description, due date, status, priority, labels, optional project reference, linked notes). Defined as a shared type in Stage 1; behavior deferred to later stages.
- **Project**: A grouping of tasks (name, description, color). Defined as a shared type in Stage 1; behavior deferred.
- **Note**: A markdown document (title, markdown content, links to projects/tasks). Defined as a shared type in Stage 1; behavior deferred.
- **User/Account**: The authenticated owner of all data, backed by the identity provider. Provisioned as infrastructure in Stage 1; registration/login flows deferred.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can go from a clean clone to all workspace packages installed and successfully built in under 15 minutes using only the documented commands.
- **SC-002**: 100% of registered workspace packages are covered by the single workspace-wide build, lint, and test commands, with zero packages requiring bespoke scripts.
- **SC-003**: The shared frontend shell runs on both target platforms (browser/PWA and desktop) from one codebase, verified by launching both and seeing the identical navigation shell.
- **SC-004**: The backend health endpoint returns a success response through the layered structure in 100% of local runs, and reports an unhealthy status when persistence connectivity is unavailable.
- **SC-005**: The full infrastructure stack deploys from code to a cloud account with zero manually created resources, and both the static site and the API health endpoint are reachable after deployment.
- **SC-006**: Every pull request runs the full CI pipeline, and a pull request with any failing gate is blocked from merging 100% of the time.
- **SC-007**: At least one unit/integration sample test and one end-to-end sample test exist and pass in CI, demonstrating both test layers are operational.
- **SC-008**: A new contributor can identify how to build, run, test, and deploy every package solely from the repository documentation, without asking a maintainer.

## Assumptions

- The "users" of this stage are the developers/contributors building WorkBoard; there is no end-user-facing functionality delivered in Stage 1.
- The technology choices are fixed by the PRD and constitution (Nx monorepo; React + TypeScript + shadcn/ui frontend shared across PWA and Tauri; layered Express backend on a single AWS Lambda behind API Gateway; DynamoDB; AWS CDK; CloudFront + S3; Cognito; Vitest + Playwright; GitHub Actions) and are treated as constraints, not open decisions.
- A single deployable environment is sufficient for Stage 1; multi-environment (staging/production separation) promotion pipelines are out of scope unless required later.
- Developers have the necessary cloud account access and credentials configured locally/in CI via secure mechanisms; provisioning cloud accounts and IAM bootstrap are prerequisites, not deliverables of this spec.
- The placeholder navigation shell uses non-functional stubs for the four views; real view functionality is delivered in later stages.
- Out-of-scope MVP capabilities (AI features, collaboration, calendar view, recurring tasks, notifications/reminders, file attachments) are not scaffolded in Stage 1.
