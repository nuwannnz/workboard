# Implementation Plan: Stage 3 — Week Board

**Branch**: `003-week-board` | **Date**: 2026-07-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-week-board/spec.md`

## Summary

Stage 3 delivers WorkBoard's first productivity surface — the **Week** board — and
introduces the product's core **Task** entity and its persistence on top of the Stage 2
authenticated, per-user isolation boundary. An authenticated user sees the current week as
seven Monday→Sunday day-columns (today distinguished), captures tasks inline at the bottom
of any day, drags a card to another day (which reschedules its due date), reorders cards
within a day (a manual order that persists), opens a task to edit title/description/due
date/priority/labels, completes and reopens tasks (which stay visible in a distinct state),
deletes tasks, and moves previous/next/back-to-today across weeks.

**Identity model (new this stage):** feature data is owned by an **application-level User
identity** — a stable **app-generated UUID (`userId`)** — not by the Cognito `sub`. The
Cognito `sub` becomes an **authentication-only** attribute on the User record: it is the
verified claim we use to *find* the user, and nothing else keys off it. On the first
authenticated request the backend **bootstraps** a User (generates a `userId`, records
`cognitoSub`/`email`) and thereafter **resolves `sub → userId`** at the request boundary
(cached in-Lambda). All feature data — Tasks now, Projects (Stage 4) and Notes (Stage 5)
later — links to `userId`, giving one durable owner key that is independent of the identity
provider (so a future provider swap or a re-issued `sub` never orphans data).

Technically: a new self-contained **`modules/tasks/`** backend module (routes → controller →
service → repository) exposes a small REST surface (`GET /tasks?from&to`, `POST /tasks`,
`PATCH /tasks/:id`, `DELETE /tasks/:id`) already protected by the existing API Gateway
Cognito authorizer (Stage 2's greedy `ANY /{proxy+}` sits behind it, so **no new infra**).
A new **`resolve-identity` middleware** runs after `authenticate`, turning the
gateway-verified `sub` into the app `userId` and attaching it to the request; the tasks
controller reads only `req.auth.userId`. The tasks repository scopes every read/write to
`PK = USER#<userId>`, `SK = TASK#<taskId>`, deriving the partition solely from that resolved
`userId` — cross-user access resolves as not-found. Day placement uses a **date-only
`YYYY-MM-DD` due date** (no time-of-day) so a task never shifts columns with the viewer's
timezone; weeks are computed Monday-start. Manual ordering uses a **fractional-index `order`
string** so a move/reorder rewrites only the one moved card. The shared `libs/shared` Task
schema is extended (add `order`, timestamps) and a User schema is added/extended so both
sides validate identically. The frontend adds a `week/` feature area rendered at the
protected `/` (and `/week`) route inside the existing `AppShell`, built from shadcn/ui with a
keyboard-accessible drag-and-drop library, calling the backend through the existing
`api-client`. Vitest covers identity resolution, week math, ordering, repository ownership,
and validation; Playwright covers the core flow plus unauthenticated and cross-user denial.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 LTS; Rust stable (Tauri toolchain, desktop build only) — unchanged from Stage 2

**Primary Dependencies**: (inherited) Nx, React 18 + Vite + shadcn/ui + Tailwind, Tauri 2, `react-router-dom` v6, Express 4 + `@codegenie/serverless-express`, `@aws-sdk/lib-dynamodb`, Zod, AWS CDK v2, Vitest, Playwright, `amazon-cognito-identity-js`. **New for Stage 3**: `@dnd-kit/core` + `@dnd-kit/sortable` (keyboard- and pointer-accessible drag-and-drop; research §3); `ulid` (backend, sortable time-ordered task ids; research §2); `uuid` (backend, app-level `userId` generation at User bootstrap; research §11). No new AWS SDK client is required (DynamoDB doc client already in use; bootstrap uses a `TransactWrite` from `@aws-sdk/lib-dynamodb`).

