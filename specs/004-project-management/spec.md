# Feature Specification: Stage 4 — Projects

**Feature Branch**: `004-project-management`

**Created**: 2026-07-08

**Status**: Draft

**Input**: User description: "specify the next stage: projects"

## Overview

Stage 4 delivers WorkBoard's second primary surface: the **Projects** view — a place where a
user groups related work into named, color-coded projects, tracks each project's progress, and
manages a per-project **task backlog**. It builds directly on the Stage 3 Task entity and the
Stage 2/3 authenticated, per-user data-isolation boundary: every project belongs to exactly one
account, and a user only ever sees and manipulates their own projects and their tasks.

Projects introduce the first relationship between the product's entities. Stage 3 shipped the
Task model with an unused, optional **project reference**; Stage 4 activates it. A user can
create a project (name, description, color), see all their projects as cards, open a project to
view a summary and a completion **progress bar**, and add, edit, complete, reorder, and delete
tasks inside that project's backlog. Project tasks use the **same Task model** as the Week board —
the only difference is that a project task's **due date is optional**. A project task **without**
a due date lives only in the project backlog; a project task **with** a due date additionally
appears on the Week board under its day, carrying its project's name and color so the user can
see, on their weekly plan, which work belongs to which project.

This stage deliberately scopes to project management and the project↔task relationship. It does
**not** build the Notes stage's note↔project/task links (Stage 5) or the Overview dashboard's
cross-project aggregation (a later stage); the Task model's `linkedNoteIds` remains present but
unexercised. Success means an authenticated user can organize their work into projects, run a
project's backlog end-to-end, watch progress update as tasks complete, and have scheduled project
tasks surface automatically on their Week board — with every change durably saved and scoped to
their account.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create projects and see them as cards (Priority: P1)

An authenticated user opens the Projects view and sees all of their projects as cards, each
showing the project's name, color, and a short description. The user creates a new project by
entering a name (required), an optional description, and choosing a color; the project appears
immediately as a card, is persisted, and is scoped to the user's account.

**Why this priority**: A project is the container every other Stage 4 interaction depends on —
you cannot open a project, track its progress, or manage its backlog until projects can be
created and listed. This is the irreducible core that delivers standalone value (organizing work
into named buckets).

**Independent Test**: Log in, open the Projects view, create a project with a name, description,
and color, confirm it appears as a card with that name and color, and confirm it survives a page
reload / app relaunch and is visible only to this account.

**Acceptance Scenarios**:

1. **Given** an authenticated user with no projects, **When** they open the Projects view, **Then** they see an empty state and a clear control to create their first project.
2. **Given** the Projects view, **When** the user opens the create-project control, enters a name, an optional description, and selects a color, and confirms, **Then** a new project card appears with that name, description, and color and the project is persisted.
3. **Given** the create-project control, **When** the user attempts to create a project with an empty or whitespace-only name, **Then** the project is not created and the user is shown that a name is required.
4. **Given** a user has created projects in prior sessions, **When** they reopen the Projects view, **Then** all of their projects appear as cards with their saved name, description, and color.
5. **Given** two different authenticated users, **When** each opens the Projects view, **Then** each sees only their own projects and never the other user's projects.

---

### User Story 2 - Open a project and manage its task backlog (Priority: P1)

A user opens a project card to reach its detail view, which shows the project's summary (name,
description, color) and a **task backlog**. The user adds tasks to the backlog by entering a
title, opens a task to edit its details, marks tasks complete and reopens them, and deletes
tasks — all scoped to that project and to the user's account. A backlog task's due date is
**optional**.

**Why this priority**: The backlog is the working surface of a project; creating projects (Story
1) has little value without the ability to put and manage work inside them. Together Stories 1
and 2 form the minimum viable Projects feature.

**Independent Test**: Open a project, add a task to its backlog by title, confirm it appears in
the backlog and persists across reload; open the task, edit and save its details; complete it and
confirm it stays visible in a completed state; reopen it; delete it and confirm it is gone.

**Acceptance Scenarios**:

1. **Given** a project card, **When** the user opens it, **Then** they see the project detail view with the project's name, description, and color and its task backlog (or an empty-backlog state).
2. **Given** a project detail view, **When** the user enters a title in the backlog's add-task control and confirms, **Then** a new task is created in that project's backlog, is persisted, and appears in the backlog; the task's due date is initially unset (optional).
3. **Given** a backlog with tasks, **When** the user opens a task, **Then** they can view and edit its title, description, due date (optional), priority, and labels, and saved changes persist.
4. **Given** a backlog task, **When** the user marks it complete, **Then** it is shown in a completed (visually distinct) state and remains visible in the backlog rather than being removed; the user can reopen it.
5. **Given** a backlog task, **When** the user deletes it, **Then** it is removed from the backlog and from persistence and no longer appears on reload.
6. **Given** an add-task or task-edit action, **When** the user submits an empty or whitespace-only title, **Then** the operation is rejected with a clear "title is required" message and no task is created or corrupted.

