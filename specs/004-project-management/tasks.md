---
description: "Task list for Stage 4 — Projects"
---

# Tasks: Stage 4 — Projects

**Input**: Design documents from `/specs/004-project-management/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/projects-api.md, contracts/projects-client-contract.md

**Branch**: `004-project-management`

**Tests**: Included — the spec (FR-020) and plan (Principle III, Test-First, NON-NEGOTIABLE) explicitly require Vitest unit/integration coverage and Playwright e2e for the core flow, unauthenticated access, and cross-user denial. Test tasks are written before their implementation within each story.

**Organization**: Tasks are grouped by user story so each story can be implemented, tested, and delivered independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Every task includes an exact file path

## Path Conventions

Nx monorepo (plan Structure Decision):
- Backend: `apps/backend/src/`
- Frontend (shared PWA + Tauri): `apps/frontend/src/`
- Shared schemas: `libs/shared/src/schemas/`
- E2E: `apps/frontend-e2e/src/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the working branch and scaffold the new module/feature directories. No new dependency is added this stage (plan Technical Context, Principle VI).

- [X] T001 Confirm the working branch is `004-project-management` (not `main`) and that `git status` shows the Stage 4 spec dir; run a baseline `npx nx run-many -t lint test -p shared backend frontend` and confirm it is green before starting.
- [X] T002 [P] Create the backend module directory `apps/backend/src/modules/projects/` (empty, to be populated in Phase 2) per plan Project Structure.
- [X] T003 [P] Create the frontend feature directory `apps/frontend/src/projects/` (empty, to be populated per story) per plan Project Structure.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared Project schema/palette and the projects backend module skeleton wired into the app. These block every user story (US1–US5 all depend on the Project shape and the mounted router).

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 [P] Extend the shared Project schema in `libs/shared/src/schemas/project.ts`: replace the Stage 1 stub with the full domain shape (`id`, `name` non-empty, `description?`, `color`, `order`, `createdAt`, `updatedAt`), add the `PROJECT_COLORS` closed palette (`['slate','red','amber','green','teal','blue','violet','pink']`) with `ProjectColor` type and `color` validated as `z.enum(PROJECT_COLORS)` defaulted to `'slate'`, and add `createProjectSchema` (`{ name, description?, color? }`) and `updateProjectSchema` (all optional, `name` non-empty if present) with exported `CreateProjectInput`/`UpdateProjectInput` types (data-model.md §Entity: Project). The existing `libs/shared/src/index.ts` wildcard already re-exports these.
- [X] T005 [P] Add unit tests for the Project schema in `libs/shared/src/schemas/project.spec.ts`: non-empty-name required on create and update-if-present (FR-002), `color` accepts only palette tokens and defaults when omitted, `updateProjectSchema` allows partial bodies (data-model.md Validation rules).
- [X] T006 Scaffold the projects module in `apps/backend/src/modules/projects/`: `projects.repository.ts`, `projects.service.ts`, `projects.controller.ts`, and `projects.routes.ts` (factory `projectsRoutes(authenticate, resolveIdentity)` mirroring `tasks.routes.ts`), with typed method signatures and stubbed bodies per contracts/projects-api.md.
- [X] T007 Mount the projects router behind `authenticate` + `resolveIdentity` in `apps/backend/src/app.ts` (add `app.use(projectsRoutes(authenticate, resolveIdentity))` alongside the tasks router; Stage 2's protected proxy already routes `/projects/*` — no infra change).

**Checkpoint**: Shared Project shape exists and validates identically on both sides; `/projects/*` is routed and protected. User stories can now begin.

---

## Phase 3: User Story 1 - Create projects and see them as cards (Priority: P1) 🎯 MVP

**Goal**: An authenticated user opens `/projects`, sees their projects as color-coded cards (or an empty state), and creates a new project (name required, optional description, palette color) that appears immediately, persists, and is scoped to their account.

**Independent Test**: Log in, open `/projects`, create a project with name/description/color, confirm it appears as a card, survives reload, and is invisible to a second account.

### Tests for User Story 1

> Write these FIRST and ensure they FAIL before implementing.

- [X] T008 [P] [US1] Projects repository ownership/not-found tests in `apps/backend/src/modules/projects/projects.repository.spec.ts`: `create`/`list` build `PK = USER#<userId>`, `SK = PROJECT#<id>` solely from the passed `userId`; a list only returns that owner's `PROJECT#` items; a read for a foreign id resolves as not-found — no disclosure (FR-016, SC-006). Use the fake DynamoDB doc-client pattern from the Stage 3 `tasks.repository.spec.ts`.
- [X] T009 [P] [US1] Projects service create/list tests in `apps/backend/src/modules/projects/projects.service.spec.ts`: `create` assigns ULID `id`, appends `order`, defaults `color`, sets `createdAt`/`updatedAt`, rejects empty/whitespace name via schema; `list` returns projects sorted by `order` then `id`.
- [X] T010 [P] [US1] `use-projects` hook test in `apps/frontend/src/projects/use-projects.spec.tsx`: loads `listProjects()` on mount; optimistic `createProject` appends a card immediately and rolls back on rejection surfacing an error (FR-018, client contract §use-projects).

### Implementation for User Story 1

- [X] T011 [US1] Implement `projects.repository.ts` in `apps/backend/src/modules/projects/`: `create(userId, project)`, `list(userId)` (Query `PK = USER#<userId>`, `begins_with(SK,'PROJECT#')`), `get(userId, id)`, using the shared doc client; key built only from `userId`; `PK`/`SK` never returned (data-model.md Persisted item).
- [X] T012 [US1] Implement `projects.service.ts` create/list in `apps/backend/src/modules/projects/`: validate with `createProjectSchema`, generate ULID `id`, compute append `order` via the shared `ordering` helper, default color, set timestamps; `listProjects(userId)` returns sorted projects.
- [X] T013 [US1] Implement `projects.controller.ts` `GET /projects` and `POST /projects` in `apps/backend/src/modules/projects/`: read only `req.auth.userId`, validate body, delegate to the service, return `200 { projects }` / `201 Project`, `400` on invalid body (contracts/projects-api.md uniform responses).
- [X] T014 [US1] Wire `GET /projects` and `POST /projects` in `apps/backend/src/modules/projects/projects.routes.ts` behind the injected middleware.
- [X] T015 [P] [US1] Implement `projects-client.ts` in `apps/frontend/src/projects/`: typed `ProjectsClient` over the shared `api-client` — `listProjects()` (GET → `{ projects }`) and `createProject(input)` (POST → 201), every non-2xx rejects, responses parsed with `projectSchema` (client contract §Data clients).
- [X] T016 [US1] Implement `use-projects.ts` in `apps/frontend/src/projects/`: load list on mount (`projects`, `loadStatus`, `error`, `reload`); optimistic `createProject` with snapshot rollback; new project `order` computed client-side via the shared `ordering` helpers (client contract §use-projects).
- [X] T017 [P] [US1] Implement `project-card.tsx` in `apps/frontend/src/projects/`: render one project's name, palette color, and description; maps `ProjectColor` token → shared design-system classes; navigates to the detail route on open.
- [X] T018 [P] [US1] Implement `create-project-dialog.tsx` in `apps/frontend/src/projects/`: name (required, inline "Name is required" on empty — FR-002), optional description, color picker over `PROJECT_COLORS` swatches (defaulted) built from shadcn/ui.
- [X] T019 [US1] Implement `projects-page.tsx` in `apps/frontend/src/projects/`: cards grid of `project-card`, empty state, and a "New project" control opening `create-project-dialog`; wires `use-projects` (depends on T016, T017, T018).
- [X] T020 [US1] Mount `/projects` in `apps/frontend/src/app/router.tsx` inside the protected `AppShell` `<Outlet/>` (like `/week`) and set `to: '/projects'` on the `projects` item in `apps/frontend/src/app/nav-items.ts` so it becomes an active sidebar link (client contract §Screens & routing).

**Checkpoint**: US1 is fully functional — create/list projects, scoped and persisted, with an empty state. MVP demonstrable.

---

## Phase 4: User Story 2 - Open a project and manage its task backlog (Priority: P1)

**Goal**: Open a project to its detail view (summary + backlog), add tasks by title (due date optional/unset), open a task to edit details, complete/reopen, and delete — all scoped to that project and account.

**Independent Test**: Open a project, add a backlog task by title, confirm it persists across reload; open it, edit and save; complete it (stays visible, distinct), reopen; delete it and confirm it is gone.

### Tests for User Story 2

> Write these FIRST and ensure they FAIL before implementing.

- [X] T021 [P] [US2] Extended task schema tests in `libs/shared/src/schemas/task.spec.ts`: `createTaskSchema` accepts `{ title, projectId }` with `dueDate` omitted (backlog-only) and `{ title, dueDate, projectId }`; `updateTaskSchema` accepts `dueDate: null` and `projectId: null` (clear/unbind); `title` still required non-empty (data-model.md Request-schema changes).
- [X] T022 [P] [US2] Tasks repository `queryByProject` test in `apps/backend/src/modules/tasks/tasks.repository.spec.ts`: returns all owner-partition tasks with matching `projectId` (backlog + scheduled) via a single Query with `FilterExpression: projectId = :projectId`; scoped to the passed `userId` only (research §2, FR-016).
- [X] T023 [P] [US2] Tasks service backlog tests in `apps/backend/src/modules/tasks/tasks.service.spec.ts`: create with `projectId` and no `dueDate` appends `order` after the project's tasks; create with `dueDate` appends after the day's tasks (data-model.md Create-ordering rule); `listByProject(userId, projectId)` returns the project's tasks sorted by `order` then `id`.
- [X] T024 [P] [US2] `use-project-tasks` hook test in `apps/frontend/src/projects/use-project-tasks.spec.tsx`: loads `listByProject(projectId)`; optimistic `addBacklogTask(title)` → `create({ title, projectId })` with temp card swapped on success and removed on failure; complete/reopen/delete roll back on rejection (client contract §use-project-tasks).

### Implementation for User Story 2

- [X] T025 [US2] Extend `createTaskSchema` and `updateTaskSchema` in `libs/shared/src/schemas/task.ts`: make `dueDate` optional on create (still `YYYY-MM-DD` when present), add optional `projectId: string`; on update allow `dueDate: string | null` and `projectId: string | null`; keep `title` non-empty if present (data-model.md Request-schema changes).
- [X] T026 [US2] Add `queryByProject(userId, projectId)` to `apps/backend/src/modules/tasks/tasks.repository.ts`: single owner-partition Query with `FilterExpression: projectId = :projectId` (research §2).
- [X] T027 [US2] Extend `apps/backend/src/modules/tasks/tasks.service.ts`: create computes `order` against the correct sibling set (project's tasks when no `dueDate`, else the day's tasks); add `listByProject(userId, projectId)` (data-model.md Create-ordering rule, research §3).
- [X] T028 [US2] Extend `apps/backend/src/modules/tasks/tasks.controller.ts` to accept `?projectId=<id>` on `GET /tasks` and return `{ tasks }` for that project (independent of the `from`/`to` week window); create/update pass through the extended schema (contracts/projects-api.md Task API extensions).
- [X] T029 [P] [US2] Extend `apps/frontend/src/week/tasks-client.ts`: add `listByProject(projectId)` (GET `/tasks?projectId=<id>` → `{ tasks }`); allow `create({ title, projectId, dueDate? })` and `update(id, { dueDate: string | null, projectId: string | null })` (client contract §Backlog reuses tasks-client).
- [X] T030 [US2] Implement `use-project-tasks.ts` in `apps/frontend/src/projects/`: load `listByProject(projectId)` sorted by `order` then `id`; optimistic `addBacklogTask`, edit, complete/reopen, delete with snapshot rollback, reusing Stage 3 patterns (client contract §use-project-tasks).
- [X] T031 [US2] Implement `project-backlog.tsx` in `apps/frontend/src/projects/`: backlog list reusing the Stage 3 `task-card`, inline add-task at the bottom (title only), open a task in the reused `task-detail-dialog`, complete/reopen, delete; completed tasks stay visible in a distinct state (FR-007).
- [X] T032 [US2] Extend `apps/frontend/src/week/task-detail-dialog.tsx` so the due date is optional and clearable (empty → backlog-only), keeping Stage 3 Week behavior intact, so the backlog can reuse it (client contract §project-detail-page).
- [X] T033 [US2] Implement `project-detail-page.tsx` in `apps/frontend/src/projects/` and mount `/projects/:id` inside the protected `AppShell` in `apps/frontend/src/app/router.tsx`: header shows name/description/color; renders `project-backlog`; loads the project and its tasks (depends on T030, T031).

**Checkpoint**: US1 + US2 form the minimum viable Projects feature — create projects and run a project's backlog end-to-end.

---

## Phase 5: User Story 3 - Track project progress (Priority: P2)

**Goal**: The detail view shows a progress bar and completion indicator equal to completed ÷ total, recomputing as tasks are added, completed, reopened, or deleted, with a defined zero state.

**Independent Test**: In a project with several tasks, complete some → bar/percent updates to completed ÷ total; reopen/add → recomputes; zero tasks → defined 0% state, no error.

### Tests for User Story 3

> Write this FIRST and ensure it FAILS before implementing.

- [X] T034 [P] [US3] Pure `progress()` tests in `apps/frontend/src/projects/progress.spec.ts`: `total`/`completed` counts, `ratio = total === 0 ? 0 : completed/total`, `percent = round(ratio*100)`, and the zero-task case returns `0` (not a division artifact) (FR-010, client contract §Progress).

### Implementation for User Story 3

- [X] T035 [P] [US3] Implement the pure `progress(tasks)` helper in `apps/frontend/src/projects/progress.ts` returning `{ total, completed, ratio, percent }`, zero-safe (data-model.md §Project progress).
- [X] T036 [P] [US3] Implement `progress-bar.tsx` in `apps/frontend/src/projects/`: render `percent` from `progress()` using shared design tokens, with a "no tasks yet" zero state.
- [X] T037 [US3] Wire the progress indicator into `apps/frontend/src/projects/project-detail-page.tsx`: compute `progress()` from the current backlog on every change (no request) and render `progress-bar` in the header (FR-010).

**Checkpoint**: Progress updates live from the backlog already loaded by the detail page.

---

## Phase 6: User Story 4 - Schedule a project task onto the Week board (Priority: P2)

**Goal**: Setting a project task's due date makes it appear on the Week board under that day showing its project's name and color; clearing the due date returns it to backlog-only. Standalone tasks show no project badge.

**Independent Test**: A backlog task with no due date appears only in the backlog; set its due date → appears on the Week board with the project name/color badge and stays in the backlog; clear it → leaves the Week board, stays in the backlog. Dragging it across days updates the due date and reflects in the project.

### Tests for User Story 4

> Write this FIRST and ensure it FAILS before implementing.

- [X] T038 [P] [US4] Week `task-card` badge + projects-map test in `apps/frontend/src/week/use-week-tasks.spec.tsx`: `use-week-tasks` exposes a `projectId → { name, color }` map from the loaded projects list; a scheduled task with a `projectId` renders a project badge and a standalone task renders none (FR-012, research §9).

### Implementation for User Story 4

- [X] T039 [US4] Extend `apps/frontend/src/week/use-week-tasks.ts` to additionally load the projects list once and expose a `projectId → { name, color }` map for day cards (research §9).
- [X] T040 [US4] Extend `apps/frontend/src/week/task-card.tsx` to render a small project badge (name + palette color) when the task has a `projectId`, and none for standalone tasks (FR-012); rename/recolor propagates via the next projects-list load (FR-014, research §9).
- [X] T041 [US4] Verify/extend the reused due-date control (T032) so setting a due date on a backlog task via `use-project-tasks.scheduleTask` / clearing via `clearDueDate` moves it between backlog-only and scheduled, and that Week drag-and-drop updating `dueDate` is reflected in the backlog (same record) in `apps/frontend/src/projects/use-project-tasks.ts` and `apps/frontend/src/week/use-week-tasks.ts` (FR-013).

**Checkpoint**: Scheduled project tasks surface on the Week board with project identity; the project↔Week relationship is live.

---

## Phase 7: User Story 5 - Reorder the backlog and edit or delete a project (Priority: P3)

**Goal**: Reorder backlog tasks into a persisted manual order; edit a project's name/description/color; delete a project (cascading to its tasks) after a warning.

**Independent Test**: Drag a backlog task to a new position → order persists across reload; edit name/description/color → persists and propagates to Week badges; delete a project → warning names the task count, then project and all its tasks vanish from Projects and Week views.

### Tests for User Story 5

> Write these FIRST and ensure they FAIL before implementing.

- [X] T042 [P] [US5] Projects service delete-cascade test in `apps/backend/src/modules/projects/projects.service.spec.ts`: `deleteProject` resolves the project's task ids via the tasks service (`listByProject`) and deletes them (`deleteByProject`) before deleting the project record; a foreign id is `404` and touches no tasks; retry is idempotent (FR-015, research §5). Assert the projects module calls the tasks **service**, never its repository/domain (Principle I).
- [X] T043 [P] [US5] Projects service edit test in `apps/backend/src/modules/projects/projects.service.spec.ts`: `updateProject` applies a partial in-place patch, rejects empty name, and bumps `updatedAt` (FR-014, Story 5.5).
- [X] T044 [P] [US5] Tasks service `deleteByProject` test in `apps/backend/src/modules/tasks/tasks.service.spec.ts`: deletes all of the owner's tasks with the given `projectId` (backlog + scheduled), scoped to `userId`, idempotent (research §5).

### Implementation for User Story 5

- [X] T045 [US5] Add `deleteByProject(userId, projectId)` to `apps/backend/src/modules/tasks/tasks.service.ts` (and any repository delete-by-project support in `apps/backend/src/modules/tasks/tasks.repository.ts`): Query the project's tasks then batched deletes, idempotent (research §5).
- [X] T046 [US5] Implement `updateProject`/`deleteProject` in `apps/backend/src/modules/projects/projects.service.ts`: edit validates with `updateProjectSchema`; delete cascades via `TasksService.listByProject` + `deleteByProject` (public API only — Principle I) then deletes the project record (contracts/projects-api.md, research §5).
- [X] T047 [US5] Implement `PATCH /projects/:id` and `DELETE /projects/:id` in `apps/backend/src/modules/projects/projects.controller.ts` and wire them in `projects.routes.ts`: `200` updated Project / `204` on delete, `404` for a non-owner id with no disclosure, `400` on invalid body, `500` if the cascade fails (contracts/projects-api.md).
- [X] T048 [US5] Extend `apps/frontend/src/projects/projects-client.ts` with `updateProject(id, patch)` (PATCH → 200) and `deleteProject(id)` (DELETE → 204), both rejecting on non-2xx (client contract §Data clients).
- [X] T049 [US5] Extend `apps/frontend/src/projects/use-projects.ts` with optimistic `editProject` and `deleteProject` (remove card immediately, reinstate on failure) with snapshot rollback (client contract §use-projects).
- [X] T050 [US5] Add backlog reorder to `apps/frontend/src/projects/project-backlog.tsx` and `use-project-tasks.ts`: `@dnd-kit` sortable computing `between(prev, next)` via the shared `apps/frontend/src/week/ordering.ts`; persist the moved task's `order`; new tasks append at the bottom (FR-009, SC-005, research §6).
- [X] T051 [US5] Reuse `create-project-dialog.tsx` for edit (prefilled) and add a delete control to `apps/frontend/src/projects/project-detail-page.tsx` that warns "This removes the project and its N tasks" before calling `deleteProject`, then navigates back to `/projects` on success (Story 5.4, client contract §project-detail-page).

**Checkpoint**: All five user stories are independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns (E2E + validation)

**Purpose**: End-to-end coverage of the core flow and rejection cases (FR-020, SC-008), plus final validation.

- [X] T052 [P] Playwright e2e core flow in `apps/frontend-e2e/src/projects-core-flow.e2e.ts`: create project → open detail → add/complete backlog tasks → progress updates → set a due date and confirm the badge on the Week board → reorder backlog → edit project → delete-cascade removes project and its tasks from both views (SC-008), following the Stage 3 e2e support patterns.
- [X] T053 [P] Playwright e2e rejections in `apps/frontend-e2e/src/projects-rejections.e2e.ts`: unauthenticated visit to `/projects` redirects to login; account B cannot read/modify account A's project or its tasks (`GET /tasks?projectId=<A's id>` returns empty/404, no disclosure) (SC-006).
- [X] T054 Run the full gate: `npx nx run-many -t test -p shared backend frontend` and `npx nx e2e frontend-e2e`; confirm green (Principle III, quickstart.md Automated checks).
- [ ] T055 Execute the quickstart.md manual validation (US1–US5 walkthrough + isolation smoke check) and confirm each acceptance scenario behaves as specified.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Stories (Phases 3–7)**: Depend on Foundational. US1 and US2 are both P1 and together form the MVP; US2 also introduces the task-schema extensions that US4 and US5 build on. US3 depends on US2 (needs a loaded backlog). US4 depends on US2 (needs project tasks + the reused due-date control from T032) and the Stage 3 Week board. US5 depends on US1/US2 (project CRUD + tasks).
- **Polish (Phase 8)**: Depends on the stories under test being complete.

### User Story Dependencies

- **US1 (P1)**: After Foundational. No dependency on other stories.
- **US2 (P1)**: After Foundational. Independent of US1 at the data layer, but the detail page is reached from US1's cards.
- **US3 (P2)**: After US2 (progress is computed from the backlog US2 loads).
- **US4 (P2)**: After US2 (reuses the optional/clearable due-date control T032) and the Stage 3 Week board.
- **US5 (P3)**: After US1 + US2 (edits/deletes projects and cascades their tasks).

### Within Each User Story

- Tests are written first and must FAIL before implementation.
- Backend: repository → service → controller → routes.
- Frontend: client → hook → components → page/route.
- Shared schema changes precede the code that imports them.

### Parallel Opportunities

- Setup T002/T003 run in parallel; Foundational T004/T005 run in parallel (schema + its spec).
- Within a story, all `[P]` test tasks run together first, then `[P]` implementation tasks on different files.
- Because US1 and US2 touch mostly different files (projects module vs. tasks module + shared task schema), they can be staffed in parallel after Foundational — coordinate only on `router.tsx` (T020/T033).
- The two e2e files (T052/T053) run in parallel.

---

## Parallel Example: User Story 1

```bash
# Tests first (fail), in parallel:
Task: "Projects repository ownership tests in apps/backend/src/modules/projects/projects.repository.spec.ts"
Task: "Projects service create/list tests in apps/backend/src/modules/projects/projects.service.spec.ts"
Task: "use-projects hook test in apps/frontend/src/projects/use-projects.spec.tsx"

# Then parallel implementation on different files:
Task: "Implement projects-client.ts in apps/frontend/src/projects/"
Task: "Implement project-card.tsx in apps/frontend/src/projects/"
Task: "Implement create-project-dialog.tsx in apps/frontend/src/projects/"
```

---

## Implementation Strategy

### MVP First (US1 + US2 — both P1)

1. Phase 1 Setup → Phase 2 Foundational (shared schema + mounted module).
2. Phase 3 US1 (create + list projects) → STOP and validate independently.
3. Phase 4 US2 (open detail + backlog) → STOP and validate. This is the minimum viable Projects feature.

### Incremental Delivery

1. Foundational ready.
2. US1 → test → demo (create/list projects).
3. US2 → test → demo (backlog end-to-end).
4. US3 → progress bar. 5. US4 → Week board scheduling. 6. US5 → reorder + edit/delete cascade.
7. Phase 8 → e2e + quickstart validation before merge.

### Notes

- `[P]` = different files, no incomplete dependencies.
- `linkedNoteIds` stays present but unpopulated (Stage 5, Principle VI) — do not surface it.
- No new dependency and no `apps/infra` change this stage (research §10, Principle VI).
- Commit after each task or logical group; keep CI green (Principle III).
