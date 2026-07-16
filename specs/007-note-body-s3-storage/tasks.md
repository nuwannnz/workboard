---
description: "Task list for Store Note Body in S3"
---

# Tasks: Store Note Body in S3

**Input**: Design documents from `/specs/007-note-body-s3-storage/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (notes-api.md, note-body-store.md), quickstart.md

**Tests**: INCLUDED — Constitution Principle III (Test-First, NON-NEGOTIABLE) requires Vitest + Playwright coverage; each user story has an Independent Test in spec.md.

**Organization**: Tasks grouped by user story (US1–US4) from spec.md, in priority order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4 for user-story phases only
- Exact file paths included

## Path notes (from plan.md — Nx monorepo)

- Shared schema: `libs/shared/src/schemas/note.ts`
- Backend notes module: `apps/backend/src/modules/notes/`
- Backend config: `apps/backend/src/shared/config.ts`
- Frontend notes feature: `apps/frontend/src/notes/`
- Infra (CDK): `apps/infra/lib/`
- E2E: `apps/frontend-e2e/src/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies and local-dev backing services for S3

- [X] T001 Add `@aws-sdk/client-s3` to root `package.json` dependencies and run `npm install` (runtime-provided in Lambda via existing `externalModules: ['@aws-sdk/*']`, needed locally + for types — research §5)
- [X] T002 [P] Add a LocalStack S3 service to `apps/backend/docker-compose.yml` (alongside `dynamodb-local`/`cognito-local`), auto-create the local notes bucket on startup, and document `S3_ENDPOINT` / `S3_FORCE_PATH_STYLE=true` / `WORKBOARD_NOTES_BUCKET` in the local `.env` guidance (research §6)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema split, config, S3 body store, metadata-only repository, and the CDK bucket — every user story depends on these

**⚠️ CRITICAL**: No user-story work can begin until this phase is complete

- [X] T003 [P] Split the note schema in `libs/shared/src/schemas/note.ts`: add `noteMetadataSchema` (id, title, linkedProjectIds, linkedTaskIds, createdAt, updatedAt, **bodyKey**; no `markdown`), redefine `noteSchema = noteMetadataSchema.extend({ markdown: z.string().default('') })`, export `NoteMetadata` type; keep `createNoteSchema`/`updateNoteSchema` unchanged; update `libs/shared/src/schemas/note.spec.ts` (data-model §3, research §9)
- [X] T004 [P] Extend `apps/backend/src/shared/config.ts` `AppConfig`/`loadConfig` with `notesBucket` (`WORKBOARD_NOTES_BUCKET`), `s3Endpoint` (`S3_ENDPOINT`), `s3ForcePathStyle` (`S3_FORCE_PATH_STYLE === 'true'`)
- [X] T005 [P] Write failing unit tests for the S3 body store with an in-memory fake S3 client (mirroring the fake DynamoDB doc-client) in `apps/backend/src/modules/notes/note-body.repository.spec.ts`: `keyFor` = `users/<uid>/notes/<id>.md`, `putBody`/`getBody` round-trip, `getBody` on missing object ⇒ `''` (research §7, contracts/note-body-store.md)
- [X] T006 Implement `NoteBodyStore` in `apps/backend/src/modules/notes/note-body.repository.ts` (`S3Client` with `s3Endpoint`/`forcePathStyle` override; `putBody`/`getBody`/`deleteBody`/`keyFor`; `NoSuchKey`/404 ⇒ `''`) to pass T005 (contracts/note-body-store.md, FR-011/FR-012)
- [X] T007 Edit `apps/backend/src/modules/notes/notes.repository.ts` to persist/return **metadata only** — stop writing the `markdown` attribute, add/read `bodyKey`, have `toNote` return `NoteMetadata`; update `apps/backend/src/modules/notes/notes.repository.spec.ts` (data-model §1) — this makes `GET /notes` metadata-only at the backend
- [X] T008 [P] Create the notes bucket construct in `apps/infra/lib/notes-bucket-stack.ts`: Block Public Access ALL, SSE-S3, `enforceSSL: true`, versioning off, `RemovalPolicy.DESTROY` + `autoDeleteObjects: true` (research §8, contracts/note-body-store.md)
- [X] T009 Wire the bucket in `apps/infra/lib/workboard-stack.ts` and `apps/infra/lib/api-stack.ts`: instantiate the bucket, pass to `ApiStack`, `bucket.grantReadWrite(handler)`, set Lambda env `WORKBOARD_NOTES_BUCKET`, add `CfnOutput` `NotesBucketName`; update `apps/infra/lib/stack.spec.ts`

