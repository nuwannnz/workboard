# Feature Specification: Stage 5 — Notes

**Feature Branch**: `005-notes`

**Created**: 2026-07-10

**Status**: Draft

**Input**: User description: "read the prd and specout the next stage: notes"

## Overview

Stage 5 delivers WorkBoard's third primary surface: the **Notes** view — a master-detail notebook
where a user writes, organizes, and retrieves free-form Markdown notes, and connects those notes to
the projects and tasks they relate to. It builds directly on the Stage 3 Task entity, the Stage 4
Project entity, and the Stage 2/3 authenticated, per-user data-isolation boundary: every note
belongs to exactly one account, and a user only ever sees and manipulates their own notes and the
links between their own notes, projects, and tasks.

The Notes view is a two-pane, master-detail layout: a **list** of the user's notes on one side and,
on the other, the **editor** for the currently selected note. Each note has a **title** and
**Markdown content** edited in a WYSIWYG editor. Editing is continuous and low-friction: changes
**auto-save** after roughly half a second of inactivity, so the user never issues an explicit
"save". A user can create a note, select any note to edit it, rename it, edit its content, and
delete it — all scoped to their account and durably persisted so the notebook is restored on reload
and desktop-app restart.

This stage also activates the product's final entity relationship. Stage 3 shipped the Task model
with an unused **`linkedNoteIds`** field; Stage 4 left it present but unexercised. Stage 5 turns it
on: a note can **link to multiple projects and multiple tasks**, and those links are **bidirectional**
in the experience — from a note the user sees and manages its linked projects and tasks, and on a
project or task the user sees which notes are linked to it. This is the "linked notes" that the PRD
lists as a Task field and the "Projects/tasks indicate linked notes" requirement.

This stage deliberately scopes to note authoring, organization, and the note↔project/task
relationship. It does **not** build the Overview dashboard's cross-surface aggregation (its "recent
notes" section is a later stage). Success means an authenticated user can keep a personal Markdown
notebook, write with auto-save so nothing is lost, link notes to the projects and tasks they inform,
navigate between a note and its linked work (and back), and have every note and every link durably
saved and scoped to their account.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create, browse, and select notes in a master-detail notebook (Priority: P1)

An authenticated user opens the Notes view and sees a list of all their notes (master pane) beside
an editor (detail pane). The user creates a new note; it appears in the list and opens in the
editor ready to edit. The user selects any note in the list to load it into the editor. The
notebook is scoped to the user's account and restored on reload.

**Why this priority**: The list-and-select notebook shell is the container every other Stage 5
interaction depends on — you cannot edit content, auto-save, or link a note to work until notes can
be created, listed, and selected. This is the irreducible core that delivers standalone value
(keeping a set of named notes).

**Independent Test**: Log in, open the Notes view, create a note, confirm it appears in the list and
opens in the editor; create a second note and switch between the two by selecting them; confirm the
notes survive a page reload / app relaunch and are visible only to this account.

**Acceptance Scenarios**:

1. **Given** an authenticated user with no notes, **When** they open the Notes view, **Then** they see an empty state and a clear control to create their first note.
2. **Given** the Notes view, **When** the user activates the create-note control, **Then** a new note is created and persisted, appears in the notes list, and opens in the editor ready for input.
3. **Given** a user with multiple notes, **When** they select a note in the list, **Then** that note's title and content load into the editor and it is indicated as the selected note.
4. **Given** a user has created notes in prior sessions, **When** they reopen the Notes view, **Then** all of their notes appear in the list and any note can be selected and edited.
5. **Given** two different authenticated users, **When** each opens the Notes view, **Then** each sees only their own notes and never the other user's notes.

---

### User Story 2 - Edit a note's title and Markdown content with auto-save (Priority: P1)

With a note open, the user edits its title and writes its content in a Markdown WYSIWYG editor
(headings, lists, emphasis, links, etc. rendered as the user types). The user never presses a save
button: changes are automatically persisted after roughly half a second of inactivity, and a clear
indicator communicates saved / saving state so the user trusts nothing is lost.

