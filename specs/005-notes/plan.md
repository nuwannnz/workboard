# Implementation Plan: Stage 5 — Notes

**Branch**: `005-notes` | **Date**: 2026-07-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-notes/spec.md`

## Summary

Stage 5 delivers WorkBoard's third primary surface — **Notes** — a master-detail Markdown
notebook, and activates the product's **final entity relationship**: notes that link to projects
and tasks. An authenticated user creates notes, selects one to edit its **title** and **Markdown
content** in a WYSIWYG editor that **auto-saves** ~500ms after they stop typing (no explicit
save), links a note to any of their own projects and tasks, sees those links surfaced back on the
project detail and the task dialog, opens a linked note from either side, and renames, searches,
and deletes notes — all scoped to their account and durably persisted.

Technically this stage adds a self-contained **`modules/notes/`** backend module
(routes → controller → service → repository) exposing `GET/POST/PATCH/DELETE /notes`, all behind
the existing `authenticate` + `resolve-identity` middleware (Stage 2's greedy protected
`ANY /{proxy+}` already routes `/notes/*` — **no new infra**). Notes persist as
`PK = USER#<userId>`, `SK = NOTE#<noteId>` items in the same single table, keyed **only** off the
resolved app `userId` so ownership is enforced at the repository with no bypass and a foreign id
resolves as not-found (Principle IV, FR-018). The decisive design choice (research §2) is that the
**Note is the single source of truth for every link**: a note owns `linkedProjectIds` and
`linkedTaskIds`; "which notes link to this project/task" is answered by a **reverse Query** over
the user's own `NOTE#` partition filtered on array membership — **no GSI** and, critically, **no
denormalized copy** on the Task or Project (Principle VI). This directly satisfies the spec's
"single-sourced, not divergent" requirement (FR-013): there is exactly one place a link lives, so
the two sides can never drift, deleting a note removes its links for free (nothing else stores
them, FR-017), and a deleted project/task leaves **no** write to reconcile — its now-unresolvable
id is simply **resolved away at display time** (FR-014). The Task model's existing `linkedNoteIds`
field stays present but **deliberately unused** as an authority (kept `[]`) rather than
duplicated, so no Task/Project write path or cross-module cascade is added on their side.

The one cross-module dependency is **link-target ownership validation**: when a `PATCH /notes/:id`
body **contains link arrays**, the notes service verifies each referenced id belongs to the caller
via the **projects/tasks public service APIs** (the sanctioned service-to-service seam, never
their repositories/domains — Principle I) and rejects a link to an id the user does not own
(FR-018, SC-007). This validation runs **only when links change**, so the hot content auto-save
path (`{title, markdown}` only) stays a single cheap `Update` with no cross-module reads.

The frontend adds a `notes/` feature area rendered at protected `/notes` and `/notes/:id` inside
the existing `AppShell`, built from shadcn/ui and reusing the Stage 2 `api-client`. A
`use-note-editor` hook debounces edits into an auto-save with a visible **saving / saved / error**
status (FR-005/FR-006). The WYSIWYG Markdown editor is the **one justified new dependency** this
stage (research §3). The Projects detail page and the Week task dialog each gain a **Linked notes**
section fed by a reverse-lookup hook. Vitest covers note schema/validation, repository ownership,
notes service CRUD + link-target validation + reverse lookup, the pure link-resolution/dedup
helpers, and the auto-save/status hook; Playwright covers the core Notes flow plus unauthenticated
and cross-user denial.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 LTS; Rust stable (Tauri toolchain, desktop build only) — unchanged from Stage 3/4

**Primary Dependencies**: (inherited) Nx, React 18 + Vite + shadcn/ui + Tailwind, Tauri 2, `react-router-dom` v6, Express 4 + `@codegenie/serverless-express`, `@aws-sdk/lib-dynamodb`, Zod, AWS CDK v2, Vitest, Playwright, `amazon-cognito-identity-js`, `@dnd-kit/*`, `ulid` (backend id generation — reused for `noteId`). **One new frontend dependency** is added for the Markdown WYSIWYG editor (research §3): the recommended choice is **TipTap** (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm`) plus a Markdown serializer (`tiptap-markdown`). This is the single place Stage 5 genuinely requires a dependency (FR-004); everything else reuses existing infrastructure (Principle VI).

**Storage**: DynamoDB single-table `WorkBoard` (`PK`/`SK`), accessed only through the Repository layer. **New Note item**: `PK = USER#<userId>`, `SK = NOTE#<noteId>` (noteId = ULID), attributes `title` (may be empty), `markdown`, `linkedProjectIds` (`string[]`), `linkedTaskIds` (`string[]`), `createdAt`, `updatedAt`. A note is the **sole store** of its links. The user's notes list is one `Query` (`begins_with(SK, 'NOTE#')`); the reverse "notes linked to project/task X" is the **same Query** filtered on array membership (`contains(linkedProjectIds, :id)` / `contains(linkedTaskIds, :id)`) — no GSI (research §2). **Task and Project items are unchanged**; `linkedNoteIds` stays present but is not written to.

**Testing**: Vitest unit/integration (note schema validation incl. empty title; notes repository ownership + not-found + reverse membership query; notes service create/edit/delete, **link-target ownership validation** via projects/tasks service seam, and reverse lookup; pure link-resolution + dedup + stale-prune helpers; the debounced auto-save + save-status hook with fake timers); Playwright e2e for the core Notes flow (create → auto-save → link a project & task → see/open from the project & task → rename → delete with link cleanup) and rejection cases (unauthenticated, cross-user)

**Target Platform**: Browser/installable PWA and native desktop (Tauri) frontend; AWS Lambda behind API Gateway backend; Cognito user pool as identity provider — unchanged

**Project Type**: Nx monorepo — web frontend + serverless backend + IaC + shared library (multi-package), unchanged

**Performance Goals**: No new runtime performance targets. UX targets from spec: create a note and begin writing in under 10 seconds (SC-001); content auto-saves within ~1s of a pause (SC-002) and is debounced so rapid typing yields one save, never a save per keystroke (SC-009). Each note request costs one DynamoDB `Query`/`Put`/`Update`/`Delete`; the reverse linked-notes lookup costs one `Query`. Content auto-save is a single `Update` with **no** cross-module reads (validation only fires when link arrays are in the body).

**Constraints**: Feature data owned by the app `userId` (UUID) resolved from the gateway-verified `sub`; the notes repository builds `PK` solely from that resolved id, never caller input (Principle IV, FR-018). A note's `title` is **optional** (empty → shown as "Untitled"); an empty note is valid (FR-008). Links are **single-sourced on the note** and bidirectional in the experience, de-duplicated, and validated to the owner's own projects/tasks on write (FR-009/FR-010/FR-013/FR-018). Stale links (deleted project/task) are **resolved away at display time**, never shown broken and never blocking note load (FR-014). Deleting a note removes its links implicitly (nothing else stores them, FR-017); deleting a project/task requires **no** write to notes. The cross-module link-target validation goes through the projects/tasks modules' **public service APIs**, never their repositories/domains (Principle I). Last-write-wins concurrency, no real-time sync. Single shared frontend across PWA + desktop, responsive, shared design system (FR-019).

**Scale/Scope**: Single-developer/personal MVP; one environment. Adds a `notes` backend module (routes/controller/service/repository), replaces the Stage 1 `note` shared-schema stub with the full domain shape + request schemas, adds a `notes/` frontend feature area (master-detail page, notes list with create/search, note editor with WYSIWYG + auto-save + save-status, link panel + picker), extends the Projects detail page and the Week task dialog with a **Linked notes** section, extends the router + nav to make Notes a live surface, and adds e2e coverage. No infra change (the Stage 2 protected proxy already covers `/notes/*`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Stage 5 obligation | Compliance in this plan |
|-----------|--------------------|--------------------------|
| I. Layered, Feature-Modular Backend | Notes as a self-contained layered module; no logic in routes/controllers; no cross-module reach-in | New `modules/notes/` holds `notes.routes.ts` → `notes.controller.ts` (thin: reads `req.auth.userId` + validated body) → `notes.service.ts` (CRUD + link-target validation + reverse lookup orchestration) → `notes.repository.ts` (ownership-enforced access). The one cross-module interaction — validating that a link target belongs to the caller — consumes the **projects/tasks public service APIs** (`ProjectsService.getById`, a tasks existence check via `TasksService`), the sanctioned seam; the notes module never imports the projects/tasks **repository or domain internals**. Tasks/Projects modules are **not modified** (single-source-on-note means no denormalized write on their side). |
| II. Shared Frontend, One Codebase | One React/shadcn Notes UX across PWA + Tauri, responsive; platform code behind adapters | The master-detail notes page, list, WYSIWYG editor, save-status, and link panel/picker are built once from shadcn/ui inside the existing shared `AppShell`; the Projects detail and Week task dialog gain a shared **Linked notes** section. No platform fork. The two-pane layout collapses responsively on smaller viewports (FR-019). The identity/ownership boundary stays entirely server-side — the client never sees `sub`/`userId`. |
| III. Test-First Discipline (NON-NEGOTIABLE) | Vitest + Playwright written before/with implementation; CI green; **Note auto-save** is priority e2e | Tests-first per task ordering: note schema + empty-title validation (Vitest), notes repository ownership + not-found + reverse membership query (Vitest), notes service CRUD + **link-target ownership validation** + reverse lookup (Vitest), pure link-resolve/dedup/stale-prune (Vitest), the **debounced auto-save + save-status** hook with fake timers (Vitest), then the full create → auto-save → link → see/open from work → rename → delete-with-cleanup Playwright e2e + unauthenticated + cross-user denial. Note auto-save is named priority coverage in the constitution. CI blocks merge. |
| IV. Data Isolation & Auth Boundary | Access authenticated at the boundary before controllers; ownership at Repository; no secrets committed | `/notes/*` sits behind the existing API Gateway Cognito authorizer (Stage 2), then `authenticate` + `resolve-identity`. The notes repository builds `PK = USER#<userId>` solely from the resolved app id — never caller input — so a note read/write can only reach the owner's partition and a foreign `noteId` resolves as not-found (FR-018, SC-007). The reverse linked-notes Query is likewise owner-partition-scoped, and link targets are validated to the owner's own projects/tasks so a note can never link to another user's data. No credentials/secrets in source, DB, or bundle. |
| V. Infrastructure as Code & Single Nx Graph | Any infra/config change via CDK; all tasks via Nx targets; shared types in one graph | **No new AWS resources** — Stage 2's protected `ANY /{proxy+}` already routes `/notes/*` through the authorizer to the one Lambda; Notes live in the same single table (no GSI — research §2). The full Note + request shapes live in `libs/shared` and are imported by both sides. Every build/lint/test/e2e runs through existing Nx targets. The one new **frontend** dependency (WYSIWYG editor) is registered in the workspace and used only by the notes feature. |
| VI. Simplicity & Scope Discipline (YAGNI) | Only notes + the note↔project/task relationship; nothing speculative | **Single-source-on-note** removes an entire class of complexity: no denormalized `linkedNoteIds` writes on tasks/projects, no cross-module cascade on project/task delete, no divergence-reconciliation. Reverse lookup **filters the user partition** (no GSI). Stale links are **resolved at display time** (no cleanup job, no broken-link records). Content auto-save is one `Update` with no cross-module reads. The only new dependency is the WYSIWYG editor that FR-004 concretely requires. Title search is client-side over the already-loaded list; content search is deferred. No Overview/aggregation work. `linkedNoteIds` on Task stays present but unpopulated. |

**Result**: PASS — no violations. The single cross-module interaction (link-target ownership validation) is a deliberate, current requirement (FR-018) satisfied through the projects/tasks modules' public service APIs — the sanctioned seam — not by reaching into their internals, and it runs only when links change. Complexity Tracking is intentionally empty.

## Project Structure

### Documentation (this feature)

```text
specs/005-notes/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── notes-api.md              # Backend REST surface for notes + reverse linked-notes lookup
│   └── notes-client-contract.md  # Frontend notes data + auto-save + link + linked-notes contract
├── checklists/          # (existing) requirements checklist
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
apps/
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── router.tsx                # EXTEND: mount Notes at protected "/notes" and "/notes/:id"
│       │   └── nav-items.ts              # EXTEND: give the "notes" nav item `to: '/notes'`
│       ├── projects/
│       │   └── project-detail-page.tsx   # EXTEND: add a "Linked notes" section (reverse lookup → open note)
│       ├── week/
│       │   └── task-detail-dialog.tsx    # EXTEND: add a "Linked notes" section (reverse lookup → open note)
│       └── notes/                        # NEW: Notes feature area (shared UI)
│           ├── notes-page.tsx            # master-detail shell: list pane + editor pane; selects a note (route :id)
│           ├── notes-list.tsx            # master pane: note list, create control, title search/filter, empty state
│           ├── note-editor.tsx           # detail pane: title field + markdown editor + save-status + links panel
│           ├── markdown-editor.tsx       # WYSIWYG wrapper around the editor lib; value is markdown (source of truth)
│           ├── save-status.tsx           # saving / saved / unsaved / error indicator (FR-006)
│           ├── note-links-panel.tsx      # shows a note's linked projects & tasks; add/remove; resolves stale links
│           ├── note-link-picker.tsx      # search/select the user's own projects & tasks to link (dedup)
│           ├── linked-notes-section.tsx  # reusable "Linked notes" list for the project detail + task dialog
│           ├── use-notes.ts              # data hook: list/create/delete notes, optimistic + rollback
│           ├── use-note-editor.ts        # selected-note editing + debounced ~500ms auto-save + status machine
│           ├── use-linked-notes.ts       # reverse-lookup hook: notes linked to a given projectId / taskId
│           ├── notes-client.ts           # typed wrapper over the shared api-client for /notes endpoints
│           └── note-links.ts             # pure helpers: dedup, resolve link ids → known projects/tasks, prune stale
└── backend/
    └── src/
        ├── app.ts                        # EXTEND: mount notes router behind authenticate + resolve-identity
        └── modules/
            └── notes/                    # NEW: self-contained notes module
                ├── notes.routes.ts        #   GET /notes, POST /notes, PATCH /notes/:id, DELETE /notes/:id
                ├── notes.controller.ts    #   thin: validate (Zod) + read req.auth.userId, delegate to service
                ├── notes.service.ts       #   create/list/edit/delete + link-target validation + reverse lookup
                └── notes.repository.ts     #   ownership-enforced access: PK=USER#<userId>, SK=NOTE#<id>

libs/shared/
└── src/schemas/
    └── note.ts                            # REPLACE stub: full Note shape (empty-title-allowed, timestamps,
                                           #   linkedProjectIds/linkedTaskIds) + createNoteSchema + updateNoteSchema

apps/frontend-e2e/src/                      # NEW e2e: notes core flow, unauthenticated denial, cross-user denial
```

**Structure Decision**: Reuse the Stage 3/4 Nx layout unchanged. The backend gains one
self-contained `modules/notes/` (Principle I) mounted behind the existing `authenticate` +
`resolve-identity` middleware in `app.ts`. Because Stage 2 already routes the greedy protected
proxy through the Cognito authorizer, **no `apps/infra` change is needed** (Principle IV/V). The
notes module depends on the projects/tasks modules only through their **public service APIs** for
link-target ownership validation (never their repositories/domains — Principle I); the tasks and
projects modules themselves are **not modified**, because links are single-sourced on the note
(research §2). The frontend `notes/` feature area renders inside the existing shared `AppShell` so
PWA and Tauri share one codebase and design system (Principle II), reusing the Stage 2
`api-client`; the reusable `linked-notes-section` is dropped into the Projects detail page and the
Week task dialog. Link resolution/dedup and the auto-save/status logic are isolated as pure
modules / a focused hook so they unit-test independently of React and DynamoDB (Principle III).
The full Note request/response shapes live in `libs/shared` so frontend and backend validate
identically (Principle V).

## Complexity Tracking

> No Constitution Check violations. The single cross-module interaction (link-target ownership
> validation) is a current, concrete requirement (FR-018) satisfied through the projects/tasks
> modules' public service APIs — the sanctioned collaboration seam — not by reaching into their
> repositories or domains, and it runs only when a note's link arrays change. The deliberate
> **single-source-on-note** decision (research §2) removes rather than adds complexity: no
> denormalized link copies, no cross-module cascade on project/task delete, no divergence to
> reconcile, no GSI. This section is intentionally empty.