**Checkpoint**: Schema split live, body store tested, repository metadata-only, bucket provisioned — user stories can begin

---

## Phase 3: User Story 1 - Author and retrieve note bodies backed by object storage (Priority: P1) 🎯 MVP

**Goal**: Bodies are written to / read from S3 transparently; selecting a note fetches its body via a new `GET /notes/:id`, and content round-trips across reload (incl. large bodies).

**Independent Test**: Create a note, type body content, allow auto-save, reload, reopen — body matches exactly; repeat with a >400 KB body (spec US1; quickstart Scenarios A, B).

### Tests for User Story 1

- [X] T010 [P] [US1] Service unit tests (happy path) in `apps/backend/src/modules/notes/notes.service.spec.ts`: `createNote` calls `putBody` then `repo.put` and returns the full note with `markdown`/`bodyKey`; `getNoteById` composes `repo.getById` + `bodyStore.getBody`; `updateNote` with `markdown` calls `putBody` then `repo.update` (inject fake body store + fake repo)
- [X] T011 [P] [US1] Frontend client + hook tests in `apps/frontend/src/notes/use-notes.spec.tsx` (and a `notes-client` test): `listNotes()` parses `NoteMetadata[]`; new `getNote(id)` parses full `noteSchema`; selecting a note triggers a single `getNote` fetch

### Implementation for User Story 1

