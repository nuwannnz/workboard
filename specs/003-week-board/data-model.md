# Phase 1 Data Model: Stage 3 — Week Board

Derives from the spec's Key Entities and the research decisions. This stage introduces the
**Task** entity as the product's first persisted feature data and promotes **User** to an
app-level identity (a UUID) that owns all feature data. **Week** and **Label** are
non-persisted / lightweight and documented for completeness.

## Entity: User (app-level identity)

The account that owns all feature data. This stage promotes the User to an **app-generated
UUID (`id`)** that is independent of the identity provider; the Cognito `sub` is recorded as
an **authentication-only** attribute (research §11). Refactors the Stage 2 profile that was
keyed directly on `sub`.

### Domain shape (`libs/shared/src/schemas/user.ts`)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | `string` (UUID v4) | yes | App-generated. **Canonical owner key** for Tasks (and future Projects/Notes). Client-visible via `/me`. |
| `email` | `string` (email) | yes | From the verified Cognito claims at bootstrap. |
| `createdAt` | `string` (ISO 8601) | yes | Set when the User is bootstrapped. |

`cognitoSub` is **server-only** — it is stored on the persisted record but is used solely to
resolve the caller to their `userId` (authentication). It is never returned to the client and
never used as a foreign key on feature data (user requirement, FR-014).

### Persisted single-table items

| Item | `PK` | `SK` | Attributes |
|------|------|------|------------|
| User profile | `USER#<userId>` | `PROFILE` | `id` (=userId), `cognitoSub`, `email`, `createdAt` |
| Auth pointer | `AUTH#<sub>` | `AUTH#<sub>` | `userId`, `createdAt` |

The **auth pointer** resolves `sub → userId` in one strongly-consistent `GetItem`; no GSI
(research §11–§12).

### Bootstrap & resolution

- **Get-or-bootstrap** (first authenticated request for a `sub`): if no `AUTH#<sub>` pointer
  exists, generate `userId = uuidv4()` and write the pointer + profile in one
  `TransactWriteCommand`, each guarded by `attribute_not_exists(PK)` (idempotent under a
  cold-start race — exactly one `userId` binds to a `sub`).
- **Resolution**: the `resolve-identity` middleware maps `sub → userId` (cached in-Lambda,
  immutable mapping) and attaches `req.auth = { sub, email, userId }` before any feature
  controller runs.

## Entity: Task

A unit of work owned by exactly one Account (the authenticated user). Introduced this stage.

### Domain shape (`libs/shared/src/schemas/task.ts`)

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `id` | `string` (ULID) | yes | server-generated | Never client-supplied (research §2). |
| `title` | `string` | yes | — | Must be non-empty / non-whitespace (FR-004). |
| `description` | `string` | no | — | Free text. |
| `dueDate` | `string \| null` | yes for Week tasks | day created under | Date-only `YYYY-MM-DD`; determines the day column (research §5, FR-010). Nullable in the shape to accommodate future backlog tasks, but always set when created via the Week board. |
| `status` | `'open' \| 'completed'` | yes | `'open'` | Completed tasks stay visible (FR-011). |
| `priority` | `'low' \| 'medium' \| 'high'` | yes | `'medium'` | Sensible default (FR-015). |
| `labels` | `string[]` | yes | `[]` | Simple user tags this stage (spec Assumptions). |
| `order` | `string` | yes | server-computed | Fractional-index rank within the day (research §4). |
| `projectId` | `string \| null` | yes | `null` | **Deferred** (Stage 4). Present, never set this stage. |
| `linkedNoteIds` | `string[]` | yes | `[]` | **Deferred** (Stage 5). Present, never set this stage. |
| `createdAt` | `string` (ISO 8601) | yes | server-set | Audit + stable secondary sort. |
| `updatedAt` | `string` (ISO 8601) | yes | server-set | Bumped on every mutation. |

Owner is **not** a domain field — ownership is carried by the persisted key and derived from
the app `userId` resolved from the authenticated `sub` (research §11–§12), never returned to
or accepted from the client (Principle IV).

### Persisted single-table item (`tasks.repository.ts`)