---

### User Story 3 - Track project progress (Priority: P2)

The project detail view shows a **progress bar** and completion indicator computed as the share of
the project's tasks that are completed (completed tasks ÷ total tasks). As the user completes,
reopens, adds, or deletes tasks, the progress updates to reflect the current state.

**Why this priority**: Progress is the primary at-a-glance signal of how a project is going and is
explicitly called out by the PRD. It builds on tasks existing in a project (Story 2) and enhances
the experience, but the backlog is usable without it, so it ranks below Stories 1–2.

**Independent Test**: In a project with several tasks, complete some and confirm the progress bar
and completion figure update to completed ÷ total; reopen a task and add a new one and confirm the
figure recomputes; verify a project with zero tasks shows a defined empty/zero-progress state.

**Acceptance Scenarios**:

1. **Given** a project with N tasks of which M are completed, **When** the user views the project detail, **Then** the progress bar and completion indicator reflect M ÷ N.
2. **Given** a project detail view, **When** the user completes an open task, **Then** the progress increases accordingly without a manual refresh.
3. **Given** a project detail view, **When** the user reopens a completed task or adds a new task, **Then** the progress decreases/recomputes accordingly.
4. **Given** a project with no tasks, **When** the user views its detail, **Then** progress is shown in a defined zero/empty state (not an error or division artifact).

---

### User Story 4 - Schedule a project task so it appears on the Week board (Priority: P2)

A user gives a project task a due date. The task then appears on the Week board under the day of
its due date — alongside standalone Week tasks — displaying its project's name and color so the
user can tell which project the work belongs to. Removing the due date returns the task to being
backlog-only (it no longer appears on the Week board).

**Why this priority**: This activates the project↔Week relationship that is the distinctive payoff
of introducing projects, letting a user plan project work within their week. It depends on
projects and tasks existing (Stories 1–2) and on the Stage 3 Week board, so it ranks below the
core project surface.

**Independent Test**: Create a project task with no due date and confirm it appears only in the
backlog; set its due date and confirm it appears on the Week board under that day with the
project's name/color; open the Week board, confirm the project task shows there; clear the due
date and confirm it leaves the Week board and remains in the backlog.

**Acceptance Scenarios**:

1. **Given** a project task with no due date, **When** the user views the Week board, **Then** the task does not appear on any day and remains only in the project's backlog.
2. **Given** a project task, **When** the user sets its due date to a specific day, **Then** the task appears on the Week board under that day showing the project's name and color, and remains listed in the project's backlog.
3. **Given** a scheduled project task shown on the Week board, **When** the user drags it to a different day, **Then** its due date updates to the target day (consistent with Stage 3 Week behavior) and the change is reflected in the project too.
4. **Given** a scheduled project task, **When** the user clears its due date, **Then** it is removed from the Week board and remains in the project backlog as an unscheduled task.
5. **Given** a standalone (non-project) task on the Week board, **When** it is displayed, **Then** it shows no project name/color, distinguishing it from project tasks.

---

### User Story 5 - Reorder the backlog and edit or delete a project (Priority: P3)

A user arranges tasks within a project's backlog into a deliberate manual order that persists
across visits. The user can also edit a project's own details (name, description, color) and
delete a project they no longer need.

**Why this priority**: Manual backlog ordering and project editing/deletion round out project
management and match the PRD ("Task ordering is persisted"), but the feature is demonstrable and
useful without them, so they are the lowest priority in this stage.

**Independent Test**: With several tasks in a backlog, drag one to a new position, confirm the new
order and that it persists across reload; edit a project's name/description/color and confirm the
changes persist; delete a project and confirm it and its tasks are removed and no longer appear on
reload.

**Acceptance Scenarios**:

1. **Given** multiple tasks in a project backlog, **When** the user reorders them, **Then** the new manual order is persisted and restored on subsequent visits.
2. **Given** a newly added backlog task, **When** it is created, **Then** it appears at the bottom of the backlog's current order.
3. **Given** a project detail view, **When** the user edits the project's name, description, or color and saves, **Then** the changes are persisted and reflected on the project card and detail view, and the updated color/name propagates to that project's scheduled tasks shown on the Week board.
4. **Given** a project the user wants to remove, **When** they delete it, **Then** they are warned that the project and its tasks will be removed, and on confirmation the project and all of its tasks (backlog and scheduled) are deleted and no longer appear on the Projects or Week views.
5. **Given** an edit that removes the project name (empty), **When** the user tries to save, **Then** the save is rejected with a clear "name is required" message and the prior value is retained.