- [X] T012 [US1] Update `apps/backend/src/modules/notes/notes.service.ts`: inject `NoteBodyStore`; `createNote` → `putBody(userId,id,markdown)` then `repo.put(metadata incl. bodyKey)`; add `getNoteById(userId,id)` composing metadata + `getBody`; `updateNote` → when `patch.markdown !== undefined`, `putBody` first then `repo.update` (else metadata-only update) (contracts/notes-api.md, data-model §4)
- [X] T013 [US1] Add `getOne` handler to `apps/backend/src/modules/notes/notes.controller.ts` (`200` full `Note` / `404`); ensure `create`/`update` responses return the full note with `markdown`
- [X] T014 [US1] Add `router.get('/notes/:id', controller.getOne)` in `apps/backend/src/modules/notes/notes.routes.ts` (protected, ordered so it doesn't shadow the list) (contracts/notes-api.md)
- [X] T015 [P] [US1] Update `apps/frontend/src/notes/notes-client.ts`: `listNotes`/`listByLinked*` return `NoteMetadata[]`; add `getNote(id): Promise<Note>` (`GET /notes/:id`, parse `noteSchema`)
- [X] T016 [US1] Update `apps/frontend/src/notes/use-notes.ts` + `use-note-editor.ts` (+ `notes-page.tsx`/`note-editor.tsx`): on select, fetch full note via `getNote(id)`; seed the editor buffer from the fetched body with a body-loading state; keep optimistic create/rename/delete on metadata; update `use-note-editor.spec.tsx`
- [X] T017 [US1] Extend Playwright `apps/frontend-e2e/src/notes-core-flow.e2e.ts`: create → type body → reload → reopen (`GET /notes/:id`) → body intact; add a large-body (>400 KB) round-trip (quickstart B, SC-001/SC-002)

**Checkpoint**: Authoring + retrieval work end-to-end on the split store (MVP)

---

## Phase 4: User Story 2 - Writes never leave metadata pointing at a missing body (Priority: P1)

**Goal**: A failed body write never creates/advances metadata — the visible notebook stays internally consistent.

**Independent Test**: Force the S3 body write to fail on create ⇒ no note appears; force it on update ⇒ `updatedAt` unchanged and the last saved body still returns (spec US2; quickstart Scenario C).

**Note**: Body-first ordering is implemented in US1's service (T012); US2 hardens and *proves* the failure paths.

### Tests for User Story 2

- [X] T018 [P] [US2] Failure-path service tests in `apps/backend/src/modules/notes/notes.service.spec.ts`: `putBody` throws on create ⇒ `repo.put` never called and error propagates; `putBody` throws on a markdown update ⇒ `repo.update` never called and `updatedAt` not advanced (FR-004/FR-005/FR-010, SC-003)
- [X] T019 [P] [US2] Controller test in `apps/backend/src/modules/notes/notes.service.spec.ts` or a controller test: a body-write failure surfaces as `500` with no metadata persisted (create) and no timestamp bump (update)

### Implementation for User Story 2

- [X] T020 [US2] Harden `apps/backend/src/modules/notes/notes.service.ts` ordering so a `putBody` rejection aborts before any `repo` write (no swallow, no partial state); confirm `NoteBodyStore.putBody`/`deleteBody` propagate S3 errors (contracts/note-body-store.md)
- [X] T021 [US2] Verify/adjust `apps/backend/src/modules/notes/notes.controller.ts` `create`/`update` map a propagated body-write failure to `500` (uniform envelope, no key leakage) — extend tests to lock the behavior

**Checkpoint**: Partial writes are impossible; US1 + US2 both hold

---

## Phase 5: User Story 3 - Deleting a note removes it cleanly without orphaning storage (Priority: P2)

**Goal**: Delete removes metadata first (note vanishes immediately), then best-effort deletes the body; a failed body delete still succeeds.

**Independent Test**: Delete a note ⇒ absent from list and `GET /notes/:id` `404`, object gone; force S3 delete to fail ⇒ delete still `204`, note gone, failure logged (spec US3; quickstart Scenario E).

### Tests for User Story 3

- [X] T022 [P] [US3] Delete-ordering service tests in `apps/backend/src/modules/notes/notes.service.spec.ts`: `deleteNote` calls `repo.delete` before `bodyStore.deleteBody`; a `deleteBody` rejection is caught and `deleteNote` still returns `true`; no `deleteBody` when metadata delete returns `false` (FR-008/FR-009, SC-005)

### Implementation for User Story 3

- [X] T023 [US3] Update `apps/backend/src/modules/notes/notes.service.ts` `deleteNote`: `repo.delete(userId,id)` first; if it existed, best-effort `bodyStore.deleteBody(userId,id)` in try/catch with a logged warning (never fatal)
- [X] T024 [US3] Extend Playwright `apps/frontend-e2e/src/notes-core-flow.e2e.ts` (or `notes-rejections.e2e.ts`): delete removes the note from the list and a subsequent open `404`s / shows empty state

**Checkpoint**: Clean deletion with best-effort cleanup; US1–US3 hold

---

## Phase 6: User Story 4 - Fast, body-free note listings (Priority: P3)

**Goal**: The notebook list renders from metadata only; bodies load only on select.

**Independent Test**: With several notes, load the list — response elements carry no `markdown` and no per-note body fetch occurs; selecting one triggers exactly one `getNote` (spec US4; quickstart Scenario D).

**Note**: Backend `GET /notes` is already metadata-only after T007; this story is the frontend guarantee + verification.

### Tests for User Story 4

- [X] T025 [P] [US4] Test in `apps/frontend/src/notes/notes-list.spec.tsx` / `use-notes.spec.tsx`: the list state holds `NoteMetadata` (no `markdown`) and rendering the list issues zero `getNote`/body fetches; a select issues exactly one (FR-007, SC-004)

### Implementation for User Story 4

- [X] T026 [US4] Ensure `apps/frontend/src/notes/notes-list.tsx` (and any list consumer) renders from metadata only (title/updatedAt, "Untitled" for empty) and no component reads `markdown` off a list item; remove any residual body reliance from the list path

**Checkpoint**: All four user stories independently functional

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T027 [P] Update local-dev docs (`README.md` / `apps/backend/.env` example) for the S3 env vars and LocalStack bucket setup (research §6)
- [X] T028 [P] Per-user isolation test (Scenario G): as user B, `GET /notes/:idA` ⇒ `404`, and no cross-prefix object access — add to `notes-rejections.e2e.ts` or a service test (FR-011, SC-007)
- [X] T029 Run full validation: `nx test shared`, `nx test backend`, `nx test frontend`, `nx e2e frontend-e2e`, then walk quickstart.md Scenarios A–G
- [ ] T030 Deploy infra (CDK) and validate: `NotesBucketName` output present, Lambda env `WORKBOARD_NOTES_BUCKET` set, and a create/read/delete round-trip works against real AWS

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (P1)**: no dependencies
- **Foundational (P2)**: depends on Setup — **BLOCKS all user stories**
- **US1 (P3)**: depends on Foundational — the MVP
- **US2 (P4)**: depends on US1 (hardens the write path built in T012)
- **US3 (P5)**: depends on Foundational (uses body store + repository); independent of US1/US2 logic but shares `notes.service.ts`
- **US4 (P6)**: depends on Foundational (backend) + US1 frontend `getNote` (T015) to prove select-to-fetch
- **Polish (P7)**: depends on all targeted stories

### Critical shared-file serialization (refactor caveat)

`notes.service.ts` is touched by T012/T020/T023 and `notes.service.spec.ts` by T010/T018/T022 — sequence these within their phases (they are **not** mutually [P]). Likewise `notes-client.ts`/`use-notes.ts` across US1/US4.

### Within Each User Story

- Tests (marked [P], different files) written first and FAIL before implementation
- Repository/store → service → controller → routes → frontend → e2e

### Parallel Opportunities

- **Setup**: T002 [P] alongside T001
- **Foundational**: T003, T004, T005, T008 are [P] (distinct files); T006 after T005; T007 after T003; T009 after T008
- **US1**: T010, T011 [P] tests together; T015 [P] (client) parallel to backend T012–T014; T016 after T015
- Cross-story: US3 backend (T022/T023) can proceed in parallel with US1 frontend work once Foundational is done

---

## Parallel Example: Foundational Phase

```bash
# Distinct files — safe to run together:
Task: "T003 Split note schema in libs/shared/src/schemas/note.ts"
Task: "T004 Extend backend config in apps/backend/src/shared/config.ts"
Task: "T005 Write NoteBodyStore unit tests in apps/backend/src/modules/notes/note-body.repository.spec.ts"
Task: "T008 Create notes bucket construct in apps/infra/lib/notes-bucket-stack.ts"
```

## Parallel Example: User Story 1

```bash
# Tests first (distinct files):
Task: "T010 Service happy-path tests in notes.service.spec.ts"
Task: "T011 Client/hook tests in use-notes.spec.tsx"

# Then frontend client in parallel with backend service/controller/route:
Task: "T015 notes-client.ts getNote + metadata list"   # parallel with T012–T014
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1: Setup (T001–T002)
2. Phase 2: Foundational (T003–T009) — schema split, body store, metadata-only repo, bucket
3. Phase 3: User Story 1 (T010–T017)
4. **STOP and VALIDATE**: create/edit/reload a note; body round-trips from S3; large body works
5. Deploy/demo

### Incremental Delivery

1. Setup + Foundational → foundation ready (backend list already metadata-only)
2. US1 → author/retrieve on S3 → **MVP**
3. US2 → consistency hardening (no dangling metadata)
4. US3 → clean delete + best-effort cleanup
5. US4 → confirm body-free listings
6. Polish → isolation test, full validation, deploy

---

## Notes

- Legacy notes are **deleted at cutover**, not migrated (clarification 2026-07-16) — no migration task exists by design.
- No presigned URLs, no content-search index (title-only search — FR-015), single bucket — YAGNI (Principle VI).
- [P] = different files, no incomplete-task dependency; respect the shared-file serialization note above.
- Commit after each task or logical group; verify tests fail before implementing (Principle III).
