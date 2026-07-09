# Phase 1 Data Model: Stage 4 — Projects

Derives from the spec's Key Entities and the Phase 0 research. This stage introduces the
**Project** entity and **activates the Task↔Project relationship** that Stage 3 reserved. The
Task shape is unchanged; only its create/update **request** rules and its usage widen (optional
`dueDate`, settable `projectId`). **Project progress** is a derived, non-persisted construct.

## Entity: Project

A named, color-coded grouping of tasks, owned by exactly one Account (the authenticated user).
Introduced this stage.

### Domain shape (`libs/shared/src/schemas/project.ts`)

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `id` | `string` (ULID) | yes | server-generated | Never client-supplied (research §8). |
| `name` | `string` | yes | — | Must be non-empty / non-whitespace (FR-002). |
| `description` | `string` | no | — | Free text. |
| `color` | `ProjectColor` (palette token) | yes | `'slate'` (or first palette token) | One of `PROJECT_COLORS`; always valid (research §7, FR-001). |
| `order` | `string` | yes | server-computed | Fractional-index rank for arranging project cards (reuses `ordering`). |
| `createdAt` | `string` (ISO 8601) | yes | server-set | Audit + stable secondary sort. |
| `updatedAt` | `string` (ISO 8601) | yes | server-set | Bumped on every mutation. |

Owner is **not** a domain field — ownership is carried by the persisted key and derived from the
app `userId` resolved from the authenticated `sub`, never returned to or accepted from the client
(Principle IV, FR-016).

### Color palette (`libs/shared/src/schemas/project.ts`)

```text
PROJECT_COLORS = ['slate', 'red', 'amber', 'green', 'teal', 'blue', 'violet', 'pink']
```

A fixed, curated set of tokens (research §7). The shared schema validates `color` as
`z.enum(PROJECT_COLORS)`; the frontend maps each token to concrete shared design-system classes
for the card, detail header, and Week badge. The exact token list may be tuned at implementation
time but MUST stay a closed enum validated identically on both sides (Principle V).

### Persisted single-table item (`projects.repository.ts`)

| Attribute | Value | Notes |
|-----------|-------|-------|
| `PK` | `USER#<userId>` | Partition = owner; `userId` is the app User UUID resolved from the gateway-verified `sub` — never caller input. |
| `SK` | `PROJECT#<id>` | `id` = ULID. |
| `name`, `description`, `color`, `order`, `createdAt`, `updatedAt` | as above | Plain attributes; `name`/`description`/`color`/`order` mutable in place. |

The key is built **only** from the resolved `userId`, so a read/write can only reach the owner's
partition and a foreign `id` resolves as not-found — no disclosure (FR-016, SC-006). `PK`/`SK`
are never returned to callers. The user's projects are listed with one `Query`
(`PK = USER#<userId>`, `begins_with(SK, 'PROJECT#')`).

### Request schemas (shared, used by controller + client)

- **`createProjectSchema`**: `{ name: non-empty string, description?: string, color?: ProjectColor }`.
  Server assigns `id`, `order` (append), `createdAt`/`updatedAt`, and defaults `color` when omitted.
- **`updateProjectSchema`**: all of `{ name?, description?, color?, order? }` optional; if `name`
  is present it must be non-empty (FR-002, Story 5.5). Serves edit + card reorder.

### Validation rules

- `name` required and non-empty/non-whitespace on create and on update-if-present (FR-002).
- `color` ∈ `PROJECT_COLORS` (closed enum); defaulted when absent so it is always valid.
- `order` is an opaque non-empty rank string; server computes on create, validates presence on reorder.

### State transitions

```text
        create (name, color?)
               │
               ▼
          ┌─────────┐   edit (name/description/color)   ┌─────────┐
          │ project │ ───────────────────────────────▶ │ project │  (persisted, rename/recolor
          │         │ ◀─────────────────────────────── │         │   propagates to Week badge — FR-014)
          └─────────┘                                   └─────────┘
               │
               └──── delete ────▶ project removed AND all its tasks cascade-deleted (FR-015, research §5)
```

## Entity: Task (relationship activated — shape unchanged)

The same Task entity from Stage 3 (`libs/shared/src/schemas/task.ts`). The **persisted shape does
not change** — `projectId` and `linkedNoteIds` already exist. What changes this stage is **usage
and request validation**:

| Field | Stage 3 usage | Stage 4 usage |
|-------|---------------|---------------|
| `dueDate` (`string \| null`) | Always set (day created under); required on `POST /tasks`. | **Optional on create.** `null` → backlog-only; a `YYYY-MM-DD` value → also on the Week board under that day (FR-011). Clearable via update to move a scheduled task back to backlog (FR-013). |
| `projectId` (`string \| null`) | Always `null` (deferred). | **Settable** on create/update to bind a task to at most one project; clearable to `null`. A project backlog task carries the owning `projectId`. |
| `linkedNoteIds` (`string[]`) | Always `[]` (deferred). | **Unchanged** — still `[]`, deferred to Stage 5 (Principle VI). |
| `order` | Rank within its day. | Rank within its grouping — day column and/or project backlog share the one field (research §6). |

### Request-schema changes (`libs/shared/src/schemas/task.ts`)

- **`createTaskSchema`** — `dueDate` becomes **optional** (still `YYYY-MM-DD` when present via
  `dueDateSchema`); add optional `projectId: string`. A Week inline-add still supplies `dueDate`;
  a backlog inline-add supplies `projectId` and omits `dueDate`.
- **`updateTaskSchema`** — allow `dueDate` to be **`YYYY-MM-DD` or `null`** (clearing → backlog);
  add optional `projectId: string | null` (bind/unbind). `title` if present stays non-empty.
  All other fields unchanged from Stage 3.

### Ownership & keys (unchanged)

`PK = USER#<userId>`, `SK = TASK#<id>`, key built solely from the resolved `userId` (FR-016,
SC-006). The project-scoped read adds a `FilterExpression: projectId = :projectId` over the owner
partition (research §2); the cascade delete removes the same filtered set (research §5).

### Create-ordering rule (extended `tasks.service`)

On create, `order` is appended to the **relevant grouping**:
- `dueDate` present, no `projectId` (Week task) → append after that **day's** tasks (Stage 3 rule).
- `projectId` present, no `dueDate` (backlog task) → append after that **project's** tasks.
- both present (scheduled project task) → append after that **day's** tasks (its day is where a
  fresh rank matters for the board; the backlog sorts by the same field). Accepted MVP
  simplification (research §6).

## Entity: Project progress (derived construct — not persisted)

A computed value equal to the proportion of a project's tasks that are completed. Rendered as the
progress bar + completion indicator on the project detail page; recomputed from current task
state, never stored (spec Key Entities, research §4).

| Concept | Definition |
|---------|------------|
| `total` | Count of the project's tasks (backlog + scheduled). |
| `completed` | Count of those with `status === 'completed'`. |
| `ratio` | `total === 0 ? 0 : completed / total` (zero-safe — FR-010, edge case). |
| `percent` | `Math.round(ratio * 100)` for display. |

Pure helper `progress(tasks): { total, completed, ratio, percent }` in
`apps/frontend/src/projects/progress.ts`; unit-tested independently of React (Principle III).

## Relationships

- **User → Project** (1-to-many): a Project is owned by exactly one User, expressed by the shared
  partition `PK = USER#<userId>`. All of a user's Projects live in their partition. The owning key
  is the app `userId` (UUID), never the Cognito `sub`.
- **Project → Task** (1-to-many, optional): a Task references **at most one** Project via
  `projectId`. A Project's tasks are all owner-partition tasks with that `projectId` (research §2).
  A Task with no `projectId` is a standalone Week task (Stage 3). Deleting a Project cascades to
  delete its Tasks (research §5).
- **Task → Week day** (unchanged): a Task with a `dueDate` appears under that day; a project task
  with a `dueDate` appears on the Week board **and** in the backlog — one record, two reads.
- **Task → Note** (future): `linkedNoteIds` stays present but unpopulated (Stage 5).

## Relationship to deferred stages

`linkedNoteIds` (Stage 5) remains in the Task shape, never populated or surfaced this stage.
Because all feature data keys off the stable app `userId` and the Task shape already carries every
relationship field, adding Notes later needs **no reshaping or migration** of Stage 3/4 data —
the same forward-compatibility the Stage 3 model established.