---

### Edge Cases

- **Unauthenticated / expired session**: If the session has expired when the Projects view loads or when a change is submitted, the user is routed to log in (per Stage 2) and no project or task change is silently lost or applied under the wrong account.
- **Cross-user access**: A request to read or modify another user's project or a task within it is denied without disclosing whether it exists, consistent with the Stage 2/3 isolation boundary.
- **Progress with zero tasks**: A project with no tasks shows a defined zero-progress state (e.g., 0% / "no tasks yet") rather than an error or an undefined division result.
- **Concurrent edits across devices**: If the same account changes the same project or task on two devices, the system applies last-write-wins; views reflect the latest saved state on refresh. (No real-time sync/collaboration is in scope.)
- **Deleting a project with scheduled tasks**: Deleting a project also removes its scheduled tasks, so those tasks disappear from the Week board; the user is warned before this happens.
- **Save failure / offline**: If creating/editing/deleting a project, or creating/moving/reordering/editing/completing/deleting a project task, fails to persist, the user is shown a clear failure state and the view does not present the change as saved.
- **Long text / many items**: A very long project name or description, or a project with many backlog tasks, is displayed without breaking the card grid or backlog layout (backlog scrolls within the detail view).
- **Color choice**: The user selects a color from a defined palette; a project always has a valid color (a default is applied if none is explicitly chosen).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow an authenticated user to create a project with a required name, an optional description, and a color chosen from a defined palette, and MUST persist it scoped to that user's account.
- **FR-002**: The system MUST require a non-empty name to create or save a project and MUST reject empty/whitespace-only names with clear, field-level feedback without creating or corrupting a project.
- **FR-003**: The system MUST display all of the authenticated user's projects as cards, each showing at least the project's name, color, and description, with a defined empty state when the user has no projects.
- **FR-004**: The system MUST let the user open a project to a detail view showing the project's summary (name, description, color), a completion progress indicator, and the project's task backlog.
- **FR-005**: The system MUST allow the user to add tasks to a project's backlog by entering a title, creating a task that belongs to that project, with its due date initially unset (optional), and appending it to the bottom of the backlog's manual order.
- **FR-006**: The system MUST allow the user to open a project task and view and edit its title, description, due date (optional), priority, and labels, and MUST persist saved changes, requiring a non-empty title on save.
- **FR-007**: The system MUST support marking a project task complete and reopening it, keeping completed tasks visible in the backlog in a visually distinct completed state rather than hiding or removing them.
- **FR-008**: The system MUST allow the user to delete a project task, removing it from the backlog (and from the Week board if scheduled) and from persistence.
- **FR-009**: The system MUST allow the user to reorder tasks within a project's backlog and MUST persist the resulting manual order so it is restored on subsequent visits.
- **FR-010**: The system MUST compute and display each project's progress as the proportion of its tasks that are completed (completed ÷ total), recomputing it as tasks are added, completed, reopened, or deleted, and MUST show a defined zero/empty state for a project with no tasks.
- **FR-011**: The system MUST treat a project task's due date as optional: a project task without a due date appears only in the project backlog, and a project task with a due date additionally appears on the Week board under the day of that due date.
- **FR-012**: The system MUST display a scheduled project task on the Week board with its project's name and color so the user can distinguish project tasks from standalone tasks, and MUST show standalone tasks without a project name/color.
- **FR-013**: The system MUST keep a project task consistent across the Projects and Week surfaces: changing its due date (including via Week drag-and-drop, per Stage 3) moves it between backlog-only and scheduled and updates the day it appears under; and completing/editing it is reflected in both surfaces.
- **FR-014**: The system MUST allow the user to edit a project's name, description, and color and persist the changes, reflecting the updated name/color wherever the project is shown (project card, detail, and its scheduled tasks on the Week board).
- **FR-015**: The system MUST allow the user to delete a project, and on deletion MUST also delete all tasks belonging to that project (backlog and scheduled), after warning the user that the project and its tasks will be removed.
- **FR-016**: The system MUST scope all project and project-task reads and writes to the authenticated owner so a user can only ever see and modify their own projects and their tasks, with ownership enforced at the data-access layer consistent with the Stage 2/3 isolation boundary; a request for another user's project or task MUST be denied without disclosing its existence.
- **FR-017**: The system MUST persist every project and project-task change (create, edit, delete, reorder, and task create/edit/complete/reopen/delete/schedule) durably so that the Projects and Week views are restored on page reload and desktop-app restart.
- **FR-018**: The system MUST surface clear, user-facing states when a project or project-task operation fails to persist (network/backend/identity error) and MUST NOT present an unsaved change as saved.
- **FR-019**: The Projects experience (project cards, create/edit/delete project, project detail with progress and backlog, backlog task management, and the project↔Week integration) MUST be delivered from the single shared frontend codebase and behave consistently on the PWA and desktop app, remaining responsive on smaller viewports and built from the shared design system.
- **FR-020**: Projects behavior MUST be covered by automated unit/integration tests and end-to-end tests of the core flows (create project → open detail → add/complete backlog tasks → progress updates → schedule a task onto the Week board → edit/delete project), including rejection of unauthenticated access and non-disclosure of other users' projects and tasks, consistent with the project's test-first discipline.

