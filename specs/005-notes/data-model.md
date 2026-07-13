# Phase 1 Data Model: Stage 5 — Notes

Derives from the spec's Key Entities and the Phase 0 research. This stage introduces the **Note**
entity and **activates the note↔project/task relationship** the product reserved from the start.
The decisive rule (research §2) is that **the Note is the single source of truth for every link**:
a note owns its `linkedProjectIds` and `linkedTaskIds`, and the reverse view ("notes linked to this
project/task") is a filtered read of the notes partition — nothing is denormalized onto the Task or
Project. The Task and Project shapes are therefore **unchanged**.

## Entity: Note

A titled Markdown document owned by exactly one Account (the authenticated user). Replaces the
Stage 1 `note` stub with the full domain shape. Introduced this stage.

### Domain shape (`libs/shared/src/schemas/note.ts`)

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `id` | `string` (ULID) | yes | server-generated | Never client-supplied (research §1). |
| `title` | `string` | yes (may be empty) | `''` | **Empty allowed** — the Stage 1 `min(1)` is dropped; list shows "Untitled" for empty (FR-008, research §7). |
| `markdown` | `string` | yes (may be empty) | `''` | The note body; Markdown is the stored source of truth (research §3). |
| `linkedProjectIds` | `string[]` | yes | `[]` | Ids of the owner's projects this note links to. De-duplicated. **Sole store** of project links (research §2). |
| `linkedTaskIds` | `string[]` | yes | `[]` | Ids of the owner's tasks this note links to. De-duplicated. **Sole store** of task links (research §2). |
| `createdAt` | `string` (ISO 8601) | yes | server-set | Audit + stable secondary sort. |
| `updatedAt` | `string` (ISO 8601) | yes | server-set | Bumped on every mutation; primary recency sort for the list. |

Owner is **not** a domain field — ownership is carried by the persisted key and derived from the
app `userId` resolved from the authenticated `sub`, never returned to or accepted from the client
(Principle IV, FR-018).

> **Field name**: the body field stays `markdown` (matching the PRD Data Model and the existing
> stub), not `content`.

### Persisted single-table item (`notes.repository.ts`)

| Attribute | Value | Notes |
|-----------|-------|-------|
| `PK` | `USER#<userId>` | Partition = owner; `userId` is the app User UUID resolved from the gateway-verified `sub` — never caller input. |
| `SK` | `NOTE#<id>` | `id` = ULID. |
| `title`, `markdown`, `linkedProjectIds`, `linkedTaskIds`, `createdAt`, `updatedAt` | as above | Plain attributes; all except timestamps/id mutable in place. |

The key is built **only** from the resolved `userId`, so a read/write can only reach the owner's
partition and a foreign `id` resolves as not-found — no disclosure (FR-018, SC-007). `PK`/`SK` are
never returned to callers. The user's notes are listed with one `Query`
(`PK = USER#<userId>`, `begins_with(SK, 'NOTE#')`). The **reverse linked-notes read** is the *same*
`Query` plus a `FilterExpression` — `contains(linkedProjectIds, :id)` or
`contains(linkedTaskIds, :id)` — **no GSI** (research §2).

### Request schemas (shared, used by controller + client)

- **`createNoteSchema`**: `{ title?: string, markdown?: string }` — both optional; the server
  assigns `id`, `createdAt`/`updatedAt`, defaults `title`/`markdown` to `''`, and
  `linkedProjectIds`/`linkedTaskIds` to `[]`. A note can be created **empty** (auto-save-first
  flow, FR-002/FR-008).
- **`updateNoteSchema`**: all of `{ title?, markdown?, linkedProjectIds?, linkedTaskIds? }`
  optional (partial). `title` may be an **empty** string. Serves three distinct callers:
  - **content auto-save** → `{ title?, markdown? }` only (no link validation, research §5),
  - **link add/remove** → `{ linkedProjectIds? }` and/or `{ linkedTaskIds? }` (triggers
    owner-scoped link-target validation, research §5),
  - **rename** → `{ title }`.

### Validation rules

- `title` is a string with **no minimum length** (empty is valid; FR-008). `markdown` is a string.
- `linkedProjectIds` / `linkedTaskIds` are arrays of strings; the service **de-duplicates** them
  and, **when present in an update**, validates every id belongs to the caller's own
  projects/tasks via the projects/tasks public service APIs, rejecting a foreign/unknown id
  (FR-009/FR-010/FR-018, research §5).
- Ownership is enforced by the key (`attribute_exists(PK)` guard on update/delete), never by a
  client-supplied field.

### State transitions

```text
        create (title?, markdown?)            ← may be fully empty (auto-save-first)
               │
               ▼
          ┌──────┐   auto-save {title,markdown} (~500ms debounce)   ┌──────┐
          │ note │ ────────────────────────────────────────────────▶ │ note │  (persisted; updatedAt bumped)
          │      │ ◀──── link/unlink {linkedProjectIds|linkedTaskIds} │      │  (owner-validated, de-duped)
          └──────┘                                                    └──────┘
               │
               └──── delete ────▶ note removed; its links vanish with it (nothing else stores them — FR-017)
```

## Entity: Task (relationship — shape and storage unchanged)

The same Task entity from Stage 3/4 (`libs/shared/src/schemas/task.ts`). **Nothing about the Task
changes this stage** — no schema edit, no new write path.

| Field | Stage 3/4 usage | Stage 5 usage |
|-------|-----------------|---------------|
| `linkedNoteIds` (`string[]`) | Always `[]` (deferred). | **Still `[]`, and deliberately not used as an authority.** Links live on the Note (research §2); "notes linked to this task" is the reverse Query, not this field. Kept for forward-compatibility. |

The task's "**Linked notes**" indicator (FR-011) is rendered from the reverse lookup
(`GET /notes?linkedTaskId=<id>`), **not** from `task.linkedNoteIds`. This is what keeps the two
sides single-sourced and non-divergent (FR-013).

## Entity: Project (relationship — shape and storage unchanged)

The same Project entity from Stage 4 (`libs/shared/src/schemas/project.ts`). **No schema or write
change.** The project detail page's "**Linked notes**" section (FR-011) is rendered from the
reverse lookup (`GET /notes?linkedProjectId=<id>`), never from a field on the project.

## Entity: Note↔Project/Task link (relationship — not a stored entity)

The association connecting a Note to a Project or Task. It is **not** a separate persisted item and
**not** denormalized onto the work item — it exists **only** as membership in the note's
`linkedProjectIds` / `linkedTaskIds` arrays (research §2).

| Concept | Definition |
|---------|------------|
| add link | append `projectId`/`taskId` to the note's array (after owner-validation + dedup). |
| remove link | drop the id from the note's array; the project/task is untouched (US3.3). |
| forward view (from note) | the note's own arrays, **resolved** against the user's projects/tasks for display (stale ids omitted — research §4). |
| reverse view (from work) | `Query` the notes partition filtered on `contains(linked…Ids, :id)` (FR-011). |
| stale link | an id whose project/task was deleted → **omitted at display time**, optionally pruned on next save (FR-014, research §4). |
| dedup | the service prevents duplicate membership (US3.4). |

## Relationships

- **User → Note** (1-to-many): a Note is owned by exactly one User via the shared partition
  `PK = USER#<userId>`. The owning key is the app `userId` (UUID), never the Cognito `sub`.
- **Note → Project** (many-to-many, optional): a Note references zero or more of the owner's
  Projects via `linkedProjectIds`. Reverse: notes linked to a project are those whose array
  `contains` the project id. Single-sourced on the note.
- **Note → Task** (many-to-many, optional): a Note references zero or more of the owner's Tasks via
  `linkedTaskIds`. Reverse: analogous. Single-sourced on the note.
- **Deleting a Note** removes its links implicitly (they live nowhere else — FR-017).
- **Deleting a Project/Task** (Stage 4/3) requires **no** note write; the now-unresolvable id is
  resolved away at display time (FR-014).

## Relationship to deferred stages

The Overview dashboard's "recent notes" aggregation (a later stage) will read the same
recency-sorted notes partition this stage establishes — no reshaping needed. Because every feature
keys off the stable app `userId` and the Note owns its links, the model stays forward-compatible,
consistent with the Stage 3/4 approach.
