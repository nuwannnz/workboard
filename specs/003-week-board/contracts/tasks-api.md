# Contract: Tasks REST API (backend)

Backend surface for the Week board's Task entity. **All routes are protected** — they sit
behind the Stage 2 API Gateway Cognito authorizer (greedy `ANY /{proxy+}`), the Express
`authenticate` middleware (exposes the gateway-verified `sub`/`email`), and the
`resolve-identity` middleware, which maps that `sub` to the app **`userId`** (UUID) and
attaches `req.auth = { sub, email, userId }`. Controllers read only `userId`. There is no
public tasks route.

Base path: `/tasks`. All responses are JSON. All access is scoped to the authenticated owner
(`PK = USER#<userId>`, where `userId` is resolved from the `sub` server-side — the `sub` is
never an owner key); a task belonging to another user is indistinguishable from a nonexistent
one (`404`), disclosing nothing (FR-014, SC-006).

Shared validation: request bodies are validated with `createTaskSchema` / `updateTaskSchema`
from `@workboard/shared` (same schemas the client uses).

## Common types

`Task` (response shape — from `@workboard/shared`):

```json
{
  "id": "01J8Z...",
  "title": "Draft the release notes",
  "description": "cover the Week board",
  "dueDate": "2026-07-08",
  "status": "open",
  "priority": "medium",
  "labels": ["release"],
  "order": "a3",
  "projectId": null,
  "linkedNoteIds": [],
  "createdAt": "2026-07-08T09:12:04.000Z",
  "updatedAt": "2026-07-08T09:12:04.000Z"
}
```

`ownerId` / `PK` / `SK` are **never** included in responses.

## Errors (uniform)

| Status | When |
|--------|------|
| `400 Bad Request` | Body fails schema validation (e.g. empty title, malformed `dueDate`). Body: `{ "error": "ValidationError", "details": [...] }`. |
| `401 Unauthorized` | Missing/invalid/expired token — rejected at the gateway (or the local-dev verifier) before the controller. |
| `404 Not Found` | `PATCH`/`DELETE`/`GET` of an id not in the caller's partition (own missing item **or** another user's item — same response). |
| `500 Internal Server Error` | Unexpected persistence/backend failure. Client surfaces a failure state and must not present the change as saved (FR-016). |

---

## GET /tasks

List the authenticated owner's tasks whose `dueDate` falls in a window (the displayed week).

**Query params**

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `from` | `YYYY-MM-DD` | recommended | Inclusive lower bound (week's Monday). |
| `to` | `YYYY-MM-DD` | recommended | Inclusive upper bound (week's Sunday). |

If `from`/`to` are omitted the server MAY return all of the owner's tasks; the frontend always
sends the current week window. Tasks with `dueDate === null` are excluded from windowed
results (none are created this stage).

**200 Response**

```json
{ "tasks": [ Task, Task, ... ] }
```

Order is unspecified across days; the client groups by `dueDate` and sorts each day by
`order` then `id`. (Server MAY pre-sort by `order`.)

**Behavior**: single DynamoDB `Query` on `PK = USER#<userId>`, `begins_with(SK, 'TASK#')`,
filtered to `[from, to]` (research §1).

---

## POST /tasks

Create a task under a specific day. Used by the inline add control.

**Request body** (`createTaskSchema`)

```json
{
  "title": "Draft the release notes",
  "dueDate": "2026-07-08",
  "description": "optional",
  "priority": "medium",
  "labels": ["release"]
}
```

- `title` **required**, non-empty/non-whitespace → else `400` (FR-004).
- `dueDate` **required**, `YYYY-MM-DD` (the day the control belongs to; on a non-current week
  it is that displayed day, not today — FR-008).
- `priority` optional → defaults `medium`. `description`/`labels` optional.

**201 Response**: the created `Task`. Server assigns `id` (ULID), `status='open'`,
`order` = a rank appended after the last task in that day (research §4),
`createdAt`/`updatedAt`, `projectId=null`, `linkedNoteIds=[]`.

---

## PATCH /tasks/:id

Partial update. **One endpoint serves edit, reschedule (move), reorder, and complete/reopen.**

**Request body** (`updateTaskSchema`, all optional; at least one field)

```json
{ "title": "...", "description": "...", "dueDate": "2026-07-10",
  "priority": "high", "labels": ["x"], "status": "completed", "order": "a3m" }
```

| Interaction | Fields sent |
|-------------|-------------|
| Edit details | any of `title`, `description`, `priority`, `labels` |
| Reschedule via detail dialog | `dueDate` |
| Move across days (drag) | `dueDate` (+ `order` for the drop position) |
| Reorder within a day (drag) | `order` |
| Complete / reopen | `status` |

- If `title` is present it must be non-empty → else `400`, and the prior value is retained
  (FR-004, Story 5.6).
- Changing `dueDate` repositions the task to the matching day (FR-010). Server bumps
  `updatedAt`. Last-write-wins (no version check) per spec.

**200 Response**: the full updated `Task`. **404** if the id is not in the caller's partition.

---

## DELETE /tasks/:id

Remove a task from the board and persistence (FR-012).

**204 Response**: no body. **404** if the id is not in the caller's partition. Idempotent
from the user's view — a second delete of the same id returns `404`.

---

## Endpoint → requirement / story map

| Endpoint | Requirements | Stories |
|----------|--------------|---------|
| `GET /tasks` | FR-002, FR-013, FR-014 | 1, 4 |
| `POST /tasks` | FR-003, FR-004, FR-008, FR-015 | 1, 4 |
| `PATCH /tasks/:id` | FR-005, FR-006, FR-009, FR-010, FR-011 | 2, 3, 5 |
| `DELETE /tasks/:id` | FR-012 | 5 |
| all | FR-014, FR-016, FR-018 | all |
