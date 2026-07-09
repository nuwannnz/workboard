# Frontend Contract: Projects UI (data, backlog, progress, optimistic save)

How the shared frontend consumes the Stage 4 backend and renders the Projects experience. It
mirrors the Stage 3 Week contract's conventions: typed clients over the Stage 2 `api-client`,
optimistic mutations with rollback, and shared-schema validation on every response. One codebase
serves PWA + Tauri (Principle II).

## Data clients (typed wrappers over `api-client`)

### `projects-client.ts` — `ProjectsClient`

Wraps `/projects`. Every non-2xx **rejects** so the hook can roll back and surface a failure
(FR-018). Responses parse with the shared `projectSchema`.

```text
listProjects(): Promise<Project[]>                         // GET /projects        → { projects }
createProject(input: CreateProjectInput): Promise<Project> // POST /projects       → 201 Project
updateProject(id, patch: UpdateProjectInput): Promise<Project> // PATCH /projects/:id → 200 Project
deleteProject(id): Promise<void>                           // DELETE /projects/:id → 204
```

### Backlog reuses `tasks-client.ts` (extended)

The backlog is tasks, so it reuses the Stage 3 `TasksClient` with two extensions:
```text
listByProject(projectId): Promise<Task[]>   // GET /tasks?projectId=<id> → { tasks }
create(input)                               // now accepts { title, projectId, dueDate? }
update(id, patch)                           // now accepts dueDate: string | null, projectId: string | null
```

## Hooks

### `use-projects.ts` — projects list state

- Loads `listProjects()` on mount; exposes `projects`, `loadStatus`, `error`, `reload`.
- **Optimistic** `createProject`, `editProject`, `deleteProject` with snapshot rollback on
  rejection (FR-018). `deleteProject` removes the card immediately; on failure it is reinstated
  and an error surfaced. (Cascade of the project's tasks is a backend concern — the UI just stops
  showing the project.)
- New projects appear appended (bottom of the card order); `order` is computed client-side with
  the shared `ordering` helpers, consistent with tasks.

### `use-project-tasks.ts` — one project's backlog state

- Loads `listByProject(projectId)`; exposes the backlog sorted by `order` then `id`.
- **Optimistic** task CRUD reusing the Stage 3 patterns (temp card on add, swap on success, remove
  on failure; snapshot rollback for edit/reorder/complete/delete). Mirrors `use-week-tasks` but
  scoped to a project and with an **optional due date**.
- `addBacklogTask(title)` → `create({ title, projectId })` (no `dueDate`).
- `scheduleTask(id, dueDate)` / `clearDueDate(id)` → `update(id, { dueDate })` / `update(id, { dueDate: null })`.
- Reorder within the backlog computes `between(prev, next)` via `ordering.ts`.

## Progress (pure, client-side)

`progress.ts` exports `progress(tasks: Task[]): { total, completed, ratio, percent }`:
- `total = tasks.length`, `completed = tasks.filter(t => t.status === 'completed').length`.
- `ratio = total === 0 ? 0 : completed / total`; `percent = Math.round(ratio * 100)`.
- Zero-safe: an empty backlog renders `0%` / "no tasks yet", never a division artifact (FR-010,
  edge case). Recomputed by the detail page from the current backlog on every change — no request.

## Screens & routing

| Route | Component | Purpose |
|-------|-----------|---------|
| `/projects` | `projects-page.tsx` | Cards grid of `project-card`; empty state + "New project" opening `create-project-dialog`. |
| `/projects/:id` | `project-detail-page.tsx` | Summary (name/description/color) + `progress-bar` + `project-backlog`. |

- `nav-items.ts`: the `projects` item gains `to: '/projects'` (it becomes an active sidebar link).
- `router.tsx`: both routes mount inside the protected `AppShell` `<Outlet/>` (like `/week`), so an
  unauthenticated visit is redirected to login (Stage 2). Unknown protected paths still fall back
  to `/week`.

### `create-project-dialog.tsx`

- Fields: **name** (required, inline "Name is required" on empty — FR-002), description
  (optional), **color** picker over `PROJECT_COLORS` swatches (defaulted).
- Reused for **edit** (prefilled) — Story 5.5; empty-name save is rejected inline with the prior
  value retained.

### `project-detail-page.tsx` + `project-backlog.tsx`

- Header shows name/description and the color; `progress-bar` renders `percent`.
- Backlog: inline add at the bottom (title only), `@dnd-kit` sortable reorder (reusing the Stage 3
  `task-card`), open a task in the **reused** `task-detail-dialog` to edit title/description/**due
  date (optional, clearable)**/priority/labels and complete/reopen/delete.
- **Delete project** control warns "This removes the project and its N tasks" before calling
  `deleteProject` (spec Story 5.4). On success it navigates back to `/projects`.

## Week board integration

- `use-week-tasks` additionally loads the projects list (once) and exposes a
  `projectId → { name, color }` map.
- `task-card` renders a small **project badge** (name + palette color) when the task has a
  `projectId`; standalone tasks render no badge (FR-012). A rename/recolor of the project updates
  the badge on next projects-list load without touching task records (FR-014, research §9).
- Dragging a scheduled project task across days behaves exactly as Stage 3 (updates `dueDate`);
  because it is the same record, the change is reflected in the backlog too (FR-013).

## Failure & optimistic-save rules (all mutations)

- Apply the change to local state immediately; on client rejection, **roll back to the pre-mutation
  snapshot** and surface a clear, user-facing error (FR-018). The UI never presents an unsaved
  change as saved.
- Blank-title / blank-name are rejected **before** any request (client-side), matching server
  validation (FR-002, FR-006).
- A `401` is handled by the `api-client`'s one-shot refresh (Stage 2); a persistent auth failure
  routes to login without silently losing or misattributing a change.
