# Quickstart & Validation: Stage 4 — Projects

A run/validation guide proving Projects works end-to-end. Implementation details live in
[data-model.md](./data-model.md), [contracts/](./contracts/), and (Phase 2) `tasks.md`; this file
is how you *exercise* the feature.

## Prerequisites

- Stages 2 & 3 complete: a working authenticated app (register → verify → login) with the Week
  board, and the DynamoDB Local + cognito-local dev setup used there.
- Node 22 LTS; repo dependencies installed (`npm install` at the root). **No new dependency is
  required for Stage 4.**
- Two test accounts (or the ability to register a second) to validate cross-user isolation.

## Run locally (Nx targets)

Use the same Nx targets as prior stages (run through Nx, not ad-hoc scripts — Principle V):

```bash
# Backend (Express) + local DynamoDB / Cognito emulator, as configured in Stage 2
npx nx serve backend

# Frontend (Vite PWA)
npx nx serve frontend
```

Log in, then open the **Projects** area from the sidebar (`/projects`).

## Validate the user stories

### US1 — Create projects and see them as cards (P1)

1. With no projects, confirm `/projects` shows an empty state and a "New project" control.
2. Create a project with a **name**, description, and a palette **color**; confirm a card appears
   with that name/color/description and persists across a page reload.
3. Try to create with a blank/whitespace name → rejected inline ("Name is required"), no card
   created.
4. Reload → all your projects reappear. Log in as a **second** account → its Projects view shows
   **none** of the first account's projects (SC-006).

### US2 — Open a project and manage its backlog (P1)

1. Open a project card → detail view shows name/description/color and an (empty) backlog.
2. Add a backlog task by title → it appears in the backlog and persists on reload; it has **no due
   date** (backlog-only).
3. Open the task → edit title/description/priority/labels → save → changes persist.
4. Complete the task → it stays visible in the backlog in a distinct completed style; reopen it.
5. Delete the task → it disappears and is gone on reload.
6. Blank title on add or on save → rejected inline, nothing created/corrupted.

### US3 — Track project progress (P2)

1. In a project with several tasks, complete some → the **progress bar / percent** updates to
   completed ÷ total without a manual refresh.
2. Reopen a task or add a new one → progress recomputes accordingly.
3. A project with **zero tasks** shows a defined 0% / "no tasks yet" state (no error).

### US4 — Schedule a project task onto the Week board (P2)

1. On a backlog task, set a **due date** → it now also appears on the **Week board** under that day
   showing the project's **name and color** badge, and remains in the backlog.
2. Open the Week board (`/week`), confirm the project task shows there with its badge; a standalone
   Week task shows **no** badge.
3. Drag the scheduled project task to another day → its due date updates (Stage 3 behavior) and the
   change is reflected back in the project.
4. Clear the due date → it leaves the Week board and remains a backlog task.

### US5 — Reorder backlog, edit & delete a project (P3)

1. With several backlog tasks, drag one to a new position → the order persists across reload
   (SC-005).
2. Edit the project's name/description/color → changes persist on the card and detail; the
   updated name/color propagates to that project's tasks' badges on the Week board (FR-014).
3. Delete the project → confirm the **warning** names the task count; on confirm, the project **and
   all its tasks** are removed from both the Projects and Week views (SC-007). Reload → gone.
4. Edit that removes the project name (empty) → rejected inline, prior value retained.

## Automated checks (must pass before merge — Principle III)

```bash
# Unit / integration (Vitest) across affected projects
npx nx run-many -t test -p shared backend frontend

# End-to-end (Playwright): projects core flow + unauthenticated + cross-user denial
npx nx e2e frontend-e2e
```

Expected coverage (see `tasks.md` once generated):

- **Shared**: `project` schema + `PROJECT_COLORS` enum; extended `task` create (optional
  `dueDate`, `projectId`) and update (`dueDate: null`, `projectId: null`).
- **Backend**: projects repository ownership + not-found; projects service create/edit/delete
  **with task cascade**; extended tasks service create-ordering (backlog vs day) + `listByProject`
  + `deleteByProject`; tasks repository `queryByProject`.
- **Frontend**: pure `progress()` (incl. zero state); `use-projects` and `use-project-tasks`
  optimistic + rollback; Week `task-card` project badge.
- **E2E**: create project → backlog add/complete → progress updates → schedule onto Week (badge
  visible) → reorder backlog → edit → delete-cascade; plus unauthenticated redirect and one
  account being unable to read/modify another's project or task (SC-006).

## Isolation smoke check (manual)

While logged in as account A, note a project's id from the network tab; log in as account B and
issue `GET /projects/<A's id>`-derived reads (e.g., `GET /tasks?projectId=<A's id>`) → expect an
empty/`404` result with **no** disclosure of A's data (FR-016, SC-006).