**Why this priority**: Authoring content with reliable auto-save is the core value of a notebook;
creating and listing notes (Story 1) has little worth without being able to write in them and trust
the writing is kept. Together Stories 1 and 2 form the minimum viable Notes feature.

**Independent Test**: Open a note, type a title and Markdown content, stop typing, and confirm the
change is persisted without any explicit save (reload and see the content); confirm formatting
(e.g., a heading and a bulleted list) is preserved; observe the saving/saved indicator reflect the
auto-save cycle.

**Acceptance Scenarios**:

1. **Given** an open note, **When** the user edits the title or content and then pauses for the auto-save interval, **Then** the change is persisted automatically without an explicit save action and is present after reload.
2. **Given** the content editor, **When** the user applies Markdown formatting (heading, bold/italic, bullet or numbered list, link), **Then** the formatting is shown WYSIWYG while editing and the underlying Markdown is preserved on save and reload.
3. **Given** the user is actively typing, **When** they continue typing before the auto-save interval elapses, **Then** saves are debounced (not fired on every keystroke) and a single save occurs after they pause.
4. **Given** an auto-save is in progress or completed, **When** the user looks at the editor, **Then** a clear indicator communicates the current state (e.g., "Saving…" / "Saved" / "unsaved changes"), and a failed save is shown as a distinct, non-silent state.
5. **Given** a note whose title the user clears to empty, **When** the note is saved and later shown in the list, **Then** it is handled per the untitled-note rule (a defined placeholder such as "Untitled") rather than being lost or breaking the list.

---

### User Story 3 - Link a note to projects and tasks (Priority: P2)

From an open note, the user links it to one or more of their projects and one or more of their
tasks. The note shows its linked projects and tasks, and the user can add and remove links. Links
are scoped to the user's own projects and tasks and are persisted with the note.

**Why this priority**: Linking notes to work is the distinctive payoff of introducing notes into a
project/task app — it turns standalone notes into context attached to real work. It depends on notes
existing (Stories 1–2) and on the Stage 4 projects and Stage 3 tasks, so it ranks below the core
notebook surface.

**Independent Test**: Open a note, link it to a project and to a task, confirm both appear as the
note's links and persist across reload; remove a link and confirm it is gone; confirm only the
user's own projects and tasks are offered and can be linked.

**Acceptance Scenarios**:

1. **Given** an open note, **When** the user opens the link control, **Then** they can search/select from their own projects and their own tasks to link, and never from another user's projects or tasks.
2. **Given** an open note, **When** the user links a project and a task, **Then** those links are persisted and the note displays its linked projects and tasks.
3. **Given** a note linked to a project or task, **When** the user removes that link, **Then** the link is removed and persisted and the note no longer lists it, without deleting the project, task, or note itself.
4. **Given** a note can link to multiple projects and multiple tasks, **When** the user adds several links, **Then** all of them are retained and shown, and duplicate links to the same project/task are prevented.
5. **Given** a linked project or task is deleted (per Stage 4/3), **When** the user next views the note, **Then** the stale link is not shown as a broken/erroring entry (it is resolved away or clearly marked as no longer available), and the note itself is unaffected.

---

### User Story 4 - See and open linked notes from a project or task (Priority: P2)

On a project's detail view and on a task, the user sees which of their notes are linked to it and
can open a linked note directly in the Notes view. This makes the note↔work relationship
bidirectional: the same link created from a note is visible and navigable from the project or task.

**Why this priority**: The PRD requires that "Projects/tasks indicate linked notes"; surfacing links
from the work side completes the relationship and lets a user jump from a piece of work to its
context. It depends on links existing (Story 3), so it ranks alongside/after linking rather than in
the core notebook.

**Independent Test**: Link a note to a project and to a task (Story 3); open that project's detail
and confirm the note is listed as a linked note and can be opened; open that task and confirm the
same; from the project/task, open the linked note and confirm it loads in the Notes editor.

**Acceptance Scenarios**:

