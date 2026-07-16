# Implementation Plan: Store Note Body in S3

**Branch**: `007-note-body-s3-storage` | **Date**: 2026-07-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-note-body-s3-storage/spec.md`

## Summary

Split note persistence into two stores: DynamoDB keeps only note **metadata** (id, title, timestamps,
project/task links) and each note's Markdown **body** is written as a single object in a new,
CDK-managed S3 bucket at `users/<userId>/notes/<noteId>.md`. All object I/O is **backend-proxied**
(clarification 2026-07-16): the client only ever calls the existing `/notes` API; the Lambda reads
and writes S3 on the user's behalf, keeping the `S3-PUT → DynamoDB` write ordering and the per-user
authorization boundary server-side.

The decisive constraint discovered from the Stage 5 code: today `GET /notes` returns **full note
bodies** and the editor edits the in-memory list item — there is **no per-note fetch**. Moving the
body out of the list response therefore requires a **new `GET /notes/:id`** endpoint that returns
metadata + body, a **metadata-only** list response, and a frontend change so selecting a note fetches
its body on demand. Write ordering (create/update), metadata-first-then-best-effort delete, and
graceful degradation when a body object is missing complete the change. Legacy notes are **not**
migrated — the current inline-body notes are throwaway test data, deleted at cutover.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 (Lambda runtime `NODEJS_22_X`); React frontend shared across PWA + Tauri.

**Primary Dependencies**: Express.js (single Lambda via `@codegenie/serverless-express`), **`@aws-sdk/client-s3` (new)**, `@aws-sdk/lib-dynamodb` + `@aws-sdk/client-dynamodb`, AWS CDK (`aws-cdk-lib` — `aws-s3`), Zod (shared schemas), Vitest, Playwright, Nx.

**Storage**: DynamoDB single-table `WorkBoard` (metadata only, unchanged key scheme `PK=USER#<uid>`, `SK=NOTE#<id>`) **+** new S3 bucket for note bodies keyed `users/<uid>/notes/<id>.md`.

**Testing**: Vitest unit/integration (fake in-memory S3 client mirroring the existing fake DynamoDB doc-client pattern), Playwright e2e (existing `notes-core-flow` / `notes-rejections` must still pass, plus a large-body round-trip).

**Target Platform**: AWS Lambda + API Gateway (backend), Vercel (frontend static hosting), Tauri desktop; local dev via `docker-compose` (DynamoDB Local, Cognito Local, **+ LocalStack S3**).

**Project Type**: Nx monorepo web application — `apps/backend` (Express), `apps/frontend` (React), `apps/infra` (CDK), `libs/shared` (Zod schemas/types).

**Performance Goals**: List load stays a single DynamoDB Query with **zero** body bytes transferred (FR-007); opening a note adds exactly one S3 `GetObject`; a content auto-save is one S3 `PutObject` + one DynamoDB `UpdateItem`.

**Constraints**: Strict write ordering S3 `PutObject` → DynamoDB write (FR-004); metadata-first, best-effort body delete (FR-008/FR-009); per-user S3 key isolation with server-side-only access (FR-011/FR-016); graceful empty-body degradation on missing object (FR-012); body size no longer bounded by DynamoDB's 400 KB item limit (FR-013).

**Scale/Scope**: Personal-productivity MVP; single user's notebook (tens–low-hundreds of notes). One new bucket, one new endpoint, one new backend repository class, schema split in `libs/shared`, and frontend select-to-fetch rewiring.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|-----------|------------|
| **I. Layered, Feature-Modular Backend** | ✅ S3 access is confined to a new repository-layer class (`note-body.repository.ts`) inside the **notes** module; `NotesService` orchestrates the two-store ordering; controller/routes stay thin. No module reaches into another module's internals. |
| **II. Shared Frontend, One Codebase** | ✅ Change is in the shared `apps/frontend/src/notes` layer (select-to-fetch of body); no platform fork; existing shadcn components reused. |
| **III. Test-First Discipline** | ✅ Body-store, service ordering, delete best-effort, and missing-body paths get Vitest coverage with a fake S3 client written before implementation; Playwright notes flows extended. |
| **IV. Data Isolation & Auth Boundary** | ✅ S3 key is built **solely** from the resolved `userId` (never caller input), mirroring the DynamoDB key rule; all body I/O is backend-only (FR-016, no presigned URLs); IAM grants the Lambda role bucket access only. |
| **V. IaC & Single Source of Deployment** | ✅ Bucket + IAM defined in CDK (`apps/infra`); env var wired through the stack; all build/test via Nx targets. |
| **VI. Simplicity & Scope Discipline (YAGNI)** | ✅ No presigned URLs, no content-search index, no migration/backfill, single bucket, best-effort delete (no orphan-reaper), body is single-sourced in S3 (no cache). |

**Result**: PASS — no violations. Complexity Tracking left empty.

## Project Structure

### Documentation (this feature)

```text
specs/007-note-body-s3-storage/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── notes-api.md      # Updated REST surface (adds GET /notes/:id; metadata-only list)
│   └── note-body-store.md# S3 object layout + body-store interface contract
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit-specify + /speckit-clarify)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
libs/shared/src/schemas/
└── note.ts                       # SPLIT: noteMetadataSchema (no markdown) + noteSchema (metadata + markdown)

apps/backend/src/
├── shared/config.ts              # ADD: notesBucket, s3Endpoint, s3ForcePathStyle
└── modules/notes/
    ├── note-body.repository.ts   # NEW: S3-backed body store (put/get/delete by userId+id)
    ├── note-body.repository.spec.ts  # NEW: fake S3 client tests
    ├── notes.repository.ts       # EDIT: persist/return metadata only (drop markdown attribute)
    ├── notes.service.ts          # EDIT: orchestrate S3-first write ordering, getById+body, delete ordering
    ├── notes.service.spec.ts     # EDIT: ordering, missing-body, best-effort-delete cases
    ├── notes.controller.ts       # EDIT: add getOne handler; list returns metadata
    └── notes.routes.ts           # EDIT: add GET /notes/:id

apps/frontend/src/notes/
├── notes-client.ts               # EDIT: listNotes → NoteMetadata[]; add getNote(id): Note
├── use-notes.ts                  # EDIT: metadata list; fetch body on select
├── use-note-editor.ts            # EDIT: seed buffer from fetched full note (async body load)
└── notes-page.tsx / note-editor.tsx  # EDIT: body-loading state while GET /notes/:id resolves

apps/infra/lib/
├── data-stack.ts                 # (unchanged table) — or sibling notes-bucket construct
├── notes-bucket-stack.ts         # NEW: private S3 bucket (block public access, SSE, RemovalPolicy)
├── api-stack.ts                  # EDIT: pass bucket; grant RW+delete; set WORKBOARD_NOTES_BUCKET env
└── workboard-stack.ts            # EDIT: instantiate bucket, wire into ApiStack

apps/backend/docker-compose.yml   # EDIT: add LocalStack S3 service for local dev
```

**Structure Decision**: Nx monorepo web-application layout (frontend + backend + infra + shared).
The change is contained to the existing **notes** backend module (new repository sibling to
`notes.repository.ts`, following the same ownership-by-key discipline), the shared note schema
(`libs/shared`), the notes frontend feature folder, and the CDK infra. No new top-level project.

## Complexity Tracking

> No Constitution violations — section intentionally empty.
