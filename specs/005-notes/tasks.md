---
description: "Task list for Stage 5 — Notes"
---

# Tasks: Stage 5 — Notes

**Input**: Design documents from `/specs/005-notes/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/notes-api.md, contracts/notes-client-contract.md

**Branch**: `005-notes`

**Tests**: Included — the spec (FR-020) and plan (Principle III, Test-First, NON-NEGOTIABLE) explicitly require Vitest unit/integration coverage and Playwright e2e for the core flow, unauthenticated access, and cross-user denial. **Note auto-save** is named priority coverage in the constitution. Test tasks are written before their implementation within each story.

**Organization**: Tasks are grouped by user story so each story can be implemented, tested, and delivered independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Every task includes an exact file path

## Path Conventions

Nx monorepo (plan Structure Decision):
- Backend: `apps/backend/src/`
- Frontend (shared PWA + Tauri): `apps/frontend/src/`
- Shared schemas: `libs/shared/src/schemas/`
- E2E: `apps/frontend-e2e/src/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the working branch, scaffold the new module/feature directories, and add the one new dependency this stage requires — the WYSIWYG Markdown editor (plan Technical Context, research §3).

- [X] T001 Confirm the working branch is `005-notes` (not `main`) and that `git status` shows the Stage 5 spec dir; run a baseline `npx nx run-many -t lint test -p shared backend frontend` and confirm it is green before starting.
- [X] T002 [P] Create the backend module directory `apps/backend/src/modules/notes/` (populate the `.gitkeep` placeholder area in Phase 2) per plan Project Structure.
- [X] T003 [P] Create the frontend feature directory `apps/frontend/src/notes/` (empty, to be populated per story) per plan Project Structure.
- [X] T004 Add the WYSIWYG Markdown editor dependency at the repo root (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm`, and `tiptap-markdown`), register it in the Nx workspace (`package.json`), and run `npm install` (research §3 — the single new dependency this stage; used only by the notes feature, Principle VI).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The full shared Note schema and the notes backend module skeleton wired into the app. These block every user story (US1–US5 all depend on the Note shape and the mounted router).

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T005 [P] Replace the Stage 1 Note stub in `libs/shared/src/schemas/note.ts` with the full domain shape: `id`, `title` (string, **empty allowed** — drop the `min(1)`, default `''`), `markdown` (string, default `''`), `linkedProjectIds` (`string[]`, default `[]`), `linkedTaskIds` (`string[]`, default `[]`), `createdAt`, `updatedAt`; add `createNoteSchema` (`{ title?, markdown? }`, both optional) and `updateNoteSchema` (all of `{ title?, markdown?, linkedProjectIds?, linkedTaskIds? }` optional, `title` may be empty) with exported `Note`/`CreateNoteInput`/`UpdateNoteInput` types (data-model.md §Entity: Note). The existing `libs/shared/src/index.ts` wildcard already re-exports these.
- [X] T006 [P] Add unit tests for the Note schema in `libs/shared/src/schemas/note.spec.ts`: an **empty** `title` is valid (FR-008); `createNoteSchema` accepts an empty `{}` body (auto-save-first create); `updateNoteSchema` allows partial bodies including link arrays; `linkedProjectIds`/`linkedTaskIds` default to `[]` (data-model.md Validation rules).
- [X] T007 Scaffold the notes module in `apps/backend/src/modules/notes/`: `notes.repository.ts`, `notes.service.ts`, `notes.controller.ts`, and `notes.routes.ts` (factory `notesRoutes(authenticate, resolveIdentity)` mirroring `projects.routes.ts`), with typed method signatures and stubbed bodies per contracts/notes-api.md.
- [X] T008 Mount the notes router behind `authenticate` + `resolveIdentity` in `apps/backend/src/app.ts` (add `app.use(notesRoutes(authenticate, resolveIdentity))` alongside the projects router; Stage 2's protected proxy already routes `/notes/*` — no infra change).

**Checkpoint**: Shared Note shape exists and validates identically on both sides; `/notes/*` is routed and protected. User stories can now begin.

---

## Phase 3: User Story 1 - Create, browse & select notes (Priority: P1) 🎯 MVP

**Goal**: An authenticated user opens `/notes`, sees their notes as a list beside an editor pane (or an empty state), creates a note that appears immediately and persists, and selects any note to load it into the editor — all scoped to their account.

**Independent Test**: Log in, open `/notes`, create a note, confirm it appears in the list and opens in the editor; create a second and switch between them; confirm they survive reload and are invisible to a second account.

### Tests for User Story 1

> Write these FIRST and ensure they FAIL before implementing.

- [X] T009 [P] [US1] Notes repository ownership/not-found tests in `apps/backend/src/modules/notes/notes.repository.spec.ts`: `put`/`list`/`getById` build `PK = USER#<userId>`, `SK = NOTE#<id>` solely from the passed `userId`; a list returns only that owner's `NOTE#` items; a read for a foreign id resolves as not-found — no disclosure (FR-018, SC-007). Use the fake DynamoDB doc-client pattern from `projects.repository.spec.ts`.
- [X] T010 [P] [US1] Notes service create/list tests in `apps/backend/src/modules/notes/notes.service.spec.ts`: `createNote` assigns a ULID `id`, defaults `title`/`markdown` to `''` and link arrays to `[]`, sets `createdAt`/`updatedAt`, and accepts an empty input (FR-008); `listNotes` returns notes sorted by `updatedAt` descending then `id` (research §1).
- [X] T011 [P] [US1] `use-notes` hook test in `apps/frontend/src/notes/use-notes.spec.tsx`: loads `listNotes()` on mount; optimistic `createNote()` prepends a note immediately, selects it, and rolls back on rejection surfacing an error (FR-018, client contract §Master-detail surface).

### Implementation for User Story 1

- [X] T012 [US1] Implement `notes.repository.ts` in `apps/backend/src/modules/notes/`: `put(userId, note)`, `list(userId)` (Query `PK = USER#<userId>`, `begins_with(SK,'NOTE#')`), `getById(userId, id)`, using the shared doc client; key built only from `userId`; `PK`/`SK` never returned (data-model.md Persisted item).
- [X] T013 [US1] Implement `notes.service.ts` create/list in `apps/backend/src/modules/notes/`: `createNote(userId, input)` validates with `createNoteSchema`, generates a ULID `id`, defaults title/markdown/links, sets timestamps; `listNotes(userId)` returns notes recency-sorted (`updatedAt` desc, `id` tiebreak).
- [X] T014 [US1] Implement `notes.controller.ts` `GET /notes` (list mode) and `POST /notes` in `apps/backend/src/modules/notes/`: read only `req.auth.userId`, validate body, delegate to the service, return `200 { notes }` / `201 Note`, `400` on invalid body (contracts/notes-api.md uniform responses).
- [X] T015 [US1] Wire `GET /notes` and `POST /notes` in `apps/backend/src/modules/notes/notes.routes.ts` behind the injected middleware.
- [X] T016 [P] [US1] Implement `notes-client.ts` in `apps/frontend/src/notes/`: typed `NotesClient` over the shared `api-client` — `listNotes()` (GET → `{ notes }`) and `createNote(input?)` (POST → 201), every non-2xx rejects, responses parsed with `noteSchema` (client contract §Data client).
- [X] T017 [US1] Implement `use-notes.ts` in `apps/frontend/src/notes/`: load list on mount (`notes`, `loadStatus`, `error`, `reload`); optimistic `createNote` with snapshot rollback; expose the selected-note id (client contract §Master-detail surface).
- [X] T018 [P] [US1] Implement `notes-list.tsx` in `apps/frontend/src/notes/`: master pane rendering the recency-ordered notes with an empty-title note shown as **"Untitled"** (display-only, FR-008), an empty state with a "New note" control, and selection navigating to `/notes/:id` (client contract §Notes list).
- [X] T019 [P] [US1] Implement `note-editor.tsx` in `apps/frontend/src/notes/` as the detail pane showing the selected note's title and content (a plain read/display for now; the WYSIWYG editor + auto-save replace the body in US2), plus a defined "no note selected" state.
- [X] T020 [US1] Implement `notes-page.tsx` in `apps/frontend/src/notes/` (master-detail shell: `notes-list` + `note-editor`, selection driven by the route `:id`, responsive collapse on small viewports), mount `/notes` and `/notes/:id` inside the protected `AppShell` `<Outlet/>` in `apps/frontend/src/app/router.tsx`, and set `to: '/notes'` on the `notes` item in `apps/frontend/src/app/nav-items.ts` so it becomes an active sidebar link (client contract §Routing).

**Checkpoint**: US1 is fully functional — create/list/select notes, scoped and persisted, with an empty state. MVP shell demonstrable.

---

## Phase 4: User Story 2 - Edit with Markdown WYSIWYG + auto-save (Priority: P1)

**Goal**: With a note open, the user edits its title and writes Markdown content in a WYSIWYG editor; changes auto-save ~500ms after they pause (no explicit save), with a visible saving/saved/error status, debounced so rapid typing yields one save and never loses the latest content.

**Independent Test**: Open a note, type a title and formatted Markdown; stop typing and confirm it persists (reload) with formatting intact and no explicit save; type rapidly and confirm a single debounced save; simulate a save failure and confirm a non-silent error state that keeps edits.

### Tests for User Story 2

> Write these FIRST and ensure they FAIL before implementing.

- [X] T021 [P] [US2] `use-note-editor` tests in `apps/frontend/src/notes/use-note-editor.spec.tsx` (fake timers): edits move `idle → dirty`, a ~500ms pause fires one `PATCH { title?, markdown? }` and moves to `saving → saved` (FR-005); rapid edits reset the timer to a single save (SC-009); an edit during an in-flight save schedules a follow-up so the **latest content wins** (edge case: auto-save race); a failed save moves to `error`, keeps the unsaved buffer, and retries on the next edit (FR-006).
- [X] T022 [P] [US2] `markdown-editor` round-trip test in `apps/frontend/src/notes/markdown-editor.spec.tsx`: mounting with Markdown input renders it WYSIWYG and emits equivalent Markdown on change for heading, bold/italic, bullet & numbered list, and link (FR-004, research §3).

### Implementation for User Story 2

- [X] T023 [US2] Add `update(userId, id, patch)` to `apps/backend/src/modules/notes/notes.repository.ts`: partial in-place `UpdateCommand` with an `attribute_exists(PK)` guard (a foreign/missing id → `null`), returning the full updated note; `PK`/`SK` never returned (data-model.md Persisted item, mirrors `projects.repository.ts`).
- [X] T024 [US2] Add `updateNote(userId, id, patch)` to `apps/backend/src/modules/notes/notes.service.ts` for the **content/title path** (`{ title?, markdown? }`): bump `updatedAt`; return the updated note or `null` for a foreign/missing id. No link validation on this path (research §5).
- [X] T025 [US2] Implement `PATCH /notes/:id` in `apps/backend/src/modules/notes/notes.controller.ts` and wire it in `notes.routes.ts`: validate with `updateNoteSchema`, `200` updated Note, `404` for a non-owner id (no disclosure), `400` on invalid body (contracts/notes-api.md).
- [X] T026 [P] [US2] Extend `apps/frontend/src/notes/notes-client.ts` with `updateNote(id, patch)` (PATCH → 200, rejects on non-2xx; a `400 InvalidLinkTarget` rejects distinctly for later link use) (client contract §Data client).
- [X] T027 [P] [US2] Implement `markdown-editor.tsx` in `apps/frontend/src/notes/`: a WYSIWYG wrapper around TipTap (`@tiptap/react` + StarterKit) with `tiptap-markdown`, whose `value`/`onChange` are **Markdown** (the stored source of truth); styled with the shared design system (FR-004, research §3).
- [X] T028 [P] [US2] Implement `save-status.tsx` in `apps/frontend/src/notes/`: render the status machine (`Saving…` / `Saved` / `Unsaved changes` / `Couldn't save — retry`) from shared design tokens (FR-006).
- [X] T029 [US2] Implement `use-note-editor.ts` in `apps/frontend/src/notes/`: hold the editing buffer for the selected note, debounce ~500ms → `updateNote({ title?, markdown? })`, drive the `idle → dirty → saving → saved | error` status machine, schedule a follow-up save on edits during an in-flight save (latest-wins), and keep the buffer on failure (FR-005/FR-006, SC-009, research §6).
- [X] T030 [US2] Wire `markdown-editor` + `save-status` + `use-note-editor` into `apps/frontend/src/notes/note-editor.tsx` (replacing the US1 read/display body): title input + WYSIWYG body + save-status; edits trigger the debounced auto-save (client contract §Editor & auto-save).

**Checkpoint**: US1 + US2 form the minimum viable Notes feature — a persistent Markdown notebook with trustworthy auto-save.

---

## Phase 5: User Story 3 - Link a note to projects & tasks (Priority: P2)

**Goal**: From an open note, link it to one or more of the user's own projects and tasks (offered from their data only, de-duplicated, validated server-side), see the note's linked projects/tasks with stale links resolved away, and add/remove links.

**Independent Test**: Open a note, link a project and a task (both persist across reload), attempt a duplicate (prevented), remove a link (gone, project/task untouched); confirm the picker only offers the user's own data and a foreign id is rejected.

### Tests for User Story 3

> Write these FIRST and ensure they FAIL before implementing.

- [X] T031 [P] [US3] Notes service link-validation tests in `apps/backend/src/modules/notes/notes.service.spec.ts`: an `updateNote` carrying `linkedProjectIds`/`linkedTaskIds` validates each id against the owner's own projects/tasks via the **projects/tasks public service APIs** and rejects a foreign/unknown id as `InvalidLinkTarget` (listing offending ids); arrays are **de-duplicated**; a content-only patch performs **no** link validation (FR-009/FR-010/FR-018, SC-007, research §5). Assert the notes module calls the projects/tasks **services**, never their repositories/domains (Principle I).
- [X] T032 [P] [US3] `note-links` pure-helper tests in `apps/frontend/src/notes/note-links.spec.ts`: `dedup` removes repeats; `resolve` maps link ids to known projects/tasks and **omits** ids that no longer resolve (stale — FR-014); `pruneStale` drops unresolved ids from an array (research §4).

### Implementation for User Story 3

- [X] T033 [US3] Extend `updateNote` in `apps/backend/src/modules/notes/notes.service.ts`: when the patch contains `linkedProjectIds` and/or `linkedTaskIds`, de-duplicate and validate every id via `ProjectsService.getById(userId, id)` and a `TasksService` ownership/existence check (public APIs only — Principle I), throwing a typed `InvalidLinkTarget` error listing offending ids; persist no partial link set (research §5).
- [X] T034 [US3] Extend `apps/backend/src/modules/notes/notes.controller.ts` `PATCH /notes/:id` to map an `InvalidLinkTarget` service error to `400 { error: 'InvalidLinkTarget', details }` (contracts/notes-api.md).
- [X] T035 [P] [US3] Implement `note-links.ts` in `apps/frontend/src/notes/`: pure `dedup`, `resolve(ids, projects|tasks)`, and `pruneStale` helpers, unit-testable independently of React (research §4).
- [X] T036 [P] [US3] Implement `note-link-picker.tsx` in `apps/frontend/src/notes/`: search/select over the user's **own** projects (via `projects-client`) and tasks (via `tasks-client`), preventing duplicates, built from shadcn/ui (US3.1/US3.4).
- [X] T037 [US3] Implement `note-links-panel.tsx` in `apps/frontend/src/notes/`: show the note's linked projects & tasks **resolved** against the user's data (stale ids omitted, optionally pruned on next save — FR-014), with add (opens `note-link-picker`) and remove that send `updateNote` with the updated arrays (client contract §Linking a note).
- [X] T038 [US3] Wire `note-links-panel` into `apps/frontend/src/notes/note-editor.tsx` so links are managed alongside content, surfacing a clear "not available" message on a `400 InvalidLinkTarget` reject (client contract §Editor & auto-save).

**Checkpoint**: Notes can be linked to the user's own projects and tasks, single-sourced on the note, de-duplicated, and validated.

---

## Phase 6: User Story 4 - See & open linked notes from a project or task (Priority: P2)

**Goal**: A project's detail view and a task's dialog each show which notes link to them (reverse lookup) and let the user open a linked note directly into the Notes editor; a work item with no linked notes shows a defined empty state.

**Independent Test**: Link a note to a project and a task (US3); open that project's detail and that task, confirm each lists the note and can open it into `/notes/:id`; confirm a work item with no links shows an empty state; removing the link on the note side is reflected here after refresh.

### Tests for User Story 4

> Write these FIRST and ensure they FAIL before implementing.

- [X] T039 [P] [US4] Notes repository reverse-query test in `apps/backend/src/modules/notes/notes.repository.spec.ts`: `listByLinked(userId, { projectId | taskId })` runs one owner-partition Query with a `contains(linkedProjectIds, :id)` / `contains(linkedTaskIds, :id)` filter and returns only matching owner notes — no GSI (research §2, FR-011).
- [X] T040 [P] [US4] Notes service reverse-lookup test in `apps/backend/src/modules/notes/notes.service.spec.ts`: `listByLinkedProject`/`listByLinkedTask` return the owner's notes linked to the given id, scoped to `userId`.
- [X] T041 [P] [US4] `use-linked-notes` hook test in `apps/frontend/src/notes/use-linked-notes.spec.tsx`: given a `projectId`/`taskId`, loads the reverse list and exposes it with a defined empty state (US4.4, client contract §Linked notes on projects & tasks).

### Implementation for User Story 4

- [X] T042 [US4] Add the reverse read to `apps/backend/src/modules/notes/notes.repository.ts` (`listByLinked` with a `contains` `FilterExpression` over the owner partition) (research §2).
- [X] T043 [US4] Add `listByLinkedProject(userId, projectId)` and `listByLinkedTask(userId, taskId)` to `apps/backend/src/modules/notes/notes.service.ts`.
- [X] T044 [US4] Extend `apps/backend/src/modules/notes/notes.controller.ts` `GET /notes` to handle `?linkedProjectId=<id>` and `?linkedTaskId=<id>` (mutually exclusive with the plain list mode), returning `{ notes }` (contracts/notes-api.md).
- [X] T045 [P] [US4] Extend `apps/frontend/src/notes/notes-client.ts` with `listByLinkedProject(projectId)` and `listByLinkedTask(taskId)` (GET `/notes?linkedProjectId=`/`?linkedTaskId=` → `{ notes }`) (client contract §Data client).
- [X] T046 [US4] Implement `use-linked-notes.ts` in `apps/frontend/src/notes/`: reverse-lookup hook keyed by `projectId`/`taskId`, exposing the linked notes, load status, and an empty state (client contract §Linked notes on projects & tasks).
- [X] T047 [P] [US4] Implement `linked-notes-section.tsx` in `apps/frontend/src/notes/`: a reusable "Linked notes" list (each note openable → navigates to `/notes/:id`) with an empty state, driven by `use-linked-notes` (FR-011/FR-012).
- [X] T048 [US4] Wire `linked-notes-section` into `apps/frontend/src/projects/project-detail-page.tsx` (by `projectId`) and `apps/frontend/src/week/task-detail-dialog.tsx` (by `taskId`); "open" navigates to `/notes/:id` and selects that note in the Notes surface (FR-012, client contract §Linked notes on projects & tasks).

**Checkpoint**: The note↔work relationship is bidirectional in the experience and single-sourced — projects/tasks indicate their linked notes and can open them.

---

## Phase 7: User Story 5 - Rename, search & delete notes (Priority: P3)

**Goal**: Rename a note (reflected in the list and linked-note indicators), find notes by title as the list grows, and delete a note (with a warning) so it and its links are gone and the editor moves to a defined state.

**Independent Test**: Rename a note (new title in list + indicators, persists); filter by title (matches + a "no matches" state); delete a note (warned, removed from list + persistence, no longer indicated on any project/task); deleting the selected note moves the editor to another note or the empty state.

### Tests for User Story 5

> Write these FIRST and ensure they FAIL before implementing.

- [X] T049 [P] [US5] Notes delete tests in `apps/backend/src/modules/notes/notes.service.spec.ts` (and repository `delete` in `notes.repository.spec.ts`): `deleteNote` removes the owner's note (`204`-equivalent `true`), a foreign/missing id returns not-found (`false`) with no disclosure, and is idempotent under retry (FR-017, FR-018).
- [X] T050 [P] [US5] `use-notes` delete/rename test in `apps/frontend/src/notes/use-notes.spec.tsx`: optimistic `deleteNote` removes the note immediately and reinstates it on rejection; `rename(id, title)` (an `updateNote { title }`) updates the list optimistically with rollback (FR-015/FR-017).
- [X] T051 [P] [US5] `notes-list` search test in `apps/frontend/src/notes/notes-list.spec.tsx`: a title query filters the list case-insensitively over the loaded notes with a defined "no matches" state (FR-016, research §7).

### Implementation for User Story 5

- [X] T052 [US5] Implement delete end-to-end in `apps/backend/src/modules/notes/`: `delete(userId, id)` in `notes.repository.ts` (`DeleteCommand` with `attribute_exists(PK)` guard → `true`/`false`), `deleteNote(userId, id)` in `notes.service.ts`, `DELETE /notes/:id` in `notes.controller.ts` (`204`/`404`) wired in `notes.routes.ts` (contracts/notes-api.md). Deleting a note removes its links implicitly — no cascade write to projects/tasks (FR-017).
- [X] T053 [P] [US5] Extend `apps/frontend/src/notes/notes-client.ts` with `deleteNote(id)` (DELETE → 204, rejects on non-2xx) (client contract §Data client).
- [X] T054 [US5] Extend `apps/frontend/src/notes/use-notes.ts` with optimistic `deleteNote` (remove immediately, reinstate on failure) and `rename(id, title)` via `updateNote`, both with snapshot rollback (client contract §Master-detail surface).
- [X] T055 [US5] Add client-side title search/filter to `apps/frontend/src/notes/notes-list.tsx`: case-insensitive substring over the loaded notes with a defined "no matches" state; no network call (FR-016, research §7).
- [X] T056 [US5] Add rename + delete UX in `apps/frontend/src/notes/note-editor.tsx` / `notes-page.tsx`: rename via the title field (already auto-saved), and a delete control that warns "This note will be removed" before calling `deleteNote`, then selects another note or shows the empty state when the deleted note was selected (US5.3/US5.5, client contract §Master-detail surface).

**Checkpoint**: All five user stories are independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns (E2E + validation)

**Purpose**: End-to-end coverage of the core flow and rejection cases (FR-020, SC-008), plus final validation.

- [X] T057 [P] Playwright e2e core flow in `apps/frontend-e2e/src/notes-core-flow.e2e.ts`: create note → type title + formatted Markdown and confirm auto-save (status + persistence on reload with formatting) → link a project & a task → open the project detail and the task and confirm the "Linked notes" section lists and opens the note → rename → delete with the link no longer indicated (SC-008), following the Stage 3/4 e2e support patterns.
- [X] T058 [P] Playwright e2e rejections in `apps/frontend-e2e/src/notes-rejections.e2e.ts`: unauthenticated visit to `/notes` redirects to login; account B cannot read/modify account A's note (`GET /notes` shows none of A's; `PATCH /notes/<A's id>` → `404`, no disclosure) and cannot link its own note to A's project/task (`400 InvalidLinkTarget`) (SC-007).
- [X] T059 Run the full gate: `npx nx run-many -t test -p shared backend frontend` and `npx nx e2e frontend-e2e`; confirm green (Principle III, quickstart.md Automated checks).
- [X] T060 Execute the quickstart.md manual validation (US1–US5 walkthrough, auto-save/formatting checks, and the stale-link + isolation smoke checks) and confirm each acceptance scenario behaves as specified.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Stories (Phases 3–7)**: Depend on Foundational. US1 and US2 are both P1 and together form the MVP; US2 adds the backend `PATCH` and the editor/auto-save that US3 (link updates) and US5 (rename) build on. US3 depends on US2's update path and on the Stage 3/4 tasks/projects modules (for link-target validation and the picker). US4 depends on notes existing (US1) and is most meaningful once links exist (US3). US5 depends on US1.
- **Polish (Phase 8)**: Depends on the stories under test being complete.

### User Story Dependencies

- **US1 (P1)**: After Foundational. No dependency on other stories.
- **US2 (P1)**: After US1 (extends `notes-client`, `use-notes`, and the `note-editor` pane; adds the backend `PATCH`).
- **US3 (P2)**: After US2 (link add/remove reuses the `updateNote` path) and the Stage 4 projects + Stage 3 tasks modules (validation + picker).
- **US4 (P2)**: After US1 (reverse lookup over notes); its value depends on US3 having created links, but the endpoint/section can be built independently.
- **US5 (P3)**: After US1 (rename/delete/search over the notes list).

### Within Each User Story

- Tests are written first and must FAIL before implementation.
- Backend: repository → service → controller → routes.
- Frontend: client → hook → components → page/route.
- Shared schema changes precede the code that imports them.

### Parallel Opportunities

- Setup T002/T003 run in parallel (T004 adds the dependency); Foundational T005/T006 run in parallel (schema + its spec).
- Within a story, all `[P]` test tasks run together first, then `[P]` implementation tasks on different files.
- US4's reverse endpoint/section can be staffed in parallel with US3 after US2 (different concerns) — coordinate only on `notes-client.ts` and `note-editor.tsx`.
- The two e2e files (T057/T058) run in parallel.

---

## Parallel Example: User Story 1

```bash
# Tests first (fail), in parallel:
Task: "Notes repository ownership tests in apps/backend/src/modules/notes/notes.repository.spec.ts"
Task: "Notes service create/list tests in apps/backend/src/modules/notes/notes.service.spec.ts"
Task: "use-notes hook test in apps/frontend/src/notes/use-notes.spec.tsx"

# Then parallel implementation on different files:
Task: "Implement notes-client.ts in apps/frontend/src/notes/"
Task: "Implement notes-list.tsx in apps/frontend/src/notes/"
Task: "Implement note-editor.tsx (US1 display pane) in apps/frontend/src/notes/"
```

---

## Implementation Strategy

### MVP First (US1 + US2 — both P1)

1. Phase 1 Setup → Phase 2 Foundational (shared schema + mounted module).
2. Phase 3 US1 (create/list/select notes) → STOP and validate independently.
3. Phase 4 US2 (WYSIWYG editor + auto-save) → STOP and validate. This is the minimum viable Notes feature.

### Incremental Delivery

1. Foundational ready.
2. US1 → test → demo (notebook shell: create/list/select).
3. US2 → test → demo (write with auto-save). 4. US3 → link to projects/tasks.
5. US4 → linked notes indicated/openable on projects & tasks. 6. US5 → rename/search/delete.
7. Phase 8 → e2e + quickstart validation before merge.

### Notes

- `[P]` = different files, no incomplete dependencies.
- **Single-source-on-note** (research §2): links live only on the note; do **not** write `linkedNoteIds` on tasks or a link field on projects, and do **not** add a cascade on project/task delete — stale ids are resolved away at display time (FR-014).
- Link-target validation uses the projects/tasks **public service APIs** only (Principle I) and runs **only** when link arrays change (keep the auto-save path free of cross-module reads — research §5).
- One new dependency (the WYSIWYG editor, T004); no `apps/infra` change this stage (research §1, Principle VI).
- Commit after each task or logical group; keep CI green (Principle III).