1. **Given** a note linked to a project, **When** the user views that project's detail, **Then** the project indicates the linked note(s), scoped to the user's account.
2. **Given** a note linked to a task, **When** the user views that task, **Then** the task indicates the linked note(s).
3. **Given** a linked note indicated on a project or task, **When** the user opens it, **Then** the Notes view opens with that note selected and loaded in the editor.
4. **Given** a project or task with no linked notes, **When** the user views it, **Then** a defined empty state is shown (not an error), consistent with unlinked work.
5. **Given** a link removed from either side, **When** the user views the other side, **Then** the removal is reflected consistently (the link is bidirectional and single-sourced, not duplicated or divergent).

---

### User Story 5 - Rename, search, and delete notes (Priority: P3)

The user manages their growing notebook: renaming a note from the list or editor, finding a note by
title (and/or content) as the list grows, and deleting a note they no longer need — with links
cleaned up so no project or task is left pointing at a deleted note.

**Why this priority**: Rename, find, and delete round out notebook housekeeping and match a usable
notes product, but the feature is demonstrable and valuable without them, so they are the lowest
priority in this stage.

**Independent Test**: Rename a note and confirm the new title shows in the list and persists; with
several notes, filter/search by title and confirm matching notes are shown; delete a note, confirm
it is removed from the list and persistence and that any project/task it was linked to no longer
indicates it.

**Acceptance Scenarios**:

1. **Given** a note, **When** the user edits its title, **Then** the new title is auto-saved and reflected in the notes list and anywhere the note is referenced (e.g., linked-note indicators on projects/tasks).
2. **Given** a notebook with many notes, **When** the user enters a search/filter query, **Then** the list is narrowed to notes matching by title (at minimum), with a defined "no matches" state.
3. **Given** a note the user wants to remove, **When** they delete it, **Then** they are warned that the note will be removed, and on confirmation the note is deleted from persistence and removed from the list.
4. **Given** a deleted note that was linked to projects or tasks, **When** the deletion completes, **Then** those links are removed so the affected projects/tasks no longer indicate the deleted note.
5. **Given** the currently selected note is deleted, **When** the deletion completes, **Then** the editor moves to a defined state (e.g., selects another note or shows the empty state) rather than showing a broken/orphaned editor.

---

### Edge Cases

