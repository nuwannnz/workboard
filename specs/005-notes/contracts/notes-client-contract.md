# Frontend Contract: Notes data, auto-save & linking

The frontend contract for the `notes/` feature area — how the shared React/shadcn UI loads,
edits, auto-saves, and links notes, and how the Projects detail page and Week task dialog surface
"Linked notes". Everything runs from the **single shared codebase** (PWA + Tauri, Principle II)
inside the existing `AppShell`, reusing the Stage 2 `api-client` (id-token injection + one-shot
`401` refresh). All shapes come from `libs/shared` (Principle V).

## Data client — `notes-client.ts`

A typed wrapper over the `api-client` for the `/notes` endpoints (mirrors `projects-client.ts`).
Any non-2xx **rejects** so the calling hook can roll back an optimistic change and surface a
failure (FR-006/FR-018). Responses are parsed with the shared `noteSchema`.

```text
interface NotesClient {
  listNotes(): Promise<Note[]>;                          // GET /notes            (recency-sorted)
  listByLinkedProject(projectId): Promise<Note[]>;       // GET /notes?linkedProjectId=
  listByLinkedTask(taskId): Promise<Note[]>;             // GET /notes?linkedTaskId=
  createNote(input?: CreateNoteInput): Promise<Note>;    // POST /notes           (may be empty)
  updateNote(id, patch: UpdateNoteInput): Promise<Note>; // PATCH /notes/:id
  deleteNote(id): Promise<void>;                         // DELETE /notes/:id
}
```

- A `400 InvalidLinkTarget` from a link update rejects distinctly so the link UI can show "that
  project/task isn't available" rather than a generic error.

## Master-detail surface — `notes-page.tsx` (`/notes`, `/notes/:id`)

- Two panes: **`notes-list.tsx`** (master) and **`note-editor.tsx`** (detail). On small viewports
  the panes collapse (list → editor on selection, with a back affordance) — responsive, one
  codebase (FR-019).
- The route param `:id` selects a note (deep-linkable; this is how "open linked note" works, §Linked
  notes). No `:id` → select the most-recent note, or the empty state when the user has no notes
  (FR-001).
- **Create** (`use-notes`): `POST /notes` (empty), optimistically prepend the new note, select it,
  focus the title/editor (FR-002). Rollback + failure state on reject.
- **Empty state**: no notes → a clear "create your first note" control (FR-001).

## Notes list — `notes-list.tsx`

- Renders the owner's notes (recency order) with an empty-title note shown as **"Untitled"**
  (display-only placeholder — FR-008, research §7).
- **Search/filter**: client-side, **by title**, case-insensitive substring over the already-loaded
  list, with a defined **"no matches"** state (FR-016, research §7). No network call.
- Selecting a note navigates to `/notes/:id`.

## Editor & auto-save — `note-editor.ts` / `use-note-editor.ts` / `save-status.tsx`

- **`markdown-editor.tsx`** wraps the WYSIWYG editor (TipTap + `tiptap-markdown`, research §3); its
  value in/out is **Markdown** (the stored source of truth). Supports headings, bold/italic, bullet
  & numbered lists, links (FR-004).
- **`use-note-editor`** owns the debounced auto-save and a status machine
  `idle → dirty → saving → saved | error` (research §6):
  - Title/content edits mark the buffer **dirty** and (re)arm a **~500ms** timer; the timer firing
    sends `PATCH /notes/:id` with `{ title?, markdown? }` only (FR-005). Rapid edits reset the
    timer → **one** save after the pause, never per-keystroke (SC-009).
  - Edits during an in-flight save re-mark dirty and **schedule a follow-up save** after it
    resolves — **latest content wins** (edge case: auto-save race).
  - A failed save → **`error`** (non-silent, FR-006), **keeps the unsaved buffer** (no discard),
    retries on the next edit or an explicit retry.
- **`save-status.tsx`** renders the current state ("Saving…" / "Saved" / "Unsaved changes" /
  "Couldn't save — retry"), so the user trusts nothing is lost (FR-006).

## Linking a note — `note-links-panel.tsx` / `note-link-picker.tsx` / `note-links.ts`

- The panel shows the note's linked projects & tasks, **resolved** against the user's actual
  projects/tasks (loaded via the existing projects/tasks clients); ids that no longer resolve are
  **omitted** and may be lazily pruned on the note's next save (stale-link handling — FR-014,
  research §4).
- **Add**: the picker offers only the user's **own** projects & tasks (never another user's —
  US3.1); selecting one sends `PATCH /notes/:id` with the updated `linkedProjectIds` /
  `linkedTaskIds` (de-duplicated by `note-links.ts`, US3.4). A `400 InvalidLinkTarget` reject shows
  a clear "not available" message.
- **Remove**: sends the array without that id; the project/task itself is untouched (US3.3).
- `note-links.ts` holds the pure helpers — **dedup**, **resolve ids → known projects/tasks**,
  **prune stale ids** — unit-tested independently of React (Principle III).

## Linked notes on projects & tasks — `linked-notes-section.tsx` / `use-linked-notes.ts`

- A reusable **"Linked notes"** section dropped into `project-detail-page.tsx` and
  `task-detail-dialog.tsx` (FR-011). `use-linked-notes(projectId | taskId)` calls
  `listByLinkedProject` / `listByLinkedTask` (the reverse read).
- Each linked note is openable → navigates to `/notes/:id`, opening the Notes surface with that
  note selected (FR-012).
- No linked notes → a defined **empty state** (US4.4).
- Because links are single-sourced on the note (research §2), this section and the note's own link
  panel **always agree** — adding/removing on one side is reflected on the other after refresh, with
  no divergence (FR-013, US4.5).

## Optimistic-update & failure contract (all mutations)

- Create/rename/link/unlink/delete apply **optimistically** then reconcile with the server response;
  a **reject rolls back** the local change and surfaces a non-silent failure (FR-006/FR-018). No
  mutation presents an unsaved change as saved.
- The client never sees `PK`/`SK`/`userId`; ownership is entirely server-side.

## Routing & navigation

- `app/nav-items.ts`: the **Notes** item gains `to: '/notes'` (it becomes a live surface).
- `app/router.tsx`: mount `/notes` and `/notes/:id` as protected routes inside the `AppShell`
  outlet (mirrors the Stage 4 `/projects` + `/projects/:id` pattern).
