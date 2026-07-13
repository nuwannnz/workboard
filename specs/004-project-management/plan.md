# Implementation Plan: Stage 4 — Projects

**Branch**: `004-project-management` | **Date**: 2026-07-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-project-management/spec.md`

## Summary

Stage 4 delivers WorkBoard's second primary surface — **Projects** — and activates the
product's first entity relationship: the optional **project reference** that Stage 3 baked
into the Task model but never populated. An authenticated user creates color-coded projects
(name, description, palette color), sees them as cards, opens a project to a detail view with a
completion **progress bar** and a **task backlog**, and adds/edits/completes/reorders/deletes
tasks inside that backlog. Project tasks are the **same Task entity** as the Week board — the
only difference is that a project task's **due date is optional**: a backlog task with no due
date lives only in the project; a backlog task with a due date **also** appears on the Week
board under its day, carrying its project's name and color.

Technically this stage adds a self-contained **`modules/projects/`** backend module
(routes → controller → service → repository) exposing `GET/POST/PATCH/DELETE /projects`, all
behind the existing `authenticate` + `resolve-identity` middleware (Stage 2's greedy protected
`ANY /{proxy+}` already routes `/projects/*` — **no new infra**). Projects persist as
`PK = USER#<userId>`, `SK = PROJECT#<projectId>` items in the same single table, keyed **only**
off the resolved app `userId` so ownership is enforced at the repository with no bypass and a
foreign id resolves as not-found (Principle IV, FR-016). The **tasks module is extended** rather
than duplicated: `dueDate` becomes optional and `projectId` settable on create/update, and the
tasks repository/service gain a **project-scoped read** (`GET /tasks?projectId=…`, a single
partition `Query` filtered on `projectId` — **no GSI**, Principle VI) plus a **cascade delete by
project**. Deleting a project cascades to its tasks via a **service-to-service** call
(`ProjectsService` → `TasksService`'s public API — the sanctioned module seam; it never touches
the tasks repository/domain directly, Principle I). **Progress** is a derived, non-persisted
ratio (completed ÷ total) computed on the client from the backlog it already loads, so the
backend modules stay cleanly separated. A single `order` field continues to serve manual
ordering in both the day and the backlog groupings.

The frontend adds a `projects/` feature area rendered at protected `/projects` and
`/projects/:id` inside the existing `AppShell`, built from shadcn/ui and reusing the Stage 3
`task-card`, `task-detail-dialog`, `ordering`, and `api-client`. The Week board is extended to
resolve a scheduled task's `projectId` to its project's name/color for display. Vitest covers
project validation, repository ownership, project CRUD + cascade, extended task
create/list-by-project/optional-due-date ordering, and the pure progress function; Playwright
covers the core project flow plus unauthenticated and cross-user denial.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 LTS; Rust stable (Tauri toolchain, desktop build only) — unchanged from Stage 3

**Primary Dependencies**: (inherited) Nx, React 18 + Vite + shadcn/ui + Tailwind, Tauri 2, `react-router-dom` v6, Express 4 + `@codegenie/serverless-express`, `@aws-sdk/lib-dynamodb`, Zod, AWS CDK v2, Vitest, Playwright, `amazon-cognito-identity-js`, `@dnd-kit/core` + `@dnd-kit/sortable` (backlog drag-reorder), `ulid` (backend id generation — reused for `projectId`), `uuid` (User bootstrap, unchanged). **No new dependency is required for Stage 4** (Principle VI): projects reuse the existing DynamoDB doc client, `@dnd-kit`, and `ulid`.

**Storage**: DynamoDB single-table `WorkBoard` (`PK`/`SK`), accessed only through the Repository layer. **New Project item**: `PK = USER#<userId>`, `SK = PROJECT#<projectId>` (projectId = ULID), attributes `name`, `description?`, `color` (palette token), `order` (fractional index for card arrangement), `createdAt`, `updatedAt`. **Task item unchanged in shape** (Stage 3 already reserved `projectId`/`linkedNoteIds`); this stage populates `projectId` and permits `dueDate = null`. Project backlog is read with a single `Query` on the user partition (`begins_with(SK, 'TASK#')`) filtered to `projectId = :projectId` (research §2) — no GSI. The user's projects list is a single `Query` (`begins_with(SK, 'PROJECT#')`).

**Testing**: Vitest unit/integration (project schema validation; projects repository ownership + not-found; projects service create/edit/delete **with task cascade**; extended tasks service create with optional `dueDate` + `projectId` + backlog ordering; tasks repository `queryByProject`; pure `progress()` and backlog ordering; projects + backlog hooks); Playwright e2e for the core Projects flow and rejection cases against the running frontend

**Target Platform**: Browser/installable PWA and native desktop (Tauri) frontend; AWS Lambda behind API Gateway backend; Cognito user pool as identity provider — unchanged

**Project Type**: Nx monorepo — web frontend + serverless backend + IaC + shared library (multi-package), unchanged

**Performance Goals**: No new runtime performance targets. UX targets from spec: create a project and see its card in under 15 seconds (SC-001); create/complete/schedule reflect immediately (optimistic UI) and persist durably (SC-002). Each project request costs one DynamoDB `Query`/`Put`/`Update`/`Delete`; a project delete costs one `Query` (its tasks) + batched deletes; a backlog read costs one `Query`. Progress is computed in-memory on the client (no extra request).

**Constraints**: Feature data owned by the app `userId` (UUID) resolved from the gateway-verified `sub`; the tasks/projects repositories build `PK` solely from that resolved id, never caller input (Principle IV, FR-016). A project task's `dueDate` is **optional** — backlog-only when null, additionally on the Week board when set (FR-011); a task belongs to at most one project. Project `color` comes from a **defined palette**, never a free-form value; every project has a valid color with a default (spec Assumptions). **Deleting a project cascades** to delete all its tasks after an explicit warning (FR-015, SC-007). Progress = completed ÷ total over the project's tasks, zero-safe (FR-010). Cross-module cascade goes through the tasks module's **public service API**, never its repository/domain (Principle I). Last-write-wins concurrency, no real-time sync. Single shared frontend across PWA + desktop, responsive, shared design system (FR-019). `linkedNoteIds` present but never populated/surfaced (Stage 5, Principle VI).

**Scale/Scope**: Single-developer/personal MVP; one environment. Adds a `projects` backend module (routes/controller/service/repository), extends the tasks module (optional due date, `projectId`, project-scoped list + cascade delete), extends the shared Task + Project schemas, adds a `projects/` frontend feature area (cards page, create/edit/delete dialogs, detail page with progress + backlog, backlog DnD), extends the Week board to show project name/color, and adds e2e coverage. No infra change (the Stage 2 protected proxy already covers `/projects/*`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Stage 4 obligation | Compliance in this plan |
|-----------|--------------------|--------------------------|
| I. Layered, Feature-Modular Backend | Projects as a self-contained layered module; no logic in routes/controllers; no cross-module reach-in | New `modules/projects/` holds `projects.routes.ts` → `projects.controller.ts` (thin: reads `req.auth.userId` + validated body) → `projects.service.ts` (CRUD orchestration + delete-cascade) → `projects.repository.ts` (ownership-enforced access). The **cascade delete** consumes the **tasks module's public service API** (`TasksService.listByProject` / `deleteByProject`) — a sanctioned service-to-service seam; the projects module never imports the tasks **repository or domain internals**. The tasks module is extended in place (optional `dueDate`, `projectId`, project-scoped read) and still owns all Task persistence. |
| II. Shared Frontend, One Codebase | One React/shadcn Projects UX across PWA + Tauri, responsive; platform code behind adapters | The projects cards page, create/edit dialogs, detail page (progress + backlog), and backlog DnD are built once from shadcn/ui inside the existing shared `AppShell`; the Stage 3 `task-card`, `task-detail-dialog`, and `@dnd-kit` sortable are reused. No platform fork. Cards/backlog reflow responsively (FR-019). The identity/ownership change is entirely server-side — the client never sees `sub`/`userId`. |
| III. Test-First Discipline (NON-NEGOTIABLE) | Vitest + Playwright written before/with implementation; CI green; core flow is priority e2e | Tests-first per task ordering: project schema + palette validation (Vitest), projects repository ownership + not-found (Vitest), projects service CRUD + **cascade** (Vitest), extended tasks service optional-due-date + `projectId` + backlog ordering and repository `queryByProject` (Vitest), pure `progress()` (Vitest), then the full create-project → backlog → progress → schedule-onto-Week → edit/delete Playwright e2e + unauthenticated + cross-user denial. CI blocks merge. |
| IV. Data Isolation & Auth Boundary | Access authenticated at the boundary before controllers; ownership at Repository; no secrets committed | `/projects/*` sits behind the existing API Gateway Cognito authorizer (Stage 2), then `authenticate` + `resolve-identity`. The projects repository builds `PK = USER#<userId>` solely from the resolved app id — never caller input — so a project read/write can only reach the owner's partition and a foreign `projectId` resolves as not-found (FR-016, SC-006). The extended task project-scoped read/cascade are likewise owner-partition-scoped. No credentials/secrets in source, DB, or bundle. |
| V. Infrastructure as Code & Single Nx Graph | Any infra/config change via CDK; all tasks via Nx targets; shared types in one graph | **No new AWS resources** — Stage 2's protected `ANY /{proxy+}` already routes `/projects/*` through the authorizer to the one Lambda; Projects live in the same single table (no GSI — research §2). Shared Project + Task shapes and the color palette live in `libs/shared` and are imported by both sides. Every build/lint/test/e2e runs through existing Nx targets; no new workspace dependency is added. |
| VI. Simplicity & Scope Discipline (YAGNI) | Only projects + the project↔task relationship; nothing speculative | Project backlog is read by **filtering the user partition** (no GSI, no new access structure); **progress is computed on the client** from already-loaded tasks (no aggregate persistence, no cross-module backend coupling for a derived value); cascade delete reuses the tasks service. Color is a fixed palette, not an arbitrary picker. A single `order` field continues to serve both day and backlog groupings. `linkedNoteIds` stays present but unpopulated; no Notes/Overview work, no per-context ordering, no bulk task reassignment UI. |

**Result**: PASS — no violations. The one cross-module interaction (delete-cascade) is a deliberate, current requirement satisfied through the tasks module's public service API (the sanctioned seam), not by reaching into its internals. Complexity Tracking is intentionally empty.

## Project Structure

### Documentation (this feature)

```text
specs/004-project-management/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── projects-api.md              # Backend REST surface for projects + task API extensions
│   └── projects-client-contract.md  # Frontend projects data + backlog + progress + optimistic-save contract
├── checklists/          # (existing) requirements checklist
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
apps/
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── router.tsx                # EXTEND: mount Projects at protected "/projects" and "/projects/:id"
│       │   └── nav-items.ts              # EXTEND: give the "projects" nav item `to: '/projects'`
│       ├── week/
│       │   ├── task-card.tsx             # EXTEND: optionally show a project name/color badge on scheduled project tasks
│       │   ├── task-detail-dialog.tsx    # EXTEND: optional due date (clearable → backlog); reused by the backlog
│       │   ├── use-week-tasks.ts         # EXTEND: expose projects map so day cards can render project name/color
│       │   └── ordering.ts               # (reuse) fractional-index helpers for backlog reorder
│       └── projects/                     # NEW: Projects feature area (shared UI)
│           ├── projects-page.tsx         # cards grid + empty state + create control
│           ├── project-card.tsx          # one project: name, color, description, progress glance → opens detail
│           ├── create-project-dialog.tsx # name (required) + description + palette color; edit reuses it
│           ├── project-detail-page.tsx   # summary + progress bar + backlog; loads project + its tasks
│           ├── project-backlog.tsx       # backlog list: inline add, DnD reorder, open task, complete/reopen/delete
│           ├── progress-bar.tsx          # renders completed/total ratio (shared design tokens)
│           ├── use-projects.ts           # data hook: list/create/edit/delete projects, optimistic + rollback
│           ├── use-project-tasks.ts      # data hook: load a project's backlog, optimistic task CRUD (reuses tasks-client)
│           ├── projects-client.ts        # typed wrapper over the shared api-client for /projects endpoints
│           └── progress.ts               # pure completed÷total helper (zero-safe)
└── backend/
    └── src/
        ├── app.ts                        # EXTEND: mount projects router behind authenticate + resolve-identity
        └── modules/
            ├── tasks/                    # EXTEND: optional dueDate, settable projectId, project-scoped read + cascade
            │   ├── tasks.repository.ts    #   ADD queryByProject(userId, projectId); delete-by-project support
            │   ├── tasks.service.ts       #   optional-dueDate create + backlog ordering; listByProject; deleteByProject
            │   ├── tasks.controller.ts    #   accept ?projectId on GET; (create/update already pass through schema)
            │   └── tasks.routes.ts        #   (unchanged wiring)
            └── projects/                 # NEW: self-contained projects module
                ├── projects.routes.ts     #   GET /projects, POST /projects, PATCH /projects/:id, DELETE /projects/:id
                ├── projects.controller.ts #   thin: validate (Zod) + read req.auth.userId, delegate to service
                ├── projects.service.ts    #   create/list/edit/delete orchestration; delete cascades via TasksService
                └── projects.repository.ts #   ownership-enforced access: PK=USER#<userId>, SK=PROJECT#<id>

libs/shared/
└── src/schemas/
    ├── task.ts                            # EXTEND: dueDate optional on create + nullable on update; settable projectId
    └── project.ts                         # EXTEND: color palette token, order, timestamps; create/update request schemas + PROJECT_COLORS

apps/frontend-e2e/src/                      # NEW e2e: projects core flow, unauthenticated denial, cross-user denial
```

**Structure Decision**: Reuse the Stage 3 Nx layout unchanged. The backend gains one
self-contained `modules/projects/` (Principle I) mounted behind the existing `authenticate` +
`resolve-identity` middleware in `app.ts`, and extends the existing `modules/tasks/` in place
(optional due date, settable `projectId`, a project-scoped read, and a cascade-delete helper)
rather than duplicating the Task model. Because Stage 2 already routes the greedy protected
proxy through the Cognito authorizer, **no `apps/infra` change is needed** (Principle IV/V). The
projects module depends on the tasks module only through its **public service API** for the
delete-cascade (never its repository/domain — Principle I). The frontend `projects/` feature
area renders inside the existing shared `AppShell` so PWA and Tauri share one codebase and design
system (Principle II), reusing the Stage 3 `task-card`, `task-detail-dialog`, `ordering`, and
`api-client`. Progress and backlog ordering are isolated as pure modules so they unit-test
independently of React and DynamoDB (Principle III). Project + extended Task request/response
shapes and the color palette live in `libs/shared` so frontend and backend validate identically
(Principle V).

## Complexity Tracking

> No Constitution Check violations. The single cross-module interaction (project delete →
> task cascade) is a current, concrete requirement (FR-015) satisfied through the tasks
> module's public service API — the sanctioned collaboration seam — not by reaching into its
> repository or domain internals. Backlog reads filter the user partition (no GSI) and progress
> is a client-computed derived value (no aggregate persistence). This section is intentionally
> empty.
