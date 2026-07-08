---
description: "Task list for Stage 3 — Week Board"
---

# Tasks: Stage 3 — Week Board

**Input**: Design documents from `/specs/003-week-board/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: INCLUDED — the feature explicitly requires automated unit/integration + e2e coverage (FR-018) and the constitution mandates Test-First Discipline (Principle III, NON-NEGOTIABLE). Test tasks are written before their implementation within each phase/story.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Include exact file paths in descriptions

## Path Conventions

Nx monorepo (per plan.md): backend `apps/backend/src/`, frontend `apps/frontend/src/`, shared `libs/shared/src/`, e2e `apps/frontend-e2e/src/`. All commands run through Nx targets (Principle V).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Register new dependencies and confirm the workspace builds before any feature work.

- [X] T001 Add Stage 3 runtime dependencies to the workspace root `package.json` and install: backend `ulid` and `uuid` (+ `@types/uuid` dev), frontend `@dnd-kit/core` and `@dnd-kit/sortable` (research §2, §3, §11); verify they resolve in the single Nx graph.
- [X] T002 [P] Confirm Nx project wiring for the new areas: ensure `apps/backend/src/modules/tasks/`, `apps/backend/src/middleware/`, and `apps/frontend/src/week/` are covered by existing tsconfig/lint/test globs; remove the `.gitkeep` in `apps/backend/src/modules/tasks/` once real files exist (do not commit empty dirs).
- [X] T003 [P] Verify baseline is green before changes: run `npx nx run-many -t lint test build` and record that Stage 2 tests pass (guards the identity refactor in Phase 2).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared schemas + the app-level identity refactor + the tasks module skeleton and its mounting. Everything here blocks ALL user stories: no task read/write is owner-safe until identity resolution exists, and no controller/client compiles until the shared schemas exist.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Shared schemas (source of truth for both sides — research §9)

- [X] T004 [P] Extend the Task schema in `libs/shared/src/schemas/task.ts`: add `order: z.string()`, `createdAt: z.string()`, `updatedAt: z.string()`; keep `projectId` (nullable, null this stage) and `linkedNoteIds` (`[]` this stage); ensure `dueDate` is `YYYY-MM-DD | null`, `status` ∈ {open,completed} (default open), `priority` ∈ {low,medium,high} (default medium), `labels: string[]` (default []). Export `Task` type.
- [X] T005 [P] Add `createTaskSchema` and `updateTaskSchema` to `libs/shared/src/schemas/task.ts`: `createTaskSchema` = `{ title: non-empty/trimmed string, dueDate: YYYY-MM-DD, description?, priority?, labels? }`; `updateTaskSchema` = all of `{ title?, description?, dueDate?, priority?, labels?, status?, order? }` optional, `title` if present must be non-empty; export both types. (Depends on T004.)
- [X] T006 [P] Refactor the User schema in `libs/shared/src/schemas/user.ts` to the app-level identity shape `{ id: uuid, email, createdAt }` (client-visible via `/me`); document that `cognitoSub` is server-only and NOT part of this client shape (data-model.md §User, FR-014).
- [X] T007 [P] Ensure `libs/shared/src/index.ts` re-exports the extended `task` and `user` schemas/types (`Task`, `createTaskSchema`, `updateTaskSchema`, `User`) so `@workboard/shared` exposes them to backend and frontend.

### Test-first: shared schema validation (write before/with T004–T006)

- [X] T008 [P] Extend `libs/shared/src/schemas/task.spec.ts`: assert `createTaskSchema` rejects empty/whitespace-only title and malformed `dueDate` (not `YYYY-MM-DD`), applies `priority='medium'` default, and that `updateTaskSchema` accepts partial bodies but rejects an empty `title` when present (FR-004). These MUST fail before T004/T005 land, then pass.

### App-level identity: refactor + resolution (data-model.md §User; research §11–§12)

- [X] T009 Refactor `apps/backend/src/modules/auth/profile.repository.ts` into `apps/backend/src/modules/auth/user.repository.ts`: persist the **User profile** (`PK=USER#<userId>`, `SK=PROFILE`, `{ id, cognitoSub, email, createdAt }`) and the **auth pointer** (`PK=AUTH#<sub>`, `SK=AUTH#<sub>`, `{ userId, createdAt }`); expose `getOrCreateUser(sub, email)` (idempotent bootstrap via `TransactWriteCommand` guarded by `attribute_not_exists(PK)`) and `resolveUserIdBySub(sub)` (single strongly-consistent `GetItem`). Update the co-located spec filename to `user.repository.spec.ts`.
- [X] T010 Create `apps/backend/src/modules/auth/identity.service.ts` exposing `resolveUserId(sub, email)`: returns the app `userId`, get-or-bootstraps via `user.repository`, and caches the immutable `sub → userId` mapping in an in-Lambda `Map` (warm containers do zero DynamoDB reads — research §12). (Depends on T009.)
- [X] T011 Create `apps/backend/src/middleware/resolve-identity.ts`: runs after `authenticate`, reads the verified `req.auth.sub`/`email`, calls `identity.service.resolveUserId`, and attaches `req.auth = { sub, email, userId }`; on resolution failure responds `500` without leaking internals (FR-016). (Depends on T010.)
- [X] T012 Update `apps/backend/src/modules/auth/auth.service.ts` and `auth.controller.ts` so `/me` returns the app User `{ id, email }` (resolved `userId`, never `cognitoSub`); keep `auth.routes.ts` wiring behind `authenticate` + `resolve-identity`. (Depends on T009–T011.)