- **Unauthenticated / expired session**: If the session has expired when the Notes view loads or when an edit auto-saves, the user is routed to log in (per Stage 2) and no note content or link change is silently lost or applied under the wrong account.
- **Cross-user access**: A request to read or modify another user's note, or to link a note to another user's project or task, is denied without disclosing whether the target exists, consistent with the Stage 2/3/4 isolation boundary.
- **Auto-save race / rapid edits**: Rapid successive edits are debounced into a single save after the pause; an in-flight save followed by more edits does not drop the later edits (the latest content wins and is persisted).
- **Save failure / offline**: If an auto-save (or a link add/remove, rename, or delete) fails to persist, the user is shown a clear, non-silent failure state and the editor does not present the change as saved; unsaved edits are not discarded on a transient failure.
- **Empty / untitled note**: A note saved with an empty title is shown with a defined placeholder (e.g., "Untitled") in the list rather than a blank or broken row; an empty note (no title, no content) is still a valid, selectable, deletable note.
- **Concurrent edits across devices**: If the same account edits the same note on two devices, the system applies last-write-wins; views reflect the latest saved state on refresh. (No real-time sync/collaboration is in scope.)
- **Stale link resolution**: If a linked project or task was deleted, the note does not show a broken link that errors; the stale reference is resolved away or clearly marked as unavailable, and does not block loading the note.
- **Duplicate link**: Attempting to link the same project or task to a note more than once does not create a duplicate; the existing link is retained.
- **Long content / many notes**: A very long note title or a large Markdown document, or a notebook with many notes, is displayed without breaking the master-detail layout (the list scrolls and the editor scrolls within their panes).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST present the Notes view as a master-detail layout: a list of the authenticated user's notes and an editor for the currently selected note, with a defined empty state when the user has no notes.
- **FR-002**: The system MUST allow an authenticated user to create a note, persist it scoped to their account, add it to the notes list, and open it in the editor ready for input.
- **FR-003**: The system MUST allow the user to select any note from the list to load its title and Markdown content into the editor and indicate which note is selected.
- **FR-004**: The system MUST provide a Markdown WYSIWYG editor for a note's content that renders formatting (at least headings, bold/italic, bullet and numbered lists, and links) while editing and preserves the underlying Markdown on save and reload.
- **FR-005**: The system MUST auto-save a note's title and content after approximately 500ms of inactivity, debouncing rapid edits so a single save occurs after the user pauses, without requiring an explicit save action.
- **FR-006**: The system MUST display a clear auto-save status indicator (e.g., saving / saved / unsaved) and MUST surface a failed save as a distinct, non-silent state without presenting the change as saved.
- **FR-007**: The system MUST persist a note's title and Markdown content durably so that the note and its content are restored on page reload and desktop-app restart.
- **FR-008**: The system MUST handle a note with an empty title using a defined placeholder (e.g., "Untitled") in the list and MUST treat an empty note as a valid, selectable, deletable note.
- **FR-009**: The system MUST allow a note to link to multiple projects and multiple tasks belonging to the same account, MUST persist those links, and MUST prevent duplicate links to the same project or task.
- **FR-010**: The system MUST let the user add and remove a note's project/task links from the note, offering only the user's own projects and tasks to link, and MUST NOT delete the underlying project, task, or note when a link is removed.
- **FR-011**: The system MUST make note↔project/task links bidirectional in the experience: a project detail view and a task MUST indicate the notes linked to them, scoped to the user's account, with a defined empty state when none are linked.
- **FR-012**: The system MUST allow the user to open a linked note from a project or task and have the Notes view open with that note selected and loaded in the editor.
- **FR-013**: The system MUST keep links single-sourced and consistent across surfaces, so a link added or removed from either the note side or the project/task side is reflected on the other side without duplication or divergence.
- **FR-014**: The system MUST resolve stale links gracefully: if a linked project or task has been deleted, the note MUST NOT show a broken/erroring link entry, and loading the note MUST NOT be blocked by the stale reference.
- **FR-015**: The system MUST allow the user to rename a note, auto-saving and reflecting the new title in the list and in any linked-note indicators on projects and tasks.
- **FR-016**: The system MUST allow the user to find notes as the list grows by filtering/searching by title (at minimum), with a defined "no matches" state.
- **FR-017**: The system MUST allow the user to delete a note after a warning, removing it from the list and persistence and removing its links so linked projects/tasks no longer indicate it; when the selected note is deleted the editor MUST move to a defined state (another note or the empty state).
- **FR-018**: The system MUST scope all note reads/writes and all link operations to the authenticated owner, so a user can only see and modify their own notes and can only link to their own projects and tasks, with ownership enforced at the data-access layer consistent with the Stage 2/3/4 isolation boundary; a request for another user's note (or to link another user's project/task) MUST be denied without disclosing its existence.
- **FR-019**: The Notes experience (master-detail notebook, Markdown WYSIWYG editor with auto-save, note↔project/task linking, and linked-note indicators on projects and tasks) MUST be delivered from the single shared frontend codebase and behave consistently on the PWA and desktop app, remaining responsive on smaller viewports and built from the shared design system.
- **FR-020**: Notes behavior MUST be covered by automated unit/integration tests and end-to-end tests of the core flows (create note → edit with auto-save → link to a project and a task → see the link from the project/task and open the note → rename → delete with link cleanup), including rejection of unauthenticated access and non-disclosure of other users' notes, projects, and tasks, consistent with the project's test-first discipline.

### Key Entities