| Attribute | Value | Notes |
|-----------|-------|-------|
| `PK` | `USER#<userId>` | Partition = owner; `userId` is the app User UUID resolved from the gateway-verified `sub` — **not** the `sub` itself. |
| `SK` | `TASK#<id>` | `id` = ULID. Stable — unchanged by reschedule/reorder. |
| `title`, `description`, `dueDate`, `status`, `priority`, `labels`, `order`, `projectId`, `linkedNoteIds`, `createdAt`, `updatedAt` | as above | Plain attributes; `dueDate`/`order` are mutable in place. |

The key is built **only** from the resolved `userId` (never caller input), so a read/write
can only reach the owner's partition and a foreign `id` resolves as not-found — no disclosure
(FR-014, SC-006).

### Request schemas (shared, used by controller + client)

- **`createTaskSchema`**: `{ title: non-empty string, dueDate: YYYY-MM-DD, description?: string,
  priority?: enum, labels?: string[] }`. Server assigns `id`, `order` (append to day),
  `status='open'`, `createdAt`/`updatedAt`, and defaults `priority='medium'`.
- **`updateTaskSchema`**: all of `{ title?, description?, dueDate?, priority?, labels?,
  status?, order? }` optional; if `title` is present it must be non-empty (FR-004). Used for
  edit, reschedule (`dueDate`), move/reorder (`dueDate?` + `order`), and complete/reopen
  (`status`).

### Validation rules

- Title required and non-empty/non-whitespace on create and on update-if-present (FR-004).
- `dueDate` matches `^\d{4}-\d{2}-\d{2}$` and is a real calendar date.
- `status` ∈ {open, completed}; `priority` ∈ {low, medium, high}.
- `order` is an opaque non-empty rank string; the server computes it on create and validates
  presence on reorder.

### State transitions

```text
          create (title, dueDate)
                 │
                 ▼
             ┌────────┐   complete    ┌───────────┐
             │  open  │ ────────────▶ │ completed │
             │        │ ◀──────────── │           │
             └────────┘    reopen     └───────────┘
                 │                          │
                 └──────── delete ──────────┘  → removed from board + persistence

  reschedule (dueDate change): moves the task to the day column matching the new date,
                               in any state (FR-010) — via drag-and-drop or the detail dialog.
  reorder (order change):      repositions within the day (FR-006), in any state.
```

## Entity: Week (view construct — not persisted)

A derived seven-day span (Monday→Sunday) computed from a reference date; used to group Tasks
by `dueDate` and to drive prev/next/current navigation (spec Key Entities, research §6).

| Concept | Definition |
|---------|------------|
| `referenceMonday` | `YYYY-MM-DD` Monday of the displayed week; the single navigation state. |
| `days` | Seven `YYYY-MM-DD` dates Monday→Sunday derived from `referenceMonday`. |
| `today` | The current calendar date; its column is visually distinguished only when in view. |
| `window` | `{ from: days[0], to: days[6] }` — the range passed to `GET /tasks`. |

Not stored anywhere; recomputed from state on every render.

## Entity: Label (lightweight)

An optional user-defined tag on a Task. This stage treats labels as plain strings in the
`labels: string[]` array — no separate Label entity, no persistence of its own, no
management UI (spec Assumptions, Principle VI).

## Relationships

- **User → Task** (1-to-many): a Task is owned by exactly one User, expressed by the shared
  partition `PK = USER#<userId>`. All of a user's Tasks live in their partition. The owning
  key is the app `userId` (UUID), never the Cognito `sub`.
- **User → Project / Note** (future): Projects (Stage 4) and Notes (Stage 5) will link to the
  **same** `userId`, giving one provider-independent owner key across all feature data
  (user requirement). No such items are created this stage.

## Relationship to deferred stages

`projectId` (Stage 4) and `linkedNoteIds` (Stage 5) exist in the Task shape but are never
populated or surfaced this stage. Because they already occupy the persisted item, and because
all feature data keys off the stable app `userId` rather than the identity provider's `sub`,
adding those relationships later needs **no reshaping or migration** of Stage 3 tasks — exactly
the forward-compatibility the spec requires.
