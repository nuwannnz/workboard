# Quickstart: Store Note Body in S3 — validation guide

Runnable scenarios proving the split-store model end-to-end. References the contracts
(`contracts/notes-api.md`, `contracts/note-body-store.md`) and `data-model.md`; no implementation
code here.

## Prerequisites

- Nx monorepo installed (`npm install`) with the new `@aws-sdk/client-s3` dependency present.
- Local backing services up: `docker compose -f apps/backend/docker-compose.yml up -d`
  (DynamoDB Local, Cognito Local, **LocalStack S3**), the local notes bucket created, and
  `apps/backend/.env` carrying `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE=true`, `WORKBOARD_NOTES_BUCKET`.
- Backend running: `npm run local` (or `nx serve backend`); frontend: `nx serve frontend`.

## Automated tests (primary validation)

```bash
# Unit/integration — body store, service ordering, missing-body, best-effort delete
nx test backend
# Shared schema split (noteMetadataSchema / noteSchema)
nx test shared
# Frontend notes hooks (metadata list + select-to-fetch body)
nx test frontend
# End-to-end against the full local stack (LocalStack S3)
nx e2e frontend-e2e
```

Expected: all green, including the existing `notes-core-flow` / `notes-rejections` e2e specs plus the
new large-body round-trip.

## Scenario A — Body lives in S3, metadata in DynamoDB (US1, FR-001/FR-002/FR-003)

1. Create a note and type `# Hello` as its body; wait for auto-save ("saved").
2. Inspect DynamoDB (local): the `USER#<uid> / NOTE#<id>` item has `title`, `bodyKey`, timestamps —
   **no `markdown` attribute**.
3. Inspect S3 (local): object `users/<uid>/notes/<id>.md` exists with content `# Hello`,
   Content-Type `text/markdown`.
4. Reload the app, reopen the note (triggers `GET /notes/:id`): the editor shows `# Hello` exactly.
   ✅ FR-001/FR-002/FR-003; SC-001.

## Scenario B — Large body beyond the DynamoDB item limit (FR-013, SC-002)

1. Paste a body larger than 400 KB into a note; wait for auto-save.
2. Reopen it and confirm the full content round-trips intact. ✅ SC-002 (was impossible inline).

## Scenario C — Body-first write ordering (US2, FR-004/FR-005/FR-010)

1. With the S3 body write forced to fail (test hook / LocalStack fault), create a note.
2. Confirm **no** metadata item is written and the note does **not** appear in `GET /notes`. ✅ FR-005.
3. On an existing note, force the body PUT to fail during a content save; confirm `updatedAt` did not
   advance and the previously saved body still returns from `GET /notes/:id`. ✅ FR-004/FR-010; SC-003.

## Scenario D — Metadata-only listings (US4, FR-007, SC-004)

1. With several notes present, load the notebook and capture the `GET /notes` response: elements are
   `NoteMetadata` (no `markdown`); no per-note S3 gets occur on list load.
2. Select one note; observe exactly one `GET /notes/:id` (one S3 GetObject) at selection time.
   ✅ FR-007; SC-004.

## Scenario E — Clean delete, best-effort cleanup (US3, FR-008/FR-009, SC-005)

1. Delete a note; confirm it leaves the list and `GET /notes/:id` now returns `404`, and the S3 object
   is gone.
2. With the S3 delete forced to fail, delete another note; confirm the request still returns `204`, the
   note is gone from the list, and the failure was logged. ✅ FR-008/FR-009; SC-005.

## Scenario F — Missing body degrades gracefully (FR-012)

1. Manually delete a note's S3 object while leaving its metadata (simulating a partial state).
2. Open the note: the editor loads with an **empty** body, no error, notebook still usable. ✅ FR-012.

## Scenario G — Per-user isolation (FR-011, SC-007)

1. As user A, create a note; note its `<idA>`.
2. As user B, call `GET /notes/:idA` → `404`; confirm no object under `users/<B>/…` is created or read
   for A's id, and B cannot reach `users/<A>/notes/<idA>.md`. ✅ FR-011; SC-007.

## Deploy validation

```bash
nx deploy infra   # or the project's CDK deploy target — provisions the notes bucket + IAM + env
```

Confirm the stack output `NotesBucketName`, the Lambda env `WORKBOARD_NOTES_BUCKET`, and that a
create/read/delete round-trip works against real AWS.
