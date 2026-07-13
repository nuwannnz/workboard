# Quickstart & Validation: Stage 5 — Notes

A run/validation guide proving Notes works end-to-end. Implementation details live in
[data-model.md](./data-model.md), [contracts/](./contracts/), and (Phase 2) `tasks.md`; this file
is how you *exercise* the feature.

## Prerequisites

- Stages 2–4 complete: a working authenticated app (register → verify → login) with the Week board
  and Projects, and the DynamoDB Local + cognito-local dev setup used there.
- Node 22 LTS; repo dependencies installed (`npm install` at the root). **Stage 5 adds one frontend
  dependency** — the WYSIWYG Markdown editor (TipTap + `tiptap-markdown`, research §3); install it
  and re-run `npm install`.
- At least one project and one task already created (to link to), and two test accounts to validate
  cross-user isolation.

## Run locally (Nx targets)

Use the same Nx targets as prior stages (run through Nx, not ad-hoc scripts — Principle V):

```bash
# Backend (Express) + local DynamoDB / Cognito emulator, as configured in Stage 2
npx nx serve backend

# Frontend (Vite PWA)
npx nx serve frontend
```

Log in, then open the **Notes** area from the sidebar (`/notes`).

## Validate the user stories

### US1 — Create, browse & select notes (P1)

1. With no notes, confirm `/notes` shows an empty state and a "New note" control.
2. Create a note → it appears in the list and opens in the editor ready for input; it persists
   across a page reload (SC-001).
3. Create a second note → switch between the two by selecting them in the list; the editor loads the
   selected note and indicates the selection.
4. Log in as a **second** account → its Notes view shows **none** of the first account's notes
   (SC-007).

### US2 — Edit with Markdown WYSIWYG + auto-save (P1)

1. In an open note, type a **title** and some **content**; apply a heading, bold, a bullet list, and
   a link → formatting renders **WYSIWYG** as you type (FR-004).
2. Stop typing → within ~1s the **save-status** shows "Saving…" then "Saved" with **no** explicit
   save action (FR-005/FR-006, SC-002). Reload → title, content, and formatting are preserved
   (SC-003).
3. Type rapidly → confirm the status debounces to a **single** save after you pause, not one per
   keystroke (SC-009).
4. Simulate a save failure (e.g., stop the backend) → status shows a distinct **error** state, edits
   are **not** discarded; restart backend and edit again → it saves (FR-006).
5. Clear the title entirely → the note shows as **"Untitled"** in the list, not blank/broken
   (FR-008).

### US3 — Link a note to projects & tasks (P2)

1. In an open note, open the link control → it offers only **your own** projects & tasks (US3.1).
2. Link a project and a task → both appear as the note's links and persist across reload (SC-004).
3. Try to link the same project/task again → **no duplicate** is added (US3.4).
4. Remove a link → it's gone; the project/task itself still exists (US3.3).

### US4 — See & open linked notes from a project or task (P2)

1. Open the linked **project's** detail → a **"Linked notes"** section lists the note (FR-011);
   open it → the Notes view opens with that note selected (`/notes/:id`, FR-012).
2. Open the linked **task** (Week task dialog) → the same note is listed and openable (FR-011/FR-012).
3. A project/task with **no** linked notes shows a defined empty state (US4.4).
4. Remove the link from the note side → refresh the project/task → the "Linked notes" section no
   longer shows it (single-sourced, no divergence — FR-013, US4.5).

### US5 — Rename, search & delete (P3)

1. Rename a note → the new title shows in the list and in any linked-note indicators on
   projects/tasks (FR-015).
2. With several notes, **search by title** → the list narrows to matches, with a "no matches" state
   for a non-matching query (FR-016).
3. Delete a note → confirm the **warning**; on confirm it's removed from the list and gone on reload
   (FR-017). Any project/task it was linked to **no longer indicates it** (SC-006).
4. Delete the **currently-selected** note → the editor moves to another note or the empty state, not
   a broken editor (US5.5).

### Stale-link check (edge case — FR-014)

1. Link a note to a task, then **delete that task** (Week/Projects).
2. Reopen the note → the deleted task is **not** shown as a broken link and the note loads fine; the
   stale id is resolved away (and pruned on the note's next save).

## Automated checks (must pass before merge — Principle III)

```bash
# Unit / integration (Vitest) across affected projects
npx nx run-many -t test -p shared backend frontend

# End-to-end (Playwright): notes core flow + unauthenticated + cross-user denial
npx nx e2e frontend-e2e
```

Expected coverage (see `tasks.md` once generated):

- **Shared**: `note` schema (empty title allowed; `linkedProjectIds`/`linkedTaskIds`;
  `createNoteSchema`/`updateNoteSchema`).
- **Backend**: notes repository ownership + not-found + **reverse `contains` membership query**;
  notes service create/edit/delete, **link-target ownership validation** via the projects/tasks
  service seam (foreign id → `400 InvalidLinkTarget`), dedup, and reverse lookup.
- **Frontend**: pure `note-links` (dedup / resolve / prune-stale); `use-note-editor` **debounced
  auto-save + status machine + latest-wins race** (fake timers); `use-notes` and `use-linked-notes`
  optimistic + rollback.
- **E2E**: create note → auto-save (formatting preserved) → link a project & task → see/open the
  note from the project & task → rename → delete-with-link-cleanup; plus unauthenticated redirect
  and one account being unable to read/modify another's note or link to another's project/task
  (SC-007).

## Isolation smoke check (manual)

While logged in as account A, note a note's id and a project id from the network tab; log in as
account B and issue the reverse read (`GET /notes?linkedProjectId=<A's project id>`) and a direct
`PATCH /notes/<A's note id>` → expect an empty result / `404` with **no** disclosure of A's data,
and confirm B cannot link its own note to A's project id (`400 InvalidLinkTarget`) — FR-018, SC-007.
