# Contract: Week client — data, drag-and-drop & optimistic save (frontend)

Defines how the shared frontend `week/` feature area consumes the Tasks API, computes the
week, drives drag-and-drop, and keeps the board consistent with persisted state. Runs
identically on the PWA and Tauri desktop (Principle II). All network calls go through the
existing Stage 2 `api-client` (attaches the Cognito id token; handles `401` refresh →
`/login`).

## Routing & placement

- The Week board is the protected landing surface. `router.tsx` renders it at `/` and
  `/week` **inside** the existing `RequireAuth` → `AppShell` (so unauthenticated users are
  redirected to `/login`, per Stage 2). The sidebar "Week" nav item navigates to `/week`.
- Session expiry mid-use is handled by `api-client` (refresh once, else redirect to
  `/login`); no task change is applied under the wrong account (spec Edge Case).

## `tasks-client.ts` — typed API wrapper

Thin typed methods over `api-client.request`, parsing responses with the shared schemas:

| Method | Call | Returns |
|--------|------|---------|
| `listWeek(from, to)` | `GET /tasks?from&to` | `Task[]` |
| `create(input)` | `POST /tasks` (`createTaskSchema`) | `Task` |
| `update(id, patch)` | `PATCH /tasks/:id` (`updateTaskSchema`) | `Task` |
| `remove(id)` | `DELETE /tasks/:id` | `void` |

A non-2xx (other than the `401` the api-client already handles) rejects so the hook can roll
back and surface a failure (FR-016).

## `week.ts` — pure week/date math (unit-tested)

| Function | Contract |
|----------|----------|
| `todayDate()` | today's `YYYY-MM-DD` in the app's single reference. |
| `startOfWeek(date)` | Monday (`YYYY-MM-DD`) of the week containing `date`. |
| `weekDays(monday)` | seven `YYYY-MM-DD` Monday→Sunday. |
| `addWeeks(monday, n)` | Monday ± `n` weeks. |
| `isToday(date)` | `date === todayDate()`. |

Correct across week/month/year boundaries (SC-005). Monday-start (spec).

## `ordering.ts` — fractional index (unit-tested)

| Function | Contract |
|----------|----------|
| `append(lastOrderInDay?)` | rank sorting **after** the last card (empty day → a base rank). |
| `between(prevOrder?, nextOrder?)` | rank strictly between two neighbors (either side may be undefined at an edge). |

Ranks are strings sorting lexicographically; ties break by `id` (research §4). Repeated
inserts between the same pair keep producing valid ranks (no precision collapse).

## `use-week-tasks.ts` — data hook & optimistic mutations

State: `referenceMonday`, the week's `Task[]`, load status, and per-op error. Derives
`days` and groups tasks by `dueDate`, each day sorted by `order` then `id`.

**Load**: on mount and whenever `referenceMonday` changes → `listWeek(from, to)`. Navigation
(`prev`/`next`/`today`) sets `referenceMonday` and triggers a reload (FR-007). Creating on a
non-current week defaults `dueDate` to the target displayed day, not today (FR-008).

**Mutations are optimistic with rollback** (research §8, FR-016):

| Action | Optimistic effect | Server call | On failure |
|--------|-------------------|-------------|------------|
| `addTask(day, title)` | append a temp card to `day` (blank title rejected client-side, FR-004) | `create({ title, dueDate: day })` → replace temp with returned `Task` | remove temp card, show error |
| `moveTask(id, toDay, index)` | move card to `toDay` at `index`, set new `dueDate` + `order` | `update(id, { dueDate: toDay, order })` | restore prior day/order, show error |
| `reorderTask(id, index)` | reorder within its day, set new `order` | `update(id, { order })` | restore prior order, show error |
| `editTask(id, patch)` | apply field changes | `update(id, patch)` | revert fields, keep dialog open with error (title-required retains prior value, FR-004/Story 5.6) |
| `toggleComplete(id)` | flip `status`, keep card visible in completed style | `update(id, { status })` | revert status, show error |
| `deleteTask(id)` | remove card | `remove(id)` | reinstate card, show error |

An invalid/cancelled drag (dropped outside any column, or back in place) results in **no
mutation and no server call** (spec Edge Case, Story 2.3).

## `@dnd-kit` wiring (`week-board.tsx` / `day-column.tsx` / `task-card.tsx`)

- One `DndContext` around the board with pointer + keyboard sensors (a11y, FR-017).
- Each `day-column` is a droppable wrapping a `SortableContext` of its `task-card`s.
- On drag end: determine target day + neighbor cards → compute `order` via `ordering.ts` →
  if the day changed call `moveTask` (sets `dueDate` + `order`), else `reorderTask`.
- Newly added tasks land at the **bottom** of the day (`append`) (Story 1/3).

## Presentation requirements

- Seven columns Monday→Sunday, each labeled weekday + calendar date; today's column visually
  distinguished on the current week (FR-001).
- Completed cards remain visible in a distinct (e.g. muted/strikethrough) state — never
  hidden (FR-011, SC-008).
- Empty day → empty state + inline add still available (Story 4.4).
- Long titles wrap/truncate without breaking column layout; a full day scrolls within its
  column (spec Edge Cases, FR-017).
- Board reflows responsively on smaller viewports; built from shadcn/ui (FR-017).

## Requirement / story coverage

| Area | Requirements | Stories |
|------|--------------|---------|
| Routing/auth gate | FR-014, FR-017 | 1, all |
| Week math & nav | FR-001, FR-007, FR-008 | 1, 4 |
| Inline create | FR-003, FR-004 | 1 |
| DnD move (reschedule) | FR-005, FR-010 | 2 |
| DnD reorder | FR-006 | 3 |
| Detail edit / complete / delete | FR-009, FR-010, FR-011, FR-012 | 5 |
| Optimistic save + failure states | FR-013, FR-016 | all |
