# Phase 1 Data Model: Store Note Body in S3

Refactors the Stage 5 **Note** entity (see `specs/005-notes/data-model.md`) from a single
DynamoDB item into a **metadata record (DynamoDB)** + **body object (S3)** pair. The key scheme,
ownership rule, and link model are otherwise unchanged.

## §1 — Note Metadata (DynamoDB)

The authoritative record of a note's existence and attributes. Identical to the Stage 5 shape
**minus the inline `markdown` field**, **plus** an explicit `bodyKey` pointer.

### Domain shape (`libs/shared/src/schemas/note.ts` → `noteMetadataSchema`)

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `id` | `string` (ULID) | yes | server-generated | Never client-supplied. Unchanged. |
| `title` | `string` | yes (may be empty) | `''` | Unchanged; list shows "Untitled" when empty. |
| `linkedProjectIds` | `string[]` | yes | `[]` | Unchanged; sole store of project links. |
| `linkedTaskIds` | `string[]` | yes | `[]` | Unchanged; sole store of task links. |
| `createdAt` | `string` (ISO 8601) | yes | server-set | Unchanged. |
| `updatedAt` | `string` (ISO 8601) | yes | server-set | Bumped on every metadata mutation; recency sort. |
| `bodyKey` | `string` | yes | server-set | S3 object key `users/<userId>/notes/<id>.md` (FR-003). Derivable from `id`, persisted explicitly for clarity/robustness. |
| ~~`markdown`~~ | — | — | — | **Removed from DynamoDB.** Body now lives in S3 (FR-001). |

### Persisted single-table item (`notes.repository.ts`)

| Attribute | Value | Notes |
|-----------|-------|-------|
| `PK` | `USER#<userId>` | Unchanged — partition = owner, `userId` from gateway-verified `sub`. |
| `SK` | `NOTE#<id>` | Unchanged. |
| `title`, `linkedProjectIds`, `linkedTaskIds`, `createdAt`, `updatedAt`, `bodyKey` | as above | `markdown` no longer written. |

Ownership is carried by the key exactly as before (`attribute_exists(PK)` guard on update/delete);
`PK`/`SK`/`bodyKey`-internals never trusted from the client. The list Query (`PK = USER#<userId>`,
`begins_with(SK, 'NOTE#')`) and the reverse linked-notes `contains` filter Query are **unchanged** and
now transfer strictly less data (no body) — satisfying FR-007.

## §2 — Note Body (S3 object)

The note's Markdown content, stored as one object per note.

| Property | Value |
|----------|-------|
| Bucket | The CDK-managed notes bucket (`WORKBOARD_NOTES_BUCKET`). |
| Key | `users/<userId>/notes/<id>.md` (FR-003) — built **solely** from resolved `userId` + note `id`. |
| Content-Type | `text/markdown` |
| Body | UTF-8 Markdown string (may be empty). No size ceiling beyond S3's (FR-013). |
| Identity | None independent of its key; lifecycle is bound to its metadata record. |

**Lifecycle vs. metadata** (research §3):
- Written/overwritten **before** its metadata record is written (create) or its `updatedAt` bumped
  (content update) — FR-004.
- Deleted **after** its metadata record is removed, best-effort — FR-008/FR-009.
- If absent when read, the note resolves with `markdown: ''` — FR-012.

## §3 — Full Note (API composition)

| Schema | Shape | Used by |
|--------|-------|---------|
| `noteMetadataSchema` | metadata fields (§1), **no** `markdown` | DynamoDB item; `GET /notes` list elements |
| `noteSchema` | `noteMetadataSchema.extend({ markdown: z.string().default('') })` | `POST /notes`, `PATCH /notes/:id`, `GET /notes/:id` responses |
| `createNoteSchema` | `{ title?, markdown? }` | `POST /notes` request — **unchanged** |
| `updateNoteSchema` | `{ title?, markdown?, linkedProjectIds?, linkedTaskIds? }` (partial) | `PATCH /notes/:id` request — **unchanged** |

`Note = z.infer<typeof noteSchema>` (metadata + body); `NoteMetadata = z.infer<typeof noteMetadataSchema>`.

## §4 — State transitions

```text
        create (title?, markdown?)
               │  1) S3 PutObject users/<uid>/notes/<id>.md   (body-first, FR-004)
               │  2) DynamoDB PutItem metadata (incl. bodyKey)
               ▼
          ┌──────────┐
          │ metadata │  updatedAt bumped on every mutation
          │  + body  │
          └──────────┘
       content auto-save {title, markdown}:  S3 PutObject (body) → DynamoDB UpdateItem (title, updatedAt)
       rename {title} / link change:         DynamoDB UpdateItem only  (no S3 write — Edge Case)
       read GET /notes/:id:                  DynamoDB GetItem → S3 GetObject (NoSuchKey ⇒ markdown:'')
               │
               └── delete ──▶ 1) DynamoDB DeleteItem (metadata, ownership-guarded)
                              2) best-effort S3 DeleteObject (failure logged, not fatal — FR-009)
```

## §5 — Validation & isolation rules (unchanged from Stage 5 except body location)

- `title` string, no min length (empty valid). `markdown` string (empty valid).
- `linkedProjectIds` / `linkedTaskIds` de-duplicated and owner-validated **only when a PATCH carries
  them** (unchanged hot-path rule — research §5 of Stage 5).
- Both the DynamoDB key and the S3 key are derived **only** from the resolved `userId`, so neither a
  foreign note id nor a crafted body key can reach another user's data (FR-011, SC-007).
- Search/filter matches **title only**; body objects are never read for search (FR-015).
