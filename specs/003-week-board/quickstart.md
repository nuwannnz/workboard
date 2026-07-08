# Quickstart & Validation: Stage 3 — Week Board

A run/validation guide proving the Week board works end-to-end. Implementation details live
in [data-model.md](./data-model.md), [contracts/](./contracts/), and (Phase 2) `tasks.md`;
this file is how you *exercise* the feature.

## Prerequisites

- Stage 2 complete: a working authenticated app (register → verify → login) and the
  DynamoDB Local + cognito-local dev setup used there.
- Node 22 LTS; repo dependencies installed (`npm install` at the root); new Stage 3 deps
  present (`@dnd-kit/core`, `@dnd-kit/sortable`, `ulid`).
- Two test accounts (or the ability to register a second) to validate cross-user isolation.

## Run locally (Nx targets)

Use the same Nx targets as prior stages (run through Nx, not ad-hoc scripts — Principle V):

```bash
# Backend (Express) + local DynamoDB / Cognito emulator, as configured in Stage 2
npx nx serve backend

# Frontend (Vite PWA)
npx nx serve frontend
```

Log in, then open the **Week** area from the sidebar (`/week`).

## Validate the user stories

Each maps to spec acceptance scenarios and success criteria. Reload = browser refresh (PWA)
and, where noted, a desktop-app relaunch.

### Story 1 — Plan the week & capture tasks (P1)

1. Open Week → see **seven columns Monday→Sunday** with correct dates; **today** is
   distinguished. *(FR-001, SC-005)*
2. In a day's inline add control, type a title and confirm → card appears at the **bottom**
   of that day; its `dueDate` equals that day. *(FR-003, SC-001)*
3. Try an **empty/whitespace** title → creation rejected with a "title required" message; no
   card created. *(FR-004)*
4. **Reload** → tasks reappear under the matching day in saved order. *(FR-013, SC-002)*
5. Log in as a **second user** → you see none of the first user's tasks. *(FR-014, SC-006)*

### Story 2 — Reschedule by dragging to another day (P1)

1. Drag a card from Monday to Thursday → it now sits under Thursday and its `dueDate` is that
   Thursday. *(FR-005, FR-010, SC-003)*
2. **Reload** → still under Thursday with the new date. *(SC-002/SC-003)*
3. Start a drag and drop **outside any column** → card returns to its original day/order, no
   date change. *(Story 2.3)*

### Story 3 — Reorder within a day (P2)

1. With three cards in one day, drag the bottom one to the top → order reflows. *(FR-006)*
2. **Reload** → the manual order persists (not a default sort). *(SC-004)*
3. Add a new task → it appears at the **bottom** of the day. *(Story 3.3)*

### Story 4 — Navigate between weeks (P2)

1. From the current week, go **next week** → column dates advance 7 days; that week's tasks
   show. *(FR-007, SC-005)*
2. Use **current week / today** → returns to the week containing today, today distinguished,
   in a single action. *(SC-009)*
3. On a non-current week, add a task under a day → its `dueDate` is that **displayed day**,
   not today. *(FR-008)*
4. A week with no tasks → each day shows an empty state; inline add still available.
   *(Story 4.4)*

### Story 5 — Edit, complete, reopen, delete (P2)

1. Open a task, edit title/description/priority/labels, save → changes persist and show on
   the board. *(FR-009)*
2. Mark **complete** → card stays visible in a distinct completed state (not removed).
   *(FR-011, SC-008)*
3. **Reopen** → returns to open, stays in its day. *(FR-011)*
4. In the detail dialog, change **due date** to another day/week → card moves to the matching
   day. *(FR-010)*
5. **Delete** a task → removed from the board and, after reload, from persistence. *(FR-012)*
6. Edit a task's title to **empty** and save → rejected with "title required"; prior title
   retained. *(FR-004, Story 5.6)*

### Failure & edge behavior

- Simulate a save failure (e.g. stop the backend, then move a card) → the board shows a clear
  failure state and **rolls back**; it does not present the change as saved. *(FR-016)*
- Session expiry mid-action routes to `/login` with no change applied under the wrong
  account. *(spec Edge Case)*

## Automated tests (Principle III / FR-018)

```bash
# Unit/integration (week & ordering math, repository ownership, service, validation)
npx nx test shared
npx nx test backend
npx nx test frontend

# End-to-end core flow + rejections
npx nx e2e frontend-e2e
```

Expected priority coverage:

- **Vitest**: `identity.service` / `user.repository` (idempotent `sub → userId` bootstrap,
  cache hit avoids a second read, two subs get distinct `userId`s), `week.ts` (seven correct
  dates across week/month/year boundaries, Monday start), `ordering.ts` (append/between,
  repeated inserts), `tasks.repository` (ownership by resolved `userId` + cross-user
  **not-found**), `tasks.service` (create/list-week/move/reorder/complete/delete), task schema
  validation (empty-title rejection).
- **Playwright**: the core flow **view → create → move across days → reorder → complete/reopen
  → navigate weeks** (SC-007), plus **unauthenticated access is denied** and **one user
  cannot read/modify another's task** (SC-006).

## Definition of done for the stage

- All five stories validate by the steps above on the PWA (and the core flow on desktop).
- `GET/POST/PATCH/DELETE /tasks` behave per [contracts/tasks-api.md](./contracts/tasks-api.md);
  all are owner-scoped.
- Vitest + Playwright green in CI; no failing tests merged to `main` (Principle III).
- No `projectId`/`linkedNoteIds` are populated or surfaced (Principle VI); no new AWS infra
  was added (the Stage 2 protected proxy already covers `/tasks/*`).
- Feature data is owned by the app `userId` (UUID); the Cognito `sub` is stored only on the
  User record and used only to resolve identity — no Task item keys off `sub`. The
  User-identity refactor and `resolve-identity` middleware are covered by Vitest, and existing
  Stage 2 auth flows still pass.
