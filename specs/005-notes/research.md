# Phase 0 Research: Stage 5 — Notes

Resolves the open technical decisions behind the Stage 5 plan. Each item states the **Decision**,
its **Rationale**, and the **Alternatives considered**. There were no `NEEDS CLARIFICATION`
markers in the spec; the Assumptions section already fixed the product-level defaults, so this
research focuses on the implementation choices that carry the most architectural weight — above
all, **where a note↔work link lives** (§2), which determines nearly everything else.

## 1. Note persistence & keys (single-table, owner-scoped)

**Decision**: Persist a Note as one item `PK = USER#<userId>`, `SK = NOTE#<noteId>` (noteId =
ULID), with plain attributes `title`, `markdown`, `linkedProjectIds`, `linkedTaskIds`,
`createdAt`, `updatedAt`. List the user's notes with one `Query` (`PK = USER#<userId>`,
`begins_with(SK, 'NOTE#')`). Build the key **only** from the resolved app `userId`, never caller
input. Reuse the exact repository shape established by `projects.repository.ts`.

**Rationale**: Identical to the Stage 4 Project pattern, which is proven, owner-isolating
(Principle IV — a foreign id resolves as not-found with no disclosure), and needs no new access
structure. ULID keeps ids sortable and server-generated (never client-supplied). Notes are ordered
by recency (`updatedAt`/`createdAt`) rather than a manual `order` field — the PRD gives notes no
manual ordering (unlike the Week board and project backlog), so no fractional-index rank is needed
(Principle VI).

**Alternatives considered**: A separate notes table (rejected — the constitution mandates one
single table; Stage 2–4 all share it). A manual `order` field like tasks/projects (rejected — the
Notes PRD specifies no manual ordering; recency sort is sufficient and simpler).

## 2. Where a note↔project/task link lives — **single source of truth on the Note** (decisive)

**Decision**: The **Note is the single source of truth for every link.** A note stores
`linkedProjectIds: string[]` and `linkedTaskIds: string[]`. "Which notes link to project/task X"
is answered by a **reverse Query** over the user's own `NOTE#` partition with a
`FilterExpression` of `contains(linkedProjectIds, :id)` (or `contains(linkedTaskIds, :id)`). The
Task's existing `linkedNoteIds` field and the Project item are **not written to** — no denormalized
copy is kept anywhere.

**Rationale**: The spec requires links to be *bidirectional in the experience* yet
*single-sourced, "not duplicated or divergent"* (FR-013, US4.5). Storing the link in exactly one
place makes divergence **structurally impossible** and cascades enormous simplification:

- **Deleting a note removes its links for free** (FR-017) — nothing else references them, so the
  reverse Query simply stops returning it. No cleanup write to tasks/projects.
- **Deleting a project or task needs no write to notes at all** — the projects/tasks modules stay
  unmodified. A now-orphaned id in some note's array is **resolved away at display time** (§4,
  FR-014), never shown broken, never blocking load.
- **No cross-module cascade** and no reconciliation job. The only cross-module call is *read-only*
  link-target validation on write (§5).

At personal scale (a user has tens to low-hundreds of notes) the reverse Query — one partition
`Query` + `contains` filter — is cheap and needs **no GSI** (Principle VI). The Task's
`linkedNoteIds` stays in the shape for forward-compatibility but is deliberately left `[]`; it is
**not** the authority.

**Alternatives considered**:
- **Denormalize onto both sides** (write `linkedNoteIds` on the task/project *and* `linkedTaskIds`
  on the note). Rejected — this is exactly the "duplicated / divergent" state the spec forbids, and
  it forces the projects/tasks modules to be modified, adds cross-module writes on every link
  change, and adds a cleanup cascade on project/task/note delete. Strictly more complexity for a
  worse correctness story.
- **A dedicated link/edge item** (`SK = LINK#PROJECT#<pid>#NOTE#<nid>`, etc.). Rejected — it is a
  second source that must be kept consistent with the note's arrays (or replaces them, complicating
  the note read), and buys nothing over the reverse `contains` Query at this scale (YAGNI).
- **A GSI keyed by linked id.** Rejected — Principle VI and the Stage 4 precedent (project backlog
  read filters the partition rather than adding a GSI); unnecessary at personal scale.

## 3. Markdown WYSIWYG editor — the one justified new dependency

