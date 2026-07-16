# Feature Specification: Store Note Body in S3

**Feature Branch**: `007-note-body-s3-storage`

**Created**: 2026-07-16

**Status**: Draft

**Input**: User description: "Store note body in S3 — DynamoDB should only store metadata of notes; the body of the note should be saved as a md file in S3; use proper folder structure in S3 (e.g. users/<uid>/notes/<id>.md); two-store consistency ordered S3 PUT → then DynamoDB metadata update (so metadata never points at a missing body); orphan cleanup on delete: delete metadata, then best-effort delete S3."

## Overview

Stage 5 shipped the Notes view, where each note's Markdown **content** is stored inline in the note's
DynamoDB record alongside its metadata (title, timestamps, links to projects/tasks). This feature
splits that storage: the metadata store keeps only **metadata**, while each note's **body** is
persisted as a standalone Markdown object in dedicated, per-user object storage, addressed by a
predictable path (`users/<uid>/notes/<id>.md`).

The change is transparent to the end user — notes still create, load, auto-save, and delete exactly
as before — but it removes the per-note size ceiling imposed by storing bodies inline, keeps note
listings lightweight (metadata only, no body payload), and establishes a durable two-store model.
The core reliability guarantee is ordering: on any write, the body is committed to object storage
**first**, and only then is the metadata record written or updated, so metadata never references a
body that does not exist. On delete, the ordering reverses: metadata is removed first (making the
note immediately invisible to the user), then the body object is deleted on a best-effort basis so
storage is not left holding orphaned bodies.

This feature is a storage-layer refactor of the existing Notes surface. It does not add new
user-facing note capabilities, does not change the note↔project/task linking behavior, and does not
alter authentication or the per-user data-isolation boundary — every note body, like its metadata,
belongs to exactly one account and is only ever read or written on behalf of that account.

## Clarifications

### Session 2026-07-16

