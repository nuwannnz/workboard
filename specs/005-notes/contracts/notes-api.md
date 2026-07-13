# Backend Contract: Notes REST API

Stage 5's backend surface. All routes are **protected**: API Gateway's Cognito authorizer
(Stage 2), then `authenticate` (attaches gateway-verified claims), then `resolve-identity`
(attaches `req.auth.userId` — the app owner). Controllers read **only** `req.auth.userId`, never
caller-supplied owner input (Principle IV, FR-018). All request/response bodies validate against
the shared Zod schemas in `libs/shared` so client and server agree exactly (Principle V).

Base path is served through the existing greedy protected proxy — **no new infra** (research §1).

## Uniform response conventions

| Situation | Status | Body |
|-----------|--------|------|
| Created | `201` | the created `Note` |
| OK (read/update) | `200` | the resource or `{ notes }` envelope |
| Deleted | `204` | empty |
| Validation error | `400` | `{ error: 'ValidationError', details: ZodIssue[] }` |
| Link target not the owner's | `400` | `{ error: 'InvalidLinkTarget', details: string[] }` (offending ids) |
| Not the owner's / missing | `404` | `{ error: 'NotFound' }` |
| Unauthenticated (no resolved user) | `401` | `{ error: 'unauthenticated' }` |
| Unexpected failure | `500` | `{ error: 'internal_error' }` |

A foreign or missing `noteId` returns **`404` with no disclosure** — identical to a genuinely
absent resource (FR-018, SC-007). No `PK`/`SK`/`userId`/`cognitoSub` ever appears in a response.

---

## Notes endpoints (new — `modules/notes/`)

### `GET /notes`

List the authenticated owner's notes (master list), **or** run a reverse linked-notes lookup.

- **Auth**: required.
- **Query (mutually exclusive modes)**:
  - *(none)* → **all** the owner's notes (`PK = USER#<userId>`, `begins_with(SK, 'NOTE#')`),
    sorted by `updatedAt` descending (most-recent first), `id` as a stable tiebreak.
  - `?linkedProjectId=<id>` → the owner's notes whose `linkedProjectIds` **contains** `<id>` —
    the reverse lookup for a project's "Linked notes" section (FR-011). One partition `Query` +
    `contains` filter, **no GSI** (research §2).
  - `?linkedTaskId=<id>` → the owner's notes whose `linkedTaskIds` **contains** `<id>` — the
    reverse lookup for a task's "Linked notes" section (FR-011).
- **Response `200`**: `{ notes: Note[] }`.

> The reverse modes are **owner-partition-scoped**, so they can only ever return the caller's own
> notes; a foreign `linkedProjectId`/`linkedTaskId` simply matches nothing (no disclosure).

### `POST /notes`

Create a note — may be **empty** (auto-save-first flow, FR-002/FR-008).

- **Body** (`createNoteSchema`): `{ title?: string, markdown?: string }` — both optional.
- **Server assigns**: `id` (ULID), `createdAt`/`updatedAt`; defaults `title`/`markdown` to `''` and
  `linkedProjectIds`/`linkedTaskIds` to `[]`.
- **Response `201`**: the created `Note` (empty title/content allowed).

### `PATCH /notes/:id`

Partial in-place update serving three callers (research §5) — all fields optional
(`updateNoteSchema`):

- **Content auto-save** → `{ title?, markdown? }`. `title` **may be empty**. **No link validation
  or cross-module read** on this path — the hot auto-save path is a single `Update` (research §5,
  §6). Bumps `updatedAt`.
- **Rename** → `{ title }` (empty allowed).
- **Link add/remove** → `{ linkedProjectIds? }` and/or `{ linkedTaskIds? }` — the service
  **de-duplicates** the arrays and validates **every** referenced id belongs to the caller's own
  projects/tasks via the **projects/tasks public service APIs** (research §5). A link to an id the
  user does not own (or that does not exist) → **`400 InvalidLinkTarget`** listing the offending
  ids (FR-009/FR-010/FR-018, SC-007, US3.1); no partial link set is persisted.
- **Response `200`**: the updated `Note`. **`404`** if not the owner's. **`400`** on invalid body or
  invalid link target.

### `DELETE /notes/:id`

Delete a note. Its links vanish with it — nothing else stores them (FR-017), so **no cascade write**
to projects/tasks is needed.

- **Response `204`** on success. **`404`** if the note is not the owner's. **`500`** on unexpected
  failure — the client surfaces a failure state (FR-006/FR-018) and may retry safely (idempotent).

> **Confirmation is a client concern**: the API deletes unconditionally; the frontend shows the
> "this note will be removed" warning before calling `DELETE` (spec Story 5.3).

---

## Notes on links (all endpoints)

- **Single source of truth**: a link lives **only** in the note's `linkedProjectIds` /
  `linkedTaskIds` (research §2). There is no link field on the Task or Project and no separate link
  item, so the two sides can never diverge (FR-013).
- **Reverse view** (a project/task's "Linked notes") is always the `GET /notes?linkedProjectId=` /
  `?linkedTaskId=` read — never a field on the work item.
- **Stale links** (a linked project/task later deleted) are **not** cleaned by this API on the
  work-item side; they are **resolved away at display time** by the client and may be lazily pruned
  on the note's next save (research §4, FR-014). Loading a note never fails on a stale id.

## Ownership & isolation invariants (all endpoints)

- The persisted key is derived **solely** from `req.auth.userId`; caller input never contributes to
  `PK`. A cross-user read/write/delete cannot escape the caller's partition and returns `404`
  without disclosure (FR-018, SC-007).
- Link-target validation uses the projects/tasks modules' **public service APIs** only, never their
  repository/domain internals (Principle I), and runs **only** when link arrays are in the body.
- No `PK`/`SK`/`userId`/`cognitoSub` is ever serialized to the client.