- **Note**: A titled Markdown document owned by exactly one Account (the authenticated user). Key attributes: a unique identifier; owner reference (scopes all access); title (optional — a placeholder is shown when empty); Markdown content; timestamps. A note may link to zero or more Projects and zero or more Tasks. Introduced in this stage.
- **Task (extended relationship)**: The same Task entity from Stage 3/4. In this stage its previously-unexercised **`linkedNoteIds`** relationship is activated: a task may be linked to zero or more Notes, and a task indicates its linked notes. All other Task attributes are unchanged.
- **Project (extended relationship)**: The same Project entity from Stage 4. In this stage a project may be linked to zero or more Notes and indicates its linked notes on its detail view. All other Project attributes are unchanged.
- **Note↔Project/Task link (relationship)**: The association connecting a Note to a Project or a Task, owned by and scoped to the same account. Links are single-sourced (one association, viewable from either side), bidirectional in the experience, de-duplicated (no repeated link to the same target), and cleaned up when either endpoint (the note, or the linked project/task) is deleted.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can create a note and begin writing in it in under 10 seconds, and the note is scoped to their account and appears in the notes list.
- **SC-002**: Content typed into a note is auto-saved within about 1 second of the user pausing, with no explicit save action, and is present after a page reload and desktop-app restart in 100% of tested cases.
- **SC-003**: Markdown formatting (heading, bold/italic, bullet/numbered list, link) authored WYSIWYG is preserved on reload in 100% of tested cases.
- **SC-004**: A note can be linked to multiple projects and multiple tasks, and 100% of link add/remove operations are correctly reflected on both the note side and the project/task side after reload.
- **SC-005**: From a project or task, a user can see its linked notes and open one directly into the Notes editor in 100% of tested cases.
- **SC-006**: Deleting a note removes it and all of its links so that 100% of previously linked projects/tasks no longer indicate the deleted note, verified after reload.
- **SC-007**: 100% of attempts by one authenticated user to read or modify another user's note, or to link a note to another user's project or task, are denied with no data disclosed, verified by automated tests.
- **SC-008**: The core Notes flow (create note → edit with auto-save → link to a project and a task → see and open the note from the project/task → rename → delete with link cleanup) passes as an automated end-to-end test on both the PWA and desktop targets from the shared codebase.
- **SC-009**: Rapid successive edits result in debounced saving (not one save per keystroke) while never losing the latest content, verified in 100% of tested rapid-edit cases.

## Assumptions

- Stage 2 authentication + per-user data isolation, the Stage 3 Task model (including its unused `linkedNoteIds` field), and the Stage 4 Project entity are all in place; the Notes view is a protected surface reachable only by an authenticated user, and all note/link persistence is scoped to the authenticated account using the established ownership boundary.
- The Notes view is the fourth primary sidebar destination (Week, Projects, Notes, Overview), added alongside the existing Week and Projects surfaces; the Overview destination remains a later stage.
- **Auto-save**, not explicit save, is the note-persistence model, firing after ~500ms of inactivity and debounced so rapid typing produces a single save on pause; a visible save-status indicator communicates saving/saved/failed.
- A note's **title is optional**; an empty-title note is shown with a placeholder (e.g., "Untitled"). Content is free-form Markdown; a note with no content is still valid.
- Note↔project/task links are **single-sourced and bidirectional in the experience** (one underlying association surfaced from both the note and the project/task), reusing the Task model's existing `linkedNoteIds` relationship and an equivalent project↔note association; duplicate links to the same target are prevented.
- **Deleting a note** cascades to its links only (the links are removed from the affected projects/tasks); it does not delete the linked projects or tasks. Conversely, deleting a linked project/task (per Stage 4/3) removes the corresponding link so the note shows no broken reference.
- The Markdown WYSIWYG editor supports common formatting (headings, emphasis, lists, links) sufficient for personal notes; advanced/rich embeds (images, file attachments, tables beyond basic Markdown) are not required by this stage and file attachments are an explicit MVP exclusion.
- The Overview dashboard's "recent notes" aggregation is a later stage and is not part of this feature; this stage delivers the notebook and the note↔work links it will later aggregate.
- Concurrency is handled with a simple last-write-wins model; real-time synchronization and collaboration are explicitly out of scope (per PRD MVP exclusions).
- Search/filter over notes is by title at minimum (content search is a reasonable enhancement but not required to satisfy this stage); a "no matches" state is defined.
- Out-of-scope MVP capabilities (AI features, collaboration, calendar view, recurring tasks, notifications/reminders, file attachments) are not addressed in this stage.