**Storage**: DynamoDB single-table `WorkBoard` (`PK`/`SK`), accessed only through the Repository layer. **Identity items** (research §11): a **User profile** `PK = USER#<userId>`, `SK = PROFILE` holding `{ id: userId, cognitoSub, email, createdAt }`, and an **auth pointer** `PK = AUTH#<sub>`, `SK = AUTH#<sub>` holding `{ userId }` so `sub → userId` resolves in one `GetItem`. **Task items**: `PK = USER#<userId>`, `SK = TASK#<taskId>` (taskId = ULID), attributes `title`, `description?`, `dueDate` (`YYYY-MM-DD`), `status`, `priority`, `labels`, `order` (fractional index), `projectId` (null this stage), `linkedNoteIds` ([] this stage), `createdAt`, `updatedAt`. The week window is read with a single `Query` on the user partition (`begins_with(SK, 'TASK#')`), filtered to `from..to` and grouped by `dueDate` in the service (research §1).

**Testing**: Vitest unit/integration (identity resolution + bootstrap, week/date math, fractional ordering, repository ownership + not-found, task validation, service create/move/reorder/complete/delete); Playwright e2e for the core Week flow and rejection cases against the running frontend

**Target Platform**: Browser/installable PWA and native desktop (Tauri) frontend; AWS Lambda behind API Gateway backend; Cognito user pool as identity provider — unchanged

**Project Type**: Nx monorepo — web frontend + serverless backend + IaC + shared library (multi-package), unchanged

**Performance Goals**: No new runtime performance targets. UX targets from spec: open Week + add a task under a specific day in under 15 seconds (SC-001); a create/move/reorder reflects immediately (optimistic UI) and persists durably (SC-002). Identity resolution adds at most one `GetItem` per **cold** identity (cached in-Lambda thereafter — research §12); each task request costs one DynamoDB `Query`/`Put`/`Update`/`Delete`.

**Constraints**: Feature data is owned by the app `userId` (UUID); the Cognito `sub` is authentication-only and never a foreign key on Tasks/Projects/Notes (user requirement, FR-014); day placement uses a single consistent time reference — a date-only due date so tasks don't jump columns by local timezone (spec Edge Cases, FR-010); week starts **Monday** (FR-001); ownership enforced in the Repository layer with no bypass, cross-user denied without disclosure (FR-014, SC-006); every change persisted durably and restored on reload / desktop restart (FR-013, SC-002); failed persistence must surface a clear failure state and must not present the change as saved (FR-016); last-write-wins concurrency, no real-time sync (spec Assumptions); single shared frontend codebase across PWA + desktop, responsive, shared design system (FR-017); `projectId`/`linkedNoteIds` present in the model but **not** created/exercised (spec Assumptions, Principle VI).

