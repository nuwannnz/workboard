# Backend Contract: Projects REST API (+ Task API extensions)

Stage 4's backend surface. All routes are **protected**: API Gateway's Cognito authorizer
(Stage 2), then `authenticate` (attaches gateway-verified claims), then `resolve-identity`
(attaches `req.auth.userId` — the app owner). Controllers read **only** `req.auth.userId`, never
caller-supplied owner input (Principle IV, FR-016). All request/response bodies validate against
the shared Zod schemas in `libs/shared` so client and server agree exactly (Principle V).

Base path is served through the existing greedy protected proxy — **no new infra** (research §10).

## Uniform response conventions

| Situation | Status | Body |
|-----------|--------|------|
| Created | `201` | the created resource |
| OK (read/update) | `200` | the resource or `{ items }` envelope |
| Deleted | `204` | empty |
| Validation error | `400` | `{ error: 'ValidationError', details: ZodIssue[] }` |
| Not the owner's / missing | `404` | `{ error: 'NotFound' }` |
| Unauthenticated (no resolved user) | `401` | `{ error: 'unauthenticated' }` |
| Unexpected failure | `500` | `{ error: 'internal_error' }` |

A foreign or missing `projectId` returns **`404` with no disclosure** — identical to a genuinely
absent resource (FR-016, SC-006). No `PK`/`SK`/`userId`/`cognitoSub` ever appears in a response.

---

## Projects endpoints (new — `modules/projects/`)

### `GET /projects`

List the authenticated owner's projects.

- **Auth**: required.
- **Response `200`**: `{ projects: Project[] }` — every project in `PK = USER#<userId>`,
  `begins_with(SK, 'PROJECT#')`, in `order` then `id`.

### `POST /projects`

Create a project.

- **Body** (`createProjectSchema`): `{ name: string (non-empty, trimmed), description?: string,
  color?: ProjectColor }`.
- **Server assigns**: `id` (ULID), `order` (appended after existing project cards), `color`
  default when omitted, `createdAt`/`updatedAt`.
- **Response `201`**: the created `Project`.
- **`400`** if `name` is empty/whitespace or `color` is not a palette token.

### `PATCH /projects/:id`

Edit a project (name / description / color / card order).

- **Body** (`updateProjectSchema`, all optional): `{ name?, description?, color?, order? }`;
  `name` if present must be non-empty.
- **Behavior**: partial in-place update; bumps `updatedAt`. Rename/recolor is reflected wherever
  the project is shown, including its tasks' badge on the Week board (FR-014 — the Week board
  re-derives name/color from the projects list, so no task rewrite is needed).
- **Response `200`**: the updated `Project`. **`404`** if not the owner's. **`400`** on invalid body.

### `DELETE /projects/:id`

Delete a project **and cascade-delete all of its tasks** (FR-015, research §5).

- **Behavior**: the projects service resolves the project's task ids via the **tasks service**
  (`listByProject`) and deletes them (`deleteByProject`), then deletes the project record. The
  cascade is confined to the owner's partition. Idempotent under retry (deleting an already-gone id
  is a no-op).
- **Response `204`** on success. **`404`** if the project is not the owner's (no tasks are touched).
  **`500`** if the cascade fails to complete — the client surfaces a failure state (FR-018); a retry
  re-runs the cascade safely.

> **Confirmation is a client concern**: the API deletes unconditionally; the frontend shows the
> "this will remove the project and its N tasks" warning before calling `DELETE` (spec Story 5.4).

---

## Task API extensions (existing — `modules/tasks/`)

The Task endpoints are unchanged in shape; three capabilities are widened so the backlog is "just
tasks" (research §3). Ownership, keys, and the uniform responses above are identical to Stage 3.

### `POST /tasks` — optional due date + project binding

- **Body** (`createTaskSchema`, extended): `dueDate` is now **optional**; `projectId` is a new
  **optional** field.
  - Week inline-add: `{ title, dueDate }` (unchanged behavior).
  - Backlog inline-add: `{ title, projectId }` (no `dueDate` → backlog-only).
  - Scheduled project task: `{ title, dueDate, projectId }`.
- **Ordering**: `order` appended to the relevant grouping — the project's tasks when no `dueDate`,
  else the day's tasks (data-model "Create-ordering rule").
- **Response `201`**: the created `Task` (with `projectId` set, `dueDate` possibly `null`).

### `PATCH /tasks/:id` — clear due date / bind-unbind project

- **Body** (`updateTaskSchema`, extended): `dueDate` accepts a `YYYY-MM-DD` value **or `null`**
  (clearing → task returns to backlog-only, leaves the Week board — FR-013); `projectId` accepts a
  string **or `null`** (bind/unbind). All Stage 3 update behavior (edit, reschedule, reorder,
  complete/reopen) is unchanged.
- **Response `200`**: the updated `Task`. **`404`** if not the owner's.

### `GET /tasks?projectId=<id>` — project backlog read

- **Query**: when `projectId` is present, return **all** of the owner's tasks with that
  `projectId` (backlog + scheduled), regardless of `dueDate` — a single owner-partition `Query`
  with `FilterExpression: projectId = :projectId` (research §2).
- When `from`/`to` are present (and no `projectId`), behavior is the **Stage 3 week window**
  (unchanged). `projectId` and the `from`/`to` window are independent query modes.
- **Response `200`**: `{ tasks: Task[] }`.

> A scheduled project task (`projectId` + `dueDate`) is returned by **both** the week-window read
> and the `projectId` read — the same record surfaced twice, by design (FR-011).

---

## Ownership & isolation invariants (all endpoints)

- The persisted key is derived **solely** from `req.auth.userId`; caller input never contributes to
  `PK`. A cross-user read/write/delete cannot escape the caller's partition and returns `404`
  without disclosure (FR-016, SC-006).
- The projects→tasks cascade uses the tasks module's **public service API** only, never its
  repository/domain internals (Principle I).
- No `PK`/`SK`/`userId`/`cognitoSub` is ever serialized to the client.