### Test-first: identity (write before/with T009–T012) ⚠️

- [X] T013 [P] Rewrite `apps/backend/src/modules/auth/user.repository.spec.ts` (from `profile.repository.spec.ts`) against DynamoDB Local: idempotent `getOrCreateUser` (concurrent/repeated calls bind exactly one `userId` to a `sub`), `resolveUserIdBySub` returns the bound id, and two distinct subs get distinct `userId`s (data-model.md §User).
- [X] T014 [P] Create `apps/backend/src/modules/auth/identity.service.spec.ts`: first resolve bootstraps (one read/transaction), a second resolve for the same `sub` is served from cache (no further DynamoDB call), and distinct subs resolve to distinct ids (research §12).
- [X] T015 [P] Create `apps/backend/src/middleware/resolve-identity.spec.ts`: given an authenticated `sub`, the middleware attaches `req.auth.userId`; a resolution error yields `500` and does not call downstream controllers.
- [X] T016 Update `apps/backend/src/modules/auth/me.spec.ts` for the app-User `/me` shape (`{ id, email }`, no `cognitoSub`); confirm existing Stage 2 auth specs (`auth.resend.spec.ts`) still pass after the refactor (quickstart "existing Stage 2 auth flows still pass").

### Tasks module skeleton + mount (Principle I layering; contracts/tasks-api.md)

- [X] T017 Create the tasks repository `apps/backend/src/modules/tasks/tasks.repository.ts`: ownership-enforced CRUD keyed on `PK=USER#<userId>` (userId passed in from the resolved identity — never caller input), `SK=TASK#<id>`; methods `queryWindow(userId, from, to)`, `put(userId, task)`, `getById(userId, id)`, `update(userId, id, patch)`, `delete(userId, id)`; a missing/foreign id resolves as not-found (FR-014, SC-006). Never return `PK`/`SK`/`ownerId`.
- [X] T018 Create `apps/backend/src/modules/tasks/tasks.service.ts` with the orchestration surface (stubs OK now, filled per-story): `createTask`, `listWeek`, `updateTask` (edit/move/reorder/complete), `deleteTask`; generates `id` via ULID, sets `createdAt`/`updatedAt`, computes `order`. (Depends on T017.)
- [X] T019 Create `apps/backend/src/modules/tasks/tasks.controller.ts` (thin): validate body with `createTaskSchema`/`updateTaskSchema` from `@workboard/shared`, read only `req.auth.userId`, delegate to `tasks.service`, map errors to the uniform `400/404/500` responses (contracts/tasks-api.md). (Depends on T018.)
- [X] T020 Create `apps/backend/src/modules/tasks/tasks.routes.ts` exposing `GET /tasks`, `POST /tasks`, `PATCH /tasks/:id`, `DELETE /tasks/:id`. (Depends on T019.)
- [X] T021 Mount the tasks router in `apps/backend/src/app.ts` behind `authenticate` + `resolve-identity` (no new infra — Stage 2 proxy already routes `/tasks/*`). (Depends on T011, T020.)