**Scale/Scope**: Single-developer/personal MVP; one environment. Adds a `tasks` backend module (routes/controller/service/repository), a `resolve-identity` middleware + a User/identity repository (refactoring the Stage 2 sub-keyed profile bootstrap), a `week/` frontend feature area (board, day columns, inline add, DnD, task detail, week navigation, week/date utilities), a shared-schema extension (Task + User), and e2e coverage. No infra change (the Stage 2 protected proxy already covers `/tasks/*`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Stage 3 obligation | Compliance in this plan |
|-----------|--------------------|--------------------------|
| I. Layered, Feature-Modular Backend | Tasks as a self-contained module in the layered app; no logic in routes/controllers; no cross-module reach-in | New `modules/tasks/` holds `tasks.routes.ts` → `tasks.controller.ts` (thin: reads `req.auth.userId` + validated body) → `tasks.service.ts` (week grouping, ordering, CRUD orchestration) → `tasks.repository.ts` (ownership-enforced access). The tasks module never imports the auth module's repository/domain — it consumes only the request-attached `userId`. Identity resolution is **cross-cutting middleware** (`resolve-identity`), the sanctioned place for it under Principle I, backed by the auth module's User repository. |
| II. Shared Frontend, One Codebase | One React/shadcn Week UX across PWA + Tauri, responsive; platform code behind adapters | The Week board, day columns, inline add, DnD, task-detail dialog, and week nav are built once from shadcn/ui inside the existing shared `AppShell`; no platform fork. DnD via `@dnd-kit` supports pointer + keyboard on both targets. Board scrolls/reflows responsively (FR-017). The identity change is entirely server-side — the client is unaffected (it never sees `sub` or `userId`). |
| III. Test-First Discipline (NON-NEGOTIABLE) | Vitest + Playwright written before/with implementation; CI green; core flow is priority e2e | Tests-first per task ordering: identity resolution + idempotent bootstrap (Vitest), week/date math + fractional ordering (pure-fn Vitest), repository ownership + cross-user not-found + task validation (Vitest), service CRUD (Vitest), then the full view→create→move→reorder→complete/reopen→navigate Playwright e2e + unauthenticated + cross-user denial. CI blocks merge. |
| IV. Data Isolation & Auth Boundary | Access authenticated at the boundary before controllers; ownership at Repository; no secrets committed | `/tasks/*` sits behind the existing API Gateway Cognito authorizer (verified at the edge, Stage 2); `authenticate` exposes `sub`, then `resolve-identity` maps it to the app `userId`. The tasks repository builds `PK = USER#<userId>` solely from that resolved id — never from caller input — so a task read/write can only reach the owner's partition and a foreign `taskId` resolves as not-found (FR-014, SC-006). The `sub`→`userId` pointer is written only under the authenticated `sub`. No credentials/secrets in source, DB, or bundle. |
| V. Infrastructure as Code & Single Nx Graph | Any infra/config change via CDK; all tasks via Nx targets; shared types in one graph | No new AWS resources — the Stage 2 protected `ANY /{proxy+}` already routes `/tasks/*` through the authorizer to the one Lambda; the table already grants read/write and the identity items live in the same single table (no GSI — research §11). Shared Task + User shapes live in `libs/shared` and are imported by both sides. Every build/lint/test/e2e runs through existing Nx targets; new deps (`@dnd-kit/*`, `ulid`, `uuid`) registered in the workspace. |
| VI. Simplicity & Scope Discipline (YAGNI) | Only the Week board's tasks + the minimum identity indirection; nothing speculative | The `userId` indirection is justified by a concrete current requirement (a provider-independent owner key linking Tasks/Projects/Notes) — it is resolved via a single-table pointer item (no GSI) and an in-Lambda cache (no external cache). `projectId`/`linkedNoteIds` remain in the model but are never populated or surfaced; no Projects/Notes/Overview work, no recurring tasks, no reminders, no real-time sync. A single `PATCH` endpoint covers edit + move + reorder + complete/reopen; fractional-index ordering avoids renumber cascades. |

**Result**: PASS — no violations. The `userId` indirection is a required (not speculative) capability and is implemented with the simplest mechanism that satisfies it. Complexity Tracking is intentionally empty.

## Project Structure

### Documentation (this feature)

```text
specs/003-week-board/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── tasks-api.md     # Backend REST surface for tasks (list/create/update/delete)
│   └── tasks-client-contract.md  # Frontend week data + drag-and-drop + optimistic-save contract
├── checklists/          # (existing) requirements checklist
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
apps/
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── router.tsx                # EXTEND: mount the Week feature at protected "/" and "/week"
│       │   ├── app-shell.tsx             # EXTEND: render nested feature route; wire sidebar nav to /week
│       │   └── nav-items.ts              # (unchanged) Week nav item already present
│       └── week/                         # NEW: Week feature area (shared UI)
│           ├── week-page.tsx             # board container: current reference week + week state
│           ├── week-board.tsx            # seven day-columns + DnD context (@dnd-kit)
│           ├── day-column.tsx            # one day: header (weekday/date, today marker), task list, inline add
│           ├── task-card.tsx             # sortable card: title, completed/priority state, open-to-edit
│           ├── add-task-inline.tsx       # bottom-of-day title input (required-title validation)
│           ├── task-detail-dialog.tsx    # view/edit title/description/dueDate/priority/labels; complete/reopen/delete
│           ├── week-nav.tsx              # previous / next / current-week controls
│           ├── use-week-tasks.ts         # data hook: load week, optimistic create/move/reorder/edit/complete/delete
│           ├── tasks-client.ts           # typed wrapper over the shared api-client for /tasks endpoints
│           ├── week.ts                   # pure week/date math: Monday-start week, day list, today, range
│           └── ordering.ts               # fractional-index helpers (between/append) for manual order
└── backend/
    └── src/
        ├── app.ts                        # EXTEND: mount tasks router behind authenticate + resolve-identity
        ├── middleware/
        │   └── resolve-identity.ts       # NEW: sub → app userId (cached); attaches req.auth.userId
        └── modules/
            ├── auth/                      # EXTEND: own the app User identity (refactor from sub-keyed profile)
            │   ├── user.repository.ts     #   refactor of profile.repository.ts: User profile (USER#<userId>)
            │   │                          #   + auth pointer (AUTH#<sub> → userId); getOrCreateUser / resolveUserIdBySub
            │   ├── identity.service.ts     #   NEW: resolveUserId(sub,email) with in-Lambda cache (research §12)
            │   ├── auth.service.ts         #   EXTEND: /me returns the app User { id, email }
            │   └── auth.controller.ts      #   (unchanged wiring) reads req.auth
            └── tasks/                     # NEW: self-contained tasks module
                ├── tasks.routes.ts        #   GET /tasks, POST /tasks, PATCH /tasks/:id, DELETE /tasks/:id (protected)
                ├── tasks.controller.ts    #   thin: validate (Zod) + read req.auth.userId, delegate to service
                ├── tasks.service.ts       #   create/list-week/move/reorder/edit/complete/delete orchestration
                └── tasks.repository.ts    #   ownership-enforced access: PK=USER#<userId>, SK=TASK#<id>

libs/shared/
└── src/schemas/
    ├── task.ts                            # EXTEND: add `order`, `createdAt`, `updatedAt`; add create/update request schemas
    └── user.ts                            # EXTEND: app User { id (uuid), email, createdAt }; cognitoSub is server-only (auth)

apps/frontend-e2e/src/                      # NEW e2e: week core flow, unauthenticated denial, cross-user denial
```

**Structure Decision**: Reuse the Stage 2 Nx layout unchanged. The backend gains one
self-contained `modules/tasks/` (Principle I) mounted behind the existing `authenticate`
middleware plus a new cross-cutting `resolve-identity` middleware in `app.ts`. Because Stage 2
already routes the greedy protected proxy through the Cognito authorizer, **no `apps/infra`
change is needed** (Principle IV/V). The app-level User identity lives in the auth module
(which owns accounts): the Stage 2 `profile.repository.ts` (keyed on `sub`) is refactored into
`user.repository.ts` keyed on an app `userId` with a `sub → userId` pointer item, and an
`identity.service.ts` resolves + caches that mapping. The tasks module depends only on the
request-attached `userId`, never importing auth internals (Principle I). The frontend `week/`
feature area renders inside the existing shared `AppShell` so PWA and Tauri share one codebase
and design system (Principle II), and is unaffected by the identity change (the client never
sees `sub` or `userId`). Week/date and ordering logic are isolated as pure modules so they
unit-test independently of React and DynamoDB (Principle III). Task + User request/response
shapes live in `libs/shared` so frontend and backend validate identically (Principle V).

## Complexity Tracking

> No Constitution Check violations. The `userId` indirection is a current requirement, not
> speculative abstraction, and uses the simplest satisfying mechanism (single-table pointer +
> in-Lambda cache, no GSI, no external cache). This section is intentionally empty.
