# Contract: Notes REST API (updated for S3 body storage)

Updates the Stage 5 `contracts/notes-api.md`. All routes remain protected (`authenticate` →
`resolveIdentity`); `userId` is always `req.auth.userId`, never caller input. Bodies are
backend-proxied to/from S3 (FR-016). **Changes are marked `CHANGED` / `NEW`.**

## Response shapes

- **`NoteMetadata`** (list element): `{ id, title, linkedProjectIds, linkedTaskIds, createdAt, updatedAt, bodyKey }` — **no `markdown`**.
- **`Note`** (full): `NoteMetadata` **+** `markdown`.

## `GET /notes` — list the owner's notes  *(CHANGED: metadata only)*

- Query params (unchanged, mutually exclusive): `?linkedProjectId=<id>` or `?linkedTaskId=<id>` for the
  reverse linked-notes lookup; none ⇒ full recency-sorted list.
- **200** → `{ "notes": NoteMetadata[] }` — recency-sorted (`updatedAt` desc, `id` tiebreak). **No body
  content is fetched or returned** (FR-007). Search/filter over this list is title-only (FR-015).
- **401** unauthenticated · **500** internal error.

## `GET /notes/:id` — fetch one note with its body  *(NEW)*

- Reads metadata (ownership-enforced), then reads the body object; composes the full note.
- **200** → `Note` (metadata + `markdown`). If the body object is missing, `markdown` is `""` (FR-012).
- **404** `{ "error": "NotFound" }` — not the owner's note (or unknown id; no disclosure).
- **401** · **500**.

## `POST /notes` — create  *(CHANGED: body written to S3 first)*

- Request: `createNoteSchema` `{ title?, markdown? }`.
- Ordering: server assigns ULID + timestamps + `bodyKey`, **`PutObject` body → `PutItem` metadata**
  (FR-004). If the body write fails, no metadata is created (FR-005).
- **201** → `Note` (full, incl. the just-written `markdown`).
- **400** `ValidationError` · **401** · **500** (incl. body-write failure).

## `PATCH /notes/:id` — partial update  *(CHANGED: conditional S3 write, body first)*

- Request: `updateNoteSchema` (partial `{ title?, markdown?, linkedProjectIds?, linkedTaskIds? }`).
- If the patch **includes `markdown`**: **`PutObject` body → `UpdateItem` metadata** (`title?`,
  `updatedAt`) (FR-004). If it does **not** include `markdown` (rename / link change): **metadata
  `UpdateItem` only**, no S3 write (spec Edge Case).
- Link arrays, when present, are de-duplicated and owner-validated (unchanged): an unowned target ⇒
  **400** `{ "error": "InvalidLinkTarget", "details": string[] }` and nothing is persisted.
- **200** → `Note` (full). For a markdown-bearing patch, `markdown` reflects the just-written body; for
  a metadata-only patch, the response still returns the current `markdown` (read-through) — **or**
  callers that only changed metadata may rely on the returned metadata (see client contract).
- **400** · **401** · **404** `NotFound` · **500** (incl. body-write failure).

## `DELETE /notes/:id` — delete  *(CHANGED: metadata first, best-effort body cleanup)*

- Ordering: **`DeleteItem` metadata (ownership-guarded) → best-effort `DeleteObject` body**. A failed
  body delete is logged and **does not** fail the request (FR-008/FR-009).
- **204** on success (even if best-effort body cleanup did not complete).
- **401** · **404** `NotFound` · **500** (only if the metadata delete itself errors).

## Error envelope (unchanged)

`{ "error": string, "details"?: unknown }` with the status codes above. Internal errors never leak
S3 keys or storage internals.