**Decision**: Add **TipTap** (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm`) plus a Markdown
serializer (`tiptap-markdown`) as the WYSIWYG editor, wrapped behind a single
`markdown-editor.tsx` component whose value in/out is **Markdown** (the persisted source of truth).
StarterKit covers the formatting the spec names — headings, bold/italic, bullet & numbered lists,
links (FR-004); the serializer converts the editor document to/from Markdown on load and before
each auto-save. This is the **only** new dependency Stage 5 introduces (Principle VI), and it is
concretely required by FR-004.

**Rationale**: A genuine "Markdown WYSIWYG editor" (render formatting *as you type*, not a
split-pane raw/preview) needs a rich-text engine; ProseMirror/TipTap is the de-facto standard,
actively maintained, headless (styles with the shared design system, so no design-system fork —
Principle II), and extensible without pulling a heavy framework. Keeping Markdown as the stored
format (not the editor's internal JSON) means persistence stays a plain string, matches the PRD's
`markdown` field and the existing `note` schema, and keeps the data forward-compatible.

**Alternatives considered**:
- **`@uiw/react-md-editor`** — lighter, but it is a raw-textarea-plus-preview, not true WYSIWYG;
  fails the "WYSIWYG while editing" wording of FR-004. Acceptable fallback if TipTap proves too
  heavy for the Tauri bundle, and is noted as such.
- **Milkdown** (also ProseMirror, Markdown-first) — comparable capability; TipTap chosen for larger
  ecosystem, simpler React bindings, and easier shadcn/Tailwind styling.
- **Hand-rolled contentEditable** — rejected outright; correct rich-text editing (selection,
  lists, undo, IME) is a notorious tar pit and would violate Principle VI far more than one vetted
  dependency does.

## 4. Stale-link resolution (deleted project/task) — resolve at display time

**Decision**: Never store a "broken link" and never cascade-clean on project/task delete. When a
note's links are rendered (its own link panel, and the reverse "linked notes" lists), each id is
**resolved against the user's actual projects/tasks**; ids that no longer resolve are **omitted
from display** (and may be **lazily pruned** from the note's arrays the next time that note is
saved for any reason). A stale id never errors and never blocks loading the note (FR-014).

**Rationale**: Because links are single-sourced on the note (§2) and project/task deletes don't
touch notes, some arrays will transiently contain ids of deleted work. Resolving at read time keeps
the write paths simple (no cascade) while guaranteeing the user never sees a broken entry.
Lazy-prune-on-next-save keeps arrays from accumulating dead ids over time without a background job.

**Alternatives considered**: Cascade-delete link references from every note when a project/task is
deleted (rejected — reintroduces the cross-module writes and reverse scan that §2 exists to avoid).
An eager cleanup job/scan (rejected — YAGNI at personal scale; display-time resolution already
covers correctness).

## 5. Link-target ownership validation — read-only, only when links change

**Decision**: On `PATCH /notes/:id`, **iff the body contains `linkedProjectIds` and/or
`linkedTaskIds`**, the notes service validates that every newly-referenced id belongs to the caller
by calling the **projects/tasks public service APIs** (`ProjectsService.getById(userId, id)`; a
tasks existence/ownership check via `TasksService`), and rejects the request (`400`/`404`) if any
target is not the owner's (FR-018, SC-007, US3.1). De-duplicate ids before persisting. This
validation is **skipped** when the patch carries only `{title, markdown}` — the content auto-save
path — so auto-save stays a single cheap `Update` with no cross-module reads.

**Rationale**: Defense-in-depth at the service layer (Principle IV — "enforced at the lowest layer
rather than trusted to the UI") gives a crisp, testable cross-user denial and a clean `400` for a
stale/foreign id, without polluting the high-frequency auto-save path. Using the other modules'
public service APIs is the sanctioned service-to-service seam (Principle I); the notes module never
touches their repositories/domains.

**Alternatives considered**: No write-time validation, relying only on display-time resolution
(§4) to hide foreign ids (rejected — the spec has an explicit acceptance scenario and success
criterion for *denying* cross-user links; a silent no-op is weaker and less testable). Validating
on **every** save including content-only auto-saves (rejected — needless cross-module reads on the
hot path; validation only matters when the link set actually changes).

## 6. Auto-save: debounce, status machine, and race handling

**Decision**: A `use-note-editor` hook debounces title/content edits and fires a `PATCH` **~500ms**
after the last change (FR-005). It exposes a small status machine — `idle` → `dirty` → `saving` →
`saved` | `error` — surfaced by `save-status.tsx` (FR-006). Rapid edits **reset the debounce timer**
(one save after the pause, never one per keystroke — SC-009). If edits arrive while a save is
in-flight, the hook marks the note dirty again and **schedules a follow-up save after the current
one resolves**, so the latest content always wins (edge case: auto-save race). A failed save moves
to `error` (non-silent), **retains the unsaved buffer** (does not discard edits), and retries on
the next edit or an explicit retry (FR-006, edge case: save failure/offline).

**Rationale**: Debounce-on-pause with a visible status is the standard, trustworthy notebook
auto-save UX and directly encodes the spec's timing (~500ms), debounce (SC-009), and
non-silent-failure (FR-006) requirements. Keeping the dirty buffer on failure prevents the
data-loss class the constitution calls out (no undo history). Isolating this in a hook lets it be
unit-tested with fake timers independently of the editor and network (Principle III).

**Alternatives considered**: Save-on-blur only (rejected — loses the "auto-save after inactivity"
guarantee while the user pauses mid-note). Save-per-keystroke (rejected — violates SC-009 and
hammers the backend). A global unsaved-changes store (rejected — YAGNI; per-note hook state
suffices for a single-editor master-detail).

## 7. Empty/untitled notes & title search

**Decision**: `title` is allowed to be **empty** in the Note shape (the Stage 1 stub's
`min(1)` is dropped); an empty note (no title, no content) is a valid, selectable, deletable note
(FR-008). The list renders an empty title as a defined placeholder ("Untitled") — a **display
concern**, not stored. Search/filter is **client-side over the already-loaded notes list, by
title** (case-insensitive substring), with a defined "no matches" state (FR-016); content search is
deferred as a documented non-goal.

**Rationale**: Auto-save means a note is created and persisted before the user types a title, so an
empty title must be a first-class valid state (FR-008). Client-side title filtering over the loaded
list is instant, needs no endpoint, and matches personal scale (Principle VI). Content search would
need a scan or search index — out of scope for this stage per the spec Assumptions.

**Alternatives considered**: Requiring a title (rejected — breaks the auto-save-first flow and
FR-008). Server-side search endpoint (rejected — unnecessary for title-only filtering at this
scale; content search is explicitly deferred).

## 8. Surfacing linked notes on projects & tasks, and deep-linking to a note

**Decision**: The Projects detail page and the Week task dialog each render a reusable
`linked-notes-section` fed by `use-linked-notes(projectId | taskId)`, which calls the reverse
endpoint (`GET /notes?linkedProjectId=` / `?linkedTaskId=`, §2). Selecting a linked note navigates
to `/notes/:id`, which the notes page reads to pre-select that note in the master-detail view
(FR-012). A project/task with no linked notes shows a defined empty state (US4.4).

**Rationale**: One shared component keeps the "notes indicate here" UX identical on both surfaces
(Principle II) and isolates the reverse-lookup dependency to a single hook. Routing to `/notes/:id`
reuses the existing router pattern (Stage 4 already uses `/projects/:id`) so "open the linked note"
is a plain navigation, and the note id in the URL makes the selection deep-linkable and testable.

**Alternatives considered**: Embedding a mini-editor inside the project/task views (rejected —
duplicates the editor, forks the UX, and blurs the master-detail model; a link that opens the
Notes surface is simpler and matches the PRD's master-detail notebook). Passing the selected note
via component state instead of the URL (rejected — a route param is deep-linkable, back-button
friendly, and directly assertable in e2e).

## Summary of decisions

| # | Area | Decision |
|---|------|----------|
| 1 | Note persistence | `PK=USER#<userId>`, `SK=NOTE#<ulid>`, single table, recency-sorted, no manual order |
| 2 | **Link source of truth** | **Single-sourced on the Note**; reverse `contains` Query, **no GSI**, no denormalized copy on task/project |
| 3 | WYSIWYG editor | **TipTap + tiptap-markdown** (the one justified new dep); Markdown is the stored format |
| 4 | Stale links | Resolve away at **display time**; optional lazy prune on next save; no cascade |
| 5 | Link validation | Owner-scoped, via projects/tasks **public service APIs**, **only when link arrays change** |
| 6 | Auto-save | `use-note-editor` debounce ~500ms; `idle→dirty→saving→saved\|error`; latest-wins on race; keep buffer on failure |
| 7 | Empty title / search | Empty title valid → "Untitled" placeholder; **client-side title** filter; content search deferred |
| 8 | Linked-notes UX | Shared `linked-notes-section` + `use-linked-notes`; "open" navigates to `/notes/:id` |