- Q: How should existing notes (bodies stored inline in metadata) be handled at cutover? → A: No migration — the current notes are throwaway test data and will be deleted; the split-store model applies only from cutover onward.
- Q: Must note search still match body content once bodies move to object storage? → A: No — search stays title-only (as Stage 5's minimum guarantee); body content is not searchable and listings never fetch bodies.
- Q: How does the client read/write body bytes — backend-proxied or presigned S3 URLs? → A: Backend-proxied — the client only ever calls the API; the backend performs all object-storage reads/writes, keeping the S3-first write ordering and per-user authorization server-side. The client never accesses object storage directly.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Author and retrieve note bodies backed by object storage (Priority: P1)

An authenticated user creates a note, types Markdown content, and the content auto-saves as usual.
When the user reloads the app, selects the note again, or opens it on the desktop app, the exact
saved body is restored. Under the hood the body now lives as a Markdown object in per-user storage
rather than inline in the metadata record, but the user observes no behavioral difference — content
they wrote is content they get back.

**Why this priority**: This is the irreducible core of the feature. If a note's body cannot be
reliably written to and read back from object storage, nothing else about the split-store model
matters. It delivers the same authoring value users already have, on the new storage foundation.

**Independent Test**: Log in, create a note, enter body content, allow auto-save, reload the app,
reopen the note, and confirm the body matches exactly. Repeat with a very large body (larger than
the previous inline limit) and confirm it still saves and restores intact.

**Acceptance Scenarios**:

1. **Given** an authenticated user on the Notes view, **When** they create a note and type body
   content that auto-saves, **Then** the body is stored as a Markdown object at
   `users/<uid>/notes/<id>.md` and the metadata record for that note contains only metadata (no
   inline body).
2. **Given** a note whose body was previously saved, **When** the user selects that note, **Then**
   the editor loads the exact body content from object storage.
3. **Given** a note being edited, **When** the user changes the body and auto-save fires, **Then**
   the object-storage body is overwritten with the new content and the metadata record's
   last-updated timestamp advances.
4. **Given** a note with a body larger than the previous inline storage limit, **When** the user
   saves it, **Then** the save succeeds and the full body is retrievable.

---

### User Story 2 - Writes never leave metadata pointing at a missing body (Priority: P1)

Because a note is now two records (metadata + body object), a partial write must never produce a
note the user can see in their list but cannot open. The system commits the body to object storage
first and writes/updates metadata only after the body write succeeds. If the body write fails, no
metadata is created or updated, so the user's visible notebook stays internally consistent.

**Why this priority**: Consistency is the whole justification for the write ordering the user
specified. A note that appears in the list but fails to load its body is a data-integrity failure
that erodes trust in the notebook. This guarantee must hold from day one.

**Independent Test**: Simulate an object-storage write failure during note creation and confirm no
note metadata is persisted (the note does not appear in the list). Simulate the same failure during
a body update and confirm the metadata's last-updated timestamp does not advance and the previously
saved body remains retrievable.

**Acceptance Scenarios**:

1. **Given** a new note being created, **When** the body write to object storage fails, **Then** no
   metadata record is created and the note does not appear in the user's list.
2. **Given** an existing note being updated, **When** the body write to object storage fails,
   **Then** the metadata record is not updated and the last successfully saved body is still
   returned on read.
3. **Given** any successful note write, **When** the metadata record exists, **Then** its referenced
   body object also exists (metadata never references a missing body).

---

### User Story 3 - Deleting a note removes it cleanly without orphaning storage (Priority: P2)

When the user deletes a note, the metadata is removed first so the note immediately disappears from
their notebook, then the body object is deleted on a best-effort basis. If the body deletion does
not succeed, the note is still gone from the user's perspective; at worst an unreferenced body
object lingers in storage, which is harmless and can be reclaimed later.

**Why this priority**: Clean deletion matters for user trust and storage hygiene, but it builds on
the create/read/update foundation of Stories 1 and 2, so it is P2. The user explicitly requires the
delete ordering (metadata first, then best-effort body cleanup).

**Independent Test**: Delete a note and confirm it no longer appears in the list and its body is no
longer retrievable. Separately, simulate a body-deletion failure and confirm the note is still
removed from the user's notebook (metadata gone) and the operation reports success to the user.

**Acceptance Scenarios**:

1. **Given** an existing note, **When** the user deletes it, **Then** the metadata record is removed
   first and the body object is deleted afterward.
2. **Given** a delete where the body-object deletion fails, **When** the metadata deletion already
   succeeded, **Then** the delete is still reported as successful to the user and the note no longer
   appears in their notebook.
3. **Given** a deleted note, **When** the user reloads their notebook, **Then** the note is absent
   from the list and its body is not retrievable.

---

### User Story 4 - Fast, body-free note listings (Priority: P3)

When the user opens the Notes view, the list of notes is populated from metadata only — titles,
timestamps, and links — without fetching any note bodies. Bodies are loaded only when a specific
note is opened in the editor.

**Why this priority**: This is a performance and efficiency benefit that naturally falls out of the
split-store design. It improves list responsiveness, especially as the notebook grows, but the app
remains functional without treating it as a hard blocker, so it is P3.

**Independent Test**: With several notes present, load the notebook list and confirm it renders from
metadata alone with no body content transferred; then open one note and confirm its body is fetched
at that point.

**Acceptance Scenarios**:

1. **Given** a user with multiple notes, **When** the notebook list loads, **Then** only metadata is
   retrieved and no note bodies are fetched.
2. **Given** the loaded list, **When** the user selects a single note, **Then** that note's body is
   fetched from object storage at selection time.

---

### Edge Cases

- **Metadata exists but body object is missing** (e.g., from a partial/interrupted write): the system
  MUST fail gracefully — the note still opens, presenting an empty body rather than an error that
  blocks the notebook — and MUST NOT crash the editor.
- **Title-only change**: when the user renames a note or edits only its links without changing body
  content, the system MAY skip the object-storage write and update only metadata; correctness MUST
  hold either way.
- **Concurrent edits to the same note** (e.g., two devices auto-saving): last successful write wins;
  the body object and metadata timestamp reflect the most recent completed write.
- **Very large body** exceeding the previous inline storage limit: MUST save and restore intact.
- **Empty body**: a note with no content MUST still be valid; saving an empty body is allowed and
  restores as empty.
- **Best-effort body delete fails repeatedly**: the resulting orphaned body object MUST NOT affect
  any user-visible behavior and MUST remain reclaimable by a later cleanup process.
- **Cross-user access attempt**: a request for a note body MUST only ever resolve within the
  requesting account's storage path; one user MUST never read or overwrite another user's body.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The metadata store MUST persist only note metadata (identity, owning account, title,
  timestamps, and project/task links) and MUST NOT store the note's Markdown body inline.
- **FR-002**: Each note's Markdown body MUST be persisted as a standalone Markdown object in per-user
  object storage.
- **FR-003**: The body object for a note MUST be addressed by a deterministic, per-user path of the
  form `users/<uid>/notes/<id>.md`, where `<uid>` is the owning account identifier and `<id>` is the
  note identifier.
- **FR-004**: On note creation and on body update, the system MUST write the body object to storage
  **first**, and MUST create or update the metadata record **only after** the body write succeeds.
- **FR-005**: If the body write fails, the system MUST NOT create or update the corresponding
  metadata record, and MUST surface the failure to the caller.
- **FR-006**: Reading a single note MUST return its metadata together with the current body content
  fetched from object storage.
- **FR-007**: Listing notes MUST return metadata only and MUST NOT fetch note bodies.
- **FR-008**: On note deletion, the system MUST delete the metadata record **first**, then delete the
  body object on a **best-effort** basis.
- **FR-009**: A failure to delete the body object MUST NOT fail the overall delete operation; the
  delete MUST still be reported as successful once metadata is removed.
- **FR-010**: The system MUST guarantee that a persisted metadata record never references a
  nonexistent body object under normal operation (a consequence of the FR-004 ordering).
- **FR-011**: Every body read, write, and delete MUST be scoped to the requesting user's account, so
  a user can only access body objects under their own `users/<uid>/` path — no cross-user access.
- **FR-012**: When a note's metadata exists but its body object is absent, reading the note MUST
  degrade gracefully to an empty body rather than erroring, so the notebook remains usable.
- **FR-013**: Body objects MUST support content larger than the metadata store's per-item size limit,
  removing the previous inline body-size ceiling.
- **FR-014**: No migration of pre-existing notes is required. The current inline-body notes are
  throwaway test data and MUST be deleted at cutover rather than migrated; the split-store model
  applies only to notes created from cutover onward. The read path therefore does NOT need to
  support the legacy inline-body shape.
- **FR-015**: Note search/filter MUST continue to match on note title only. Body content MUST NOT
  become a search criterion, so search MUST NOT read body objects from storage; this preserves the
  metadata-only listing guarantee (FR-007).
- **FR-016**: All object-storage reads and writes MUST be performed by the backend on the user's
  behalf; the client MUST interact only with the application's API and MUST NOT access object
  storage directly (no client-side presigned-URL uploads or downloads). This keeps the FR-004
  write ordering and the per-user authorization boundary (FR-011) server-side.

### Key Entities *(include if feature involves data)*

- **Note Metadata**: The authoritative record of a note's existence and attributes, owned by exactly
  one account. Attributes: note identifier, owning account identifier, title, created/updated
  timestamps, linked project IDs, linked task IDs, and a reference to the body object's location. It
  no longer carries inline Markdown content.
- **Note Body**: The note's Markdown content, stored as a single object per note at
  `users/<uid>/notes/<id>.md`. It has no independent identity beyond its path, which is derived from
  the owning account and note identifier; it is created/overwritten before its metadata is written
  and deleted after its metadata is removed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of note bodies written are byte-for-byte identical when read back, across reloads
  and desktop-app restarts.
- **SC-002**: Notes with bodies exceeding the previous inline size limit (e.g., beyond the metadata
  store's per-item ceiling) save and restore successfully, where before they could not.
- **SC-003**: In any injected-failure test of the write path, zero metadata records are left
  referencing a missing body object (no user-visible note fails to open due to a missing body).
- **SC-004**: Loading the notebook list transfers zero note-body content; body content is fetched
  only when an individual note is opened.
- **SC-005**: After deleting a note, the note is absent from the user's list and its body is
  unretrievable in 100% of cases, even when best-effort body cleanup does not complete.
- **SC-006**: After cutover there is no legacy inline-body read path: 100% of notes are stored and
  read via the split-store model (metadata + object-storage body), and no note carries an inline body.
- **SC-007**: No user can read or overwrite another user's note body under any tested request.

## Assumptions

- **Existing storage location exists or will be provisioned**: A per-user-partitioned object store
  (an S3 bucket in the CDK-managed backend) is available for note bodies; provisioning it is part of
  this feature's infrastructure work.
- **No legacy migration**: Existing notes are throwaway test data and are deleted at cutover, not
  migrated (see Clarifications 2026-07-16). There is no lazy or backfill migration path and the read
  path does not support the legacy inline-body shape.
- **User/account identifier is the existing Cognito-backed account ID** used for per-user data
  isolation in prior stages; the same identifier keys the `users/<uid>/` storage path.
- **Body content type is Markdown text** and is stored as a `.md` object; no additional processing,
  indexing, or transformation of body content is in scope.
- **Best-effort delete failures are logged** for later reconciliation but do not trigger user-facing
  errors or automated retries within this feature; a separate reclamation process for orphaned
  bodies is out of scope.
- **No change to note editing UX, auto-save cadence, or note↔project/task linking**: those behaviors
  from Stage 5 are unchanged; only the persistence of the body moves.
- **Object storage is the single source of truth for body content**; the body is not duplicated back
  into the metadata store as a cache.
