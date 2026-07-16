# Phase 0 Research: Store Note Body in S3

Resolves the technical unknowns behind the split-store design. The three product-level ambiguities
(migration, search scope, client access model) were already settled in the spec's **Clarifications
2026-07-16**; this document records the remaining engineering decisions.

## §1 — Body access is server-side (backend-proxied), not presigned URLs

**Decision**: The Lambda performs every S3 `PutObject`/`GetObject`/`DeleteObject` on the user's
behalf. The client only ever calls the `/notes` API (FR-016).

**Rationale**: Keeps the mandated `S3-PUT → DynamoDB` write ordering (FR-004) inside a single
server-controlled request, and enforces per-user authorization at the API/middleware boundary
(Constitution Principle IV) exactly as the DynamoDB path already does. Presigned URLs would split a
save into a client-orchestrated two-step and move the trust boundary onto URL issuance.

**Alternatives considered**: Presigned upload/download URLs (rejected — weakens ordering + authz, adds
client complexity, no MVP benefit for small Markdown bodies); hybrid proxied-write/presigned-read
(rejected — two code paths, YAGNI).

## §2 — S3 key scheme is derived solely from the resolved `userId`

**Decision**: Object key = `users/${userId}/notes/${noteId}.md`, where `userId` is the app user id
resolved from the gateway-verified `sub` (the same value keying `PK=USER#<userId>` in DynamoDB), and
`noteId` is the note's ULID. Content-Type `text/markdown`.

**Rationale**: Mirrors the repository's existing ownership-by-key rule (notes.repository.ts): a read or
write can only ever address the owner's prefix, so a foreign id cannot reach another user's object.
The path is fully deterministic from metadata already in hand — no extra pointer lookup needed, though
the metadata record still carries an explicit `bodyKey` for clarity and future-proofing (data-model §2).

**Alternatives considered**: Random/opaque object keys stored as a pointer (rejected — needs a stored
key with no isolation benefit and breaks the human-readable `users/<uid>/notes/<id>.md` layout the
user asked for); one bucket-per-user (rejected — bucket sprawl, hard limits, no benefit).

## §3 — Two-store write & delete ordering

**Decision**:
- **Create**: generate ULID → `PutObject` body → `PutItem` metadata. If `PutObject` throws, abort with
  no metadata write (FR-005). A metadata write that fails *after* a successful body PUT leaves an
  orphaned, unreferenced object — invisible and harmless (the reason body-first is correct, FR-010).
- **Update carrying `markdown`** (the content auto-save path, which always sends `{ title, markdown }`):
  `PutObject` body → `UpdateItem` metadata (`updatedAt`, `title`). Body-first preserves FR-004.
- **Update NOT carrying `markdown`** (rename `{ title }`, link change `{ linkedProjectIds? }`): skip
  S3 entirely, `UpdateItem` metadata only (spec Edge Case "title-only change MAY skip S3"). This keeps
  the hot rename/link paths a single cheap DynamoDB write.
- **Delete**: `DeleteItem` metadata first (ownership-guarded) → if it existed, best-effort
  `DeleteObject` on the body, catching and logging any error without failing the operation (FR-008/FR-009).

**Rationale**: Directly encodes the user's mandated ordering; the failure modes all collapse to
"harmless orphaned object" rather than "visible note with no body".

**Alternatives considered**: Transactional/2-phase commit across S3+DynamoDB (rejected — no cross-service
transaction exists; the ordering + best-effort cleanup is the standard idiom); DynamoDB-first writes
(rejected — would allow metadata pointing at a missing body, the exact failure FR-010 forbids).

## §4 — Read path & graceful missing-body degradation

**Decision**: `GET /notes/:id` reads metadata from DynamoDB (ownership-enforced; `null` → `404`), then
`GetObject` the body. On `NoSuchKey`/`NotFound` from S3, return the note with `markdown: ''` rather
than erroring (FR-012). Compose `{ ...metadata, markdown }` and return the full `noteSchema` shape.

**Rationale**: A new endpoint is unavoidable because the Stage 5 frontend obtained bodies from the
`GET /notes` list; that list now returns metadata only (FR-007). Empty-body fallback keeps the notebook
usable if a partial/interrupted write ever leaves metadata without an object.

**Alternatives considered**: Keeping body in the list response (rejected — violates FR-007, defeats the
feature); 404 on missing object (rejected — violates FR-012, blocks the editor).

## §5 — Backend S3 SDK & Lambda bundling

**Decision**: Use `@aws-sdk/client-s3`. Add it to root `package.json` dependencies. The `api-stack`
bundling already externalizes `@aws-sdk/*` (`externalModules: ['@aws-sdk/*', ...]`) because the Node 22
Lambda runtime provides AWS SDK v3 — which **includes** `@aws-sdk/client-s3` — so it is available at
runtime and stays out of the bundle. Instantiate an `S3Client` in the new body repository, honoring an
optional endpoint override for local dev (see §6), consistent with how `notes.repository.ts` handles
`dynamoEndpoint`.