### Key Entities

- **Project**: A named container for related work, owned by exactly one Account (the authenticated user). Key attributes: a unique identifier; owner reference (scopes all access); name (required); description (optional); color (chosen from a defined palette; always has a valid value). A project has zero or more Tasks that reference it, and its progress is derived from those tasks. Introduced in this stage.
- **Task (extended relationship)**: The same Task entity introduced in Stage 3. In this stage its optional **project reference** is activated: a task may belong to at most one project. For a project task, the due date is optional — when absent, the task is backlog-only; when present, the task also appears on the Week board under that day. All other Task attributes (title, description, status, priority, labels, manual order, timestamps) are unchanged. The `linkedNoteIds` relationship remains present but is not exercised in this stage.
- **Project progress (derived construct)**: A non-persisted, computed value equal to the proportion of a project's tasks that are completed (completed ÷ total), used to render the progress bar and completion indicator. It is recomputed from current task state rather than stored.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can create a project (name, description, color) and see it appear as a card in under 15 seconds, and it is scoped to their account.
- **SC-002**: 100% of project and project-task changes (create/edit/delete project; create/edit/complete/reopen/reorder/delete/schedule task) are still correctly reflected after a page reload and a desktop-app restart.
- **SC-003**: A project's displayed progress equals completed ÷ total tasks in 100% of tested cases and updates correctly as tasks are added, completed, reopened, or deleted, including a defined zero state for a project with no tasks.
- **SC-004**: Setting a due date on a project task makes it appear on the Week board under the correct day with the project's name and color in 100% of tested cases, and clearing the due date removes it from the Week board while keeping it in the backlog.
- **SC-005**: Manual backlog ordering is preserved across reloads in 100% of tested cases.
- **SC-006**: 100% of attempts by one authenticated user to read or modify another user's project or project task are denied with no data disclosed, verified by automated tests.
- **SC-007**: Deleting a project removes the project and all of its tasks from both the Projects and Week views in 100% of tested cases, with a warning shown before deletion.
- **SC-008**: The core Projects flow (create project → open detail → add/complete backlog tasks → progress updates → schedule a task onto the Week board → edit/delete project) passes as an automated end-to-end test on both the PWA and desktop targets from the shared codebase.
- **SC-009**: Completed backlog tasks remain visible in the backlog in a distinct state in 100% of cases and can be reopened, with no completed task disappearing from the project.

## Assumptions

- Stage 2 authentication + per-user data isolation and the Stage 3 app-level `userId` identity and Task model are in place; the Projects view is a protected surface reachable only by an authenticated user, and all project/task persistence is scoped to the authenticated account using the established ownership boundary.
- The Task entity and its persistence already exist (Stage 3); this stage activates the previously-unused optional project reference on that model rather than introducing a second task model. Project tasks and Week tasks are the **same** tasks.
- A project task's **due date is optional**; standalone Week tasks continue to be created with a due date defaulting to the day they are added under. A task belongs to at most one project.
- Project **color** is chosen from a defined palette of preset colors (not a free-form arbitrary color picker); every project has a valid color, with a sensible default applied when none is chosen.
- **Deleting a project cascades to its tasks**: the project and all tasks belonging to it (backlog and scheduled) are deleted, after an explicit warning/confirmation. Detaching tasks to keep them without a project is not offered in this stage, because a backlog-only (no-due-date) task with no project would have no home surface.
- Assigning an existing standalone task to a project, or moving a task between projects, is done through the task's own detail/edit surface (via its project reference); a dedicated bulk-reassignment experience is not in scope.
- The `linkedNoteIds` relationship on the Task model remains present but is **out of scope** for this stage's user experience because the Notes stage (Stage 5) does not yet exist; it is neither created nor surfaced here.
- The Overview dashboard, which aggregates active projects and tasks across the app, is a later stage and is not part of this feature.
- Concurrency is handled with a simple last-write-wins model; real-time synchronization and collaboration are explicitly out of scope (per PRD MVP exclusions).
- Progress is a simple completed-÷-total ratio over the project's tasks (all tasks weighted equally); weighted or time-based progress models are out of scope.
- Out-of-scope MVP capabilities (AI features, collaboration, calendar view, recurring tasks, notifications/reminders, file attachments) are not addressed in this stage.
