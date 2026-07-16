# Contract: Note Body Store (S3) + Bucket

Backend repository-layer contract for the note **body** object. Lives in the notes module as
`note-body.repository.ts`, sibling to `notes.repository.ts`, and follows the same ownership-by-key
rule. Only `NotesService` calls it.

## Interface

```text
NoteBodyStore
  putBody(userId, noteId, markdown): Promise<void>      // PutObject users/<userId>/notes/<noteId>.md, Content-Type text/markdown
  getBody(userId, noteId): Promise<string>              // GetObject → string; NoSuchKey/NotFound ⇒ '' (FR-012)
  deleteBody(userId, noteId): Promise<void>             // DeleteObject; caller wraps best-effort (FR-009)
  keyFor(userId, noteId): string                        // → `users/${userId}/notes/${noteId}.md`
```

## Rules

- The object key is built **solely** from the resolved `userId` and `noteId` — never from any
  client-supplied value (Principle IV; mirrors `notes.repository.ts`). A foreign id therefore can only
  ever address the caller's own prefix.
- `getBody` MUST translate a missing object (`NoSuchKey` / `NotFound` / HTTP 404) into an **empty
  string**, not an error (FR-012). Any other S3 error propagates.
- `putBody` and `deleteBody` propagate S3 errors to the service, which applies the ordering /
  best-effort policy (research §3). The store itself does not swallow errors except the missing-object
  case in `getBody`.
- Client construction honors an optional endpoint override for local dev (`S3_ENDPOINT`,
  `S3_FORCE_PATH_STYLE`), consistent with `notes.repository.ts`'s `dynamoEndpoint` handling.

## Ordering owned by `NotesService` (not the store)

| Operation | Sequence |
|-----------|----------|
| create | `putBody` → `repo.put(metadata)` (abort on body failure) |
| update w/ `markdown` | `putBody` → `repo.update(metadata)` |
| update w/o `markdown` | `repo.update(metadata)` only |
| read one | `repo.getById` → `getBody` (compose) |
| delete | `repo.delete(metadata)` → best-effort `getBody`-independent `deleteBody` (log on failure) |

## Bucket (CDK — `apps/infra`)

| Setting | Value |
|---------|-------|
| Access | Block Public Access: ALL |
| Encryption | SSE-S3 (S3-managed); `enforceSSL: true` |
| Versioning | Off (no note history — YAGNI) |
| Removal | `RemovalPolicy.DESTROY` + `autoDeleteObjects: true` (disposable env, matches `WorkBoard` table) |
| Name | CDK-auto-generated; surfaced via `WORKBOARD_NOTES_BUCKET` env + `CfnOutput` |
| IAM | `bucket.grantReadWrite(handler)` (includes `s3:DeleteObject`), this bucket only |

## Local dev (LocalStack)

- `docker-compose.yml` adds a LocalStack S3 service; `S3_ENDPOINT=http://localhost:4566` and
  `S3_FORCE_PATH_STYLE=true` in `apps/backend/.env`; the local bucket is auto-created on startup.
- `WORKBOARD_NOTES_BUCKET` is set to the local bucket name for `npm run local`.