**Rationale**: Matches the existing SDK-v3 + externalize-and-use-runtime pattern already proven for
DynamoDB and Cognito; no bundle-size cost.

**Alternatives considered**: Bundling the S3 client (rejected — unnecessary size, diverges from the
established externalization pattern).

## §6 — Local development S3 (LocalStack)

**Decision**: Add a **LocalStack** service (S3 only) to `apps/backend/docker-compose.yml` alongside
`dynamodb-local` and `cognito-local`. Introduce config `s3Endpoint` (`S3_ENDPOINT`) and
`s3ForcePathStyle` (`S3_FORCE_PATH_STYLE=true` for LocalStack path-style addressing), mirroring the
existing `DYNAMODB_ENDPOINT` override. When `S3_ENDPOINT` is unset (AWS), the client uses default
regional endpoints. The local bucket is auto-created on startup (LocalStack init hook or a one-liner in
`npm run local`).

**Rationale**: LocalStack is the least-friction S3 emulator, fits the existing "fully-local, no AWS
account" dev story, and the endpoint-override shape already exists for DynamoDB, so config stays
uniform.

**Alternatives considered**: MinIO (viable but a second mental model vs. the AWS-shaped LocalStack);
real AWS S3 for local dev (rejected — breaks the offline dev story); filesystem-backed fake for the app
runtime (rejected — only used for unit tests, see §7).

## §7 — Test doubles

**Decision**: For Vitest, add an in-memory **fake S3 client** (a `Map<key, {body, contentType}>` with
`send()` dispatch on `PutObjectCommand`/`GetObjectCommand`/`DeleteObjectCommand`, throwing a
`NoSuchKey`-named error on a missing get), mirroring the established fake DynamoDB doc-client in
`notes.repository.spec.ts` / `projects.repository.spec.ts`. Service tests inject both fakes to assert:
body-first ordering (S3 failure ⇒ no metadata write), delete best-effort (S3 delete failure ⇒ still
success), and missing-object ⇒ empty body. Playwright e2e continues to run the full stack against
LocalStack.

**Rationale**: Reuses a pattern the codebase and the team already trust (recorded in project memory),
keeping unit tests hermetic and fast with no container dependency.

**Alternatives considered**: `aws-sdk-client-mock` library (viable, but the repo's convention is a
hand-rolled fake — consistency wins); hitting LocalStack in unit tests (rejected — slow, non-hermetic).

## §8 — Bucket configuration

**Decision**: One private S3 bucket via CDK: Block Public Access (all), default SSE (S3-managed, `SSE-S3`),
`enforceSSL: true`, versioning **off**, `RemovalPolicy.DESTROY` + `autoDeleteObjects: true` (consistent
with the disposable `WorkBoard` table's `RemovalPolicy.DESTROY`). Bucket name auto-generated by CDK
(no global-name guessing); surfaced to the Lambda via the `WORKBOARD_NOTES_BUCKET` env var and as a
`CfnOutput`. IAM: `bucket.grantReadWrite(handler)` plus delete (grantReadWrite includes
`s3:DeleteObject`), scoped to this bucket only.

**Rationale**: Least-privilege, encrypted, private, and disposable to match the current environment
posture. Versioning is out of scope (no note-history feature — YAGNI, Principle VI).

**Alternatives considered**: Reusing an existing bucket (none exists — frontend moved to Vercel, no S3
web bucket remains); KMS-CMK encryption (rejected — SSE-S3 suffices for MVP, avoids key management).

## §9 — Shared schema split

**Decision**: In `libs/shared/src/schemas/note.ts`, split the shape:
`noteMetadataSchema` = `{ id, title, linkedProjectIds, linkedTaskIds, createdAt, updatedAt, bodyKey }`
(no `markdown`) — the DynamoDB item and the `GET /notes` list element; `noteSchema` =
`noteMetadataSchema.extend({ markdown })` — the full note returned by `POST`, `PATCH`, and
`GET /notes/:id`. `createNoteSchema` / `updateNoteSchema` are unchanged (both already `markdown?`).

**Rationale**: Makes "list is metadata-only" a type-level guarantee (FR-007) shared identically by
backend and frontend (Principle V), instead of returning a dishonest empty `markdown` on list items.

**Alternatives considered**: Keep one `noteSchema` and return `markdown: ''` in lists (rejected —
misleading shape, easy to accidentally treat list bodies as real); a fully separate metadata type not
derived from the note (rejected — duplication; `.extend()` keeps them in lockstep).