### Frontend foundational plumbing

- [X] T022 [P] Create `apps/frontend/src/week/tasks-client.ts`: typed wrapper over the existing Stage 2 `api-client` with `listWeek(from,to)`, `create(input)`, `update(id,patch)`, `remove(id)`, parsing responses with the shared schemas; non-2xx (other than the api-client's `401` refresh) rejects so callers can roll back (contracts/tasks-client-contract.md). (Depends on T007.)
- [X] T023 [P] Extend `apps/frontend/src/app/router.tsx` to render the Week feature at protected `/` and `/week` inside `RequireAuth` → `AppShell`; wire the existing "Week" sidebar nav item to `/week` in `apps/frontend/src/app/app-shell.tsx`. (Renders a placeholder page until US1.)

**Checkpoint**: Identity resolves `sub → userId`, shared schemas validate on both sides, the tasks REST surface is mounted and owner-scoped, and the Week route is reachable — user stories can now begin.

---

## Phase 3: User Story 1 - Plan the current week and capture tasks (Priority: P1) 🎯 MVP

**Goal**: An authenticated user opens the Week view, sees seven Monday→Sunday columns for the current week (today distinguished), and adds tasks inline at the bottom of a day; each task persists, is scoped to their account, and defaults its due date to that day.

**Independent Test**: Log in, open Week, confirm seven correctly-labeled/dated columns with today highlighted, add a task under a specific day, confirm it appears under that day with a matching due date and survives reload; a second user sees none of the first user's tasks.

### Tests for User Story 1 (write first, ensure they FAIL) ⚠️

- [X] T024 [P] [US1] Create `apps/frontend/src/week/week.spec.ts` for `week.ts`: `startOfWeek` returns the Monday of the containing week, `weekDays` returns seven correct `YYYY-MM-DD` Monday→Sunday dates across week/month/year boundaries, `todayDate`/`isToday` correct (SC-005).
- [X] T025 [P] [US1] Create `apps/backend/src/modules/tasks/tasks.repository.spec.ts` (ownership) against DynamoDB Local: `queryWindow`/`getById` for one `userId` never return another `userId`'s items, and a foreign/missing id is **not-found** (FR-014, SC-006).
- [X] T026 [P] [US1] Create `apps/backend/src/modules/tasks/tasks.service.spec.ts` (create + list-week): `createTask` sets `id`/`order`(append)/`status='open'`/timestamps and defaults `priority='medium'`; `listWeek(from,to)` returns only in-window tasks for the owner (contracts/tasks-api.md GET/POST).
- [X] T027 [P] [US1] Add a Playwright spec `apps/frontend-e2e/src/week-create.e2e.ts`: log in → open Week → seven dated columns with today distinguished → inline-add under a day → card appears at the bottom with that day's date → reload → still present (FR-001/FR-003/FR-013).

### Implementation for User Story 1

- [X] T028 [P] [US1] Implement `apps/frontend/src/week/week.ts` pure week/date math: `todayDate`, `startOfWeek`, `weekDays`, `addWeeks`, `isToday` on date-only strings, Monday-start (research §5–§6).
- [X] T029 [P] [US1] Implement `apps/frontend/src/week/ordering.ts` fractional-index helpers `append(lastOrderInDay?)` and `between(prevOrder?, nextOrder?)` returning lexicographically-sortable rank strings (research §4). (Needed for append-on-create; between used in US2/US3.)
- [X] T030 [US1] Implement `POST /tasks` end-to-end: fill `tasks.service.createTask` (ULID id, `order` appended to that day via repository read of the day's last task, defaults) and the controller/route path; return `201` with the created `Task` (contracts/tasks-api.md POST). (Depends on T017–T020, T029.)
- [X] T031 [US1] Implement `GET /tasks?from&to` end-to-end: `tasks.service.listWeek` via a single owner-partition `Query` filtered to `[from,to]`; return `{ tasks: [...] }` (contracts/tasks-api.md GET). (Depends on T017–T020.)
- [X] T032 [US1] Implement `apps/frontend/src/week/use-week-tasks.ts` (load slice): state `referenceMonday` + week `Task[]` + load status; on mount/`referenceMonday` change call `tasks-client.listWeek(from,to)`; derive `days` and group tasks by `dueDate` sorted by `order` then `id`. Include optimistic `addTask(day,title)` with temp card + rollback (contracts/tasks-client-contract.md). (Depends on T022, T028, T029.)
- [X] T033 [US1] Implement `apps/frontend/src/week/week-page.tsx` (board container) and `apps/frontend/src/week/week-board.tsx` (seven `day-column`s for the current week), wired to `use-week-tasks`. (Depends on T032.)
- [X] T034 [US1] Implement `apps/frontend/src/week/day-column.tsx` (header: weekday + date, today marker; empty state) and `apps/frontend/src/week/task-card.tsx` (title display, long-title wrap/truncate) from shadcn/ui (FR-001, FR-017). (Depends on T033.)
- [X] T035 [US1] Implement `apps/frontend/src/week/add-task-inline.tsx`: bottom-of-day title input with client-side non-empty validation and "title required" feedback, calling `addTask` (FR-003, FR-004). (Depends on T032, T034.)

**Checkpoint**: US1 is independently functional — view the current week and capture persisted, owner-scoped tasks (MVP).

---

## Phase 4: User Story 2 - Reschedule a task by dragging it to another day (Priority: P1)

**Goal**: Dragging a card to a different day moves it there and updates its due date; the move persists; an invalid/cancelled drop makes no change.

**Independent Test**: Drag a card from one day to another, release, confirm it sits under the target day with that day's due date and persists across reload; dropping outside any column leaves it unchanged.

### Tests for User Story 2 (write first, ensure they FAIL) ⚠️

- [X] T036 [P] [US2] Extend `apps/backend/src/modules/tasks/tasks.service.spec.ts`: `updateTask` with a new `dueDate` (+`order`) changes the day and bumps `updatedAt`; last-write-wins; a foreign id is not-found (FR-005, FR-010, SC-003).
- [X] T037 [P] [US2] Add a Playwright spec `apps/frontend-e2e/src/week-move.e2e.ts`: drag a card to another day → new day + due date → reload persists; drop outside any column → no change (Story 2.1–2.3, SC-003).

### Implementation for User Story 2

- [X] T038 [US2] Implement `PATCH /tasks/:id` for reschedule/move in `tasks.service.updateTask` + controller: accept `{ dueDate?, order? }`, update in place, bump `updatedAt`, return the full `Task`; `404` for a foreign/missing id (contracts/tasks-api.md PATCH). (Depends on T017–T020.)
- [X] T039 [US2] Add optimistic `moveTask(id, toDay, index)` to `apps/frontend/src/week/use-week-tasks.ts`: move card to `toDay` at `index`, compute new `order` via `ordering.between`, set new `dueDate`, call `tasks-client.update(id,{dueDate,order})`, rollback on failure (contracts/tasks-client-contract.md). (Depends on T032, T029, T038.)
- [X] T040 [US2] Wire `@dnd-kit` cross-day drag in `apps/frontend/src/week/week-board.tsx`/`day-column.tsx`/`task-card.tsx`: one `DndContext` with pointer + keyboard sensors, each day a droppable, on drag-end to a different day compute target neighbors → `order` → call `moveTask`; a drop outside any column or back in place performs no mutation and no server call (research §3, Story 2.3, FR-017). (Depends on T039.)

**Checkpoint**: US1 + US2 both work — capture tasks and reschedule them by dragging across days.

---

## Phase 5: User Story 3 - Reorder tasks within a day (Priority: P2)

**Goal**: Dragging cards up/down within a day sets a manual order that persists across reloads, independent of due date/creation time.

**Independent Test**: With three cards in one day, drag the bottom to the top, confirm the order, reload, confirm it persisted; a newly added task lands at the bottom.

### Tests for User Story 3 (write first, ensure they FAIL) ⚠️

- [X] T041 [P] [US3] Extend `apps/frontend/src/week/ordering.spec.ts` (create if absent): `between` yields a rank strictly between neighbors; repeated inserts between the same pair keep producing valid, correctly-sorting ranks (no precision collapse); `append` lands after the last (research §4, SC-004).
- [X] T042 [P] [US3] Add a Playwright spec `apps/frontend-e2e/src/week-reorder.e2e.ts`: reorder within a day → order reflows → reload persists the manual order; a new inline task appears at the bottom (Story 3.1–3.3, SC-004).

### Implementation for User Story 3

- [X] T043 [US3] Add optimistic `reorderTask(id, index)` to `apps/frontend/src/week/use-week-tasks.ts`: reorder within the card's day, compute `order` via `ordering.between`, call `tasks-client.update(id,{order})`, rollback on failure (contracts/tasks-client-contract.md). (Depends on T032, T029, T038.)
- [X] T044 [US3] Extend the `@dnd-kit` drag-end handling in `week-board.tsx`/`day-column.tsx` so a same-day drop calls `reorderTask` (vs. `moveTask` for cross-day), each day a `SortableContext` of cards (research §3, FR-006). (Depends on T043, T040.)

**Checkpoint**: US1–US3 work — capture, reschedule across days, and reorder within a day, all persisted.

---

## Phase 6: User Story 4 - Navigate between weeks (Priority: P2)

**Goal**: Move to previous/next week and jump back to the current week; the board re-renders the selected week's dates and its tasks; creating on a non-current week defaults the due date to the displayed day.

**Independent Test**: From the current week go next → dates advance seven days and show that week's tasks; use current/today → returns to the week containing today; add a task on a non-current week → due date is that displayed day, not today.

### Tests for User Story 4 (write first, ensure they FAIL) ⚠️

- [X] T045 [P] [US4] Extend `apps/frontend/src/week/week.spec.ts`: `addWeeks(monday, ±n)` correct across month/year boundaries; "current week" resolves to the Monday of today (SC-005, SC-009).
- [X] T046 [P] [US4] Add a Playwright spec `apps/frontend-e2e/src/week-navigate.e2e.ts`: next/prev advance the seven dates and show that week's tasks; current-week returns to today in a single action; adding on a non-current week defaults due date to the displayed day; empty week shows empty state + inline add (Story 4.1–4.4, FR-007/FR-008/SC-009).

### Implementation for User Story 4

- [X] T047 [US4] Implement `apps/frontend/src/week/week-nav.tsx`: previous / next / current-week controls driving `referenceMonday` in `use-week-tasks` (via `addWeeks` / `startOfWeek(todayDate())`); reload the week window on change (FR-007). (Depends on T032, T028, T033.)
- [X] T048 [US4] Ensure inline create on a non-current week passes the displayed day's `dueDate` (not today) through `addTask` → `POST /tasks` (FR-008); confirm empty days still render the empty state + inline add (Story 4.4). (Depends on T035, T047.)

**Checkpoint**: US1–US4 work — full week navigation with correct dates and day-defaulted creation.

---

## Phase 7: User Story 5 - Edit task details, complete, reopen, and delete (Priority: P2)

**Goal**: Open a task to edit title/description/due date/priority/labels; mark complete/reopen (completed stays visible in a distinct state); changing due date moves it to the matching day; delete removes it from board and persistence.

**Independent Test**: Open a task, edit fields and save (persist); complete → stays visible distinct; reopen → open; change due date → moves days; delete → gone after reload; empty title on save → rejected, prior value retained.

### Tests for User Story 5 (write first, ensure they FAIL) ⚠️

- [X] T049 [P] [US5] Extend `apps/backend/src/modules/tasks/tasks.service.spec.ts`: `updateTask` edits fields + toggles `status` (complete/reopen) bumping `updatedAt`; rejects an empty `title` when present (retains prior); `deleteTask` removes the item and a subsequent get/delete is not-found (FR-009/FR-011/FR-012, Story 5.6).
- [X] T050 [P] [US5] Add a Playwright spec `apps/frontend-e2e/src/week-detail.e2e.ts`: open detail → edit + save persists; complete → visible distinct; reopen; change due date → moves day; delete → gone after reload; empty-title save → "title required", prior title kept (Story 5.1–5.6, SC-008).

### Implementation for User Story 5

- [X] T051 [US5] Implement `DELETE /tasks/:id` end-to-end (`tasks.service.deleteTask` + controller/route): `204` on success, `404` for a foreign/missing id, idempotent from the user's view (contracts/tasks-api.md DELETE). (Depends on T017–T020.)
- [X] T052 [US5] Extend `PATCH /tasks/:id` handling for full edits + `status`: accept `{ title?, description?, priority?, labels?, status? }`, enforce non-empty `title` when present (`400`, prior value retained), bump `updatedAt` (contracts/tasks-api.md PATCH, FR-004/FR-009/FR-011). (Depends on T038.)
- [X] T053 [US5] Add optimistic `editTask(id,patch)`, `toggleComplete(id)`, `deleteTask(id)` to `apps/frontend/src/week/use-week-tasks.ts` with rollback; title-required keeps the dialog open with prior value (contracts/tasks-client-contract.md). (Depends on T032, T051, T052.)
- [X] T054 [US5] Implement `apps/frontend/src/week/task-detail-dialog.tsx` (shadcn/ui dialog): view/edit title/description/dueDate/priority/labels, complete/reopen, delete; opened from `task-card`; changing due date reschedules to the matching day; render completed cards in a distinct (muted/strikethrough) style in `task-card.tsx` (FR-009/FR-010/FR-011/FR-012, SC-008). (Depends on T053, T034.)

**Checkpoint**: All five user stories are independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Failure-state coverage, cross-user/unauthenticated denial e2e, responsiveness, and final validation across all stories.

- [X] T055 [P] Add a Playwright spec `apps/frontend-e2e/src/week-rejections.e2e.ts`: unauthenticated access to `/week` redirects to `/login`; one authenticated user cannot read/modify another user's task (cross-user request → not-found, no disclosure) (SC-006, FR-014).
- [X] T056 [P] Add save-failure coverage (Playwright or hook test): a failed create/move/reorder/edit/delete rolls back the optimistic change and surfaces a clear failure state, never presenting the change as saved (FR-016).
- [X] T057 [P] Verify responsive/layout requirements in `week-board.tsx`/`day-column.tsx`: board reflows on smaller viewports, a full day scrolls within its column, long titles don't break layout (FR-017, spec Edge Cases).
- [X] T058 Run the quickstart validation end-to-end (`specs/003-week-board/quickstart.md`) on the PWA and the core flow on desktop (Tauri); confirm no `projectId`/`linkedNoteIds` are populated/surfaced and no new AWS infra was added.
- [X] T059 Run full CI gates green: `npx nx run-many -t lint test build` and `npx nx e2e frontend-e2e`; confirm Stage 2 auth flows still pass after the identity refactor (Principle III).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup — BLOCKS all user stories (identity + schemas + mounted tasks surface).
- **User Stories (Phase 3–7)**: all depend on Foundational. US1 is the MVP. US2 depends on US1's board + `ordering.ts`; US3 depends on US2's `@dnd-kit` wiring; US4 depends on US1's board/hook; US5 depends on US1's board + card. Backend `PATCH`/`DELETE` slices (T038, T051, T052) are shared foundations reused across US2/US3/US5.
- **Polish (Phase 8)**: depends on all targeted user stories complete.

### User Story Dependencies

- **US1 (P1)**: after Foundational — no dependency on other stories (MVP).
- **US2 (P1)**: after US1 (needs the board, cards, hook, and `ordering.ts`).
- **US3 (P2)**: after US2 (extends the same `@dnd-kit` drag-end handler).
- **US4 (P2)**: after US1 (extends the board/hook with navigation); independent of US2/US3.
- **US5 (P2)**: after US1 (extends the card with a detail dialog); independent of US2/US3/US4.

### Within Each User Story

- Tests are written first and must FAIL before implementation (Principle III).
- Shared schemas → repository → service → controller → routes → frontend hook → UI.
- Story complete and independently testable before moving to the next priority.

### Parallel Opportunities

- Setup: T002, T003 in parallel (after/with T001).
- Foundational: schema tasks T004–T008 in parallel; identity tests T013–T015 in parallel; frontend plumbing T022–T023 in parallel; the identity refactor (T009–T012) is sequential (shared files), and the tasks skeleton (T017–T021) is sequential (layered chain).
- Each story's test tasks marked [P] run in parallel; pure-module implementations (T028 `week.ts`, T029 `ordering.ts`) run in parallel.
- Polish: T055–T057 in parallel.

---

## Parallel Example: User Story 1

```bash
# Write the US1 tests together (they must fail first):
Task: "week.ts unit tests in apps/frontend/src/week/week.spec.ts"          # T024
Task: "tasks.repository ownership tests in .../tasks.repository.spec.ts"    # T025
Task: "tasks.service create/list-week tests in .../tasks.service.spec.ts"   # T026
Task: "week-create Playwright spec in apps/frontend-e2e/src/week-create.e2e.ts" # T027

# Then the pure modules together:
Task: "Implement week.ts in apps/frontend/src/week/week.ts"                 # T028
Task: "Implement ordering.ts in apps/frontend/src/week/ordering.ts"         # T029
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1: Setup.
2. Phase 2: Foundational (CRITICAL — identity refactor + schemas + mounted tasks surface; blocks all stories).
3. Phase 3: User Story 1.
4. **STOP and VALIDATE**: view the current week and capture persisted, owner-scoped tasks; run US1 tests.
5. Deploy/demo the MVP.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → test → demo (MVP: view + create).
3. US2 → test → demo (drag to reschedule).
4. US3 → test → demo (reorder within a day).
5. US4 → test → demo (week navigation).
6. US5 → test → demo (edit/complete/reopen/delete).
7. Polish → rejection/failure e2e + quickstart + green CI.

---

## Notes

- [P] = different files, no dependencies on incomplete tasks.
- [Story] labels (US1–US5) map tasks to spec user stories for traceability.
- Tests are first-class here (FR-018 + Principle III): verify each test fails before implementing.
- Ownership is enforced only in `tasks.repository.ts` from the resolved `userId` — never from caller input (FR-014, SC-006).
- The single `PATCH /tasks/:id` serves edit, move, reorder, and complete/reopen (research §7); avoid adding per-interaction endpoints.
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.
