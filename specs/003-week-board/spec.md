# Feature Specification: Stage 3 — Week Board

**Feature Branch**: `003-week-board`

**Created**: 2026-07-08

**Status**: Draft

**Input**: User description: "read the prd and specify the next stage: week"

## Overview

Stage 3 delivers WorkBoard's first real productivity surface: the **Week** view — a seven-column Kanban board (Monday–Sunday) where a user plans their week by day. It is the first stage to introduce the core **Task** entity and its persistence, building directly on the authenticated, per-user data-isolation boundary established in Stage 2: every task belongs to exactly one account, and a user only ever sees and manipulates their own tasks.

Within the Week view a user can see the current week laid out as days, add tasks inline at the bottom of any day, open a task to edit its details, mark tasks complete and reopen them, drag a task from one day to another (which reschedules its due date), reorder tasks within a day (a manual order that persists), and move backward and forward between weeks or jump straight back to the current week. Tasks stay anchored to the day of their due date.

This stage deliberately scopes to standalone tasks managed from the Week board. Fields that depend on features not yet built — a task's link to a Project, and links to Notes — are **not** exercised in this stage's user experience; the Task model is designed so those relationships can be added when the Projects (Stage 4) and Notes (Stage 5) stages land, without reshaping existing data. Success means an authenticated user can run their week end-to-end from this board: capture work on the right day, reprioritize by dragging and reordering, complete and revisit tasks, and move across weeks — with every change durably saved and scoped to their account.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Plan the current week and capture tasks (Priority: P1)

An authenticated user opens the Week view and sees the current week as seven day-columns from Monday to Sunday, with today visually distinguished. Each column shows that day's tasks in order. At the bottom of any day the user types a task title and adds it; the task appears immediately in that day, is persisted, and is scoped to the user's account. Its due date defaults to the day it was created under.

**Why this priority**: Seeing the week and capturing tasks on the correct day is the irreducible core of the Week feature — the minimum that delivers standalone value. Every other Week interaction (moving, reordering, completing, navigating) presupposes that tasks can be viewed and created here first.

**Independent Test**: Log in, open the Week view, confirm seven correctly-labeled day columns for the current week with today highlighted, add a task inline under a specific day, and confirm it appears under that day with a due date matching that day and survives a page reload / app relaunch.

**Acceptance Scenarios**:

1. **Given** an authenticated user with no tasks, **When** they open the Week view, **Then** they see seven columns labeled Monday through Sunday for the current week with the correct calendar dates and today's column visually distinguished.
2. **Given** the Week view is open, **When** the user enters a title in a day's inline "add task" control and confirms, **Then** a new task appears at the bottom of that day, is persisted, and its due date is set to that day.
3. **Given** the inline add control, **When** the user attempts to add a task with an empty or whitespace-only title, **Then** the task is not created and the user is shown that a title is required.
4. **Given** a user has created tasks in prior sessions, **When** they reopen the Week view, **Then** each task appears under the day matching its due date, in its saved order.
5. **Given** two different authenticated users, **When** each opens the Week view, **Then** each sees only their own tasks and never the other user's tasks.

---

### User Story 2 - Reschedule a task by dragging it to another day (Priority: P1)

A user drags a task card from one day column and drops it onto a different day. The task moves to that day and its due date updates to the target day. The change persists so that on reload the task remains on the new day.

**Why this priority**: Drag-and-drop rescheduling is the signature interaction of a Trello-style weekly board and the primary way users reorganize their week. It is called out explicitly in the PRD ("moving updates the due date") and is core to the feature's value, but it depends on Story 1's board and tasks existing.

**Independent Test**: With at least one task under a given day, drag it to another day, release, and confirm the card now sits under the target day, its due date equals the target day, and the move persists across a reload.

**Acceptance Scenarios**:

1. **Given** a task under Monday, **When** the user drags it and drops it onto Thursday, **Then** the task now appears under Thursday and its due date is updated to that Thursday's date.
2. **Given** a task was moved to a new day, **When** the user reloads the app, **Then** the task remains under the new day with the updated due date.
3. **Given** a drag is started, **When** the user releases it outside any valid day column (cancels the drag), **Then** the task returns to its original day and order with no change to its due date.
4. **Given** a task is dropped onto a specific position within the target day, **Then** it is inserted at that position and the resulting order is persisted (see Story 3).

---

### User Story 3 - Reorder tasks within a day (Priority: P2)

A user drags tasks up and down within a single day column to arrange them in a deliberate order. The manual order is saved and restored on subsequent visits, independent of due date or creation time.

**Why this priority**: Manual within-day ordering lets users express priority sequencing beyond the task's Priority field and is explicitly required by the PRD ("Manual ordering within each day is persisted"). It enhances the board but is not required for the board to be useful, so it ranks below viewing/creating and cross-day rescheduling.

**Independent Test**: With three tasks in one day, drag the bottom task to the top, confirm the new visual order, reload, and confirm the order persisted.

**Acceptance Scenarios**:

1. **Given** multiple tasks in a day, **When** the user drags one to a new position within that same day, **Then** the tasks reflow to the new order and that order is persisted.
2. **Given** a manually-ordered day, **When** the user reopens the Week view, **Then** the tasks appear in the saved manual order rather than a default sort.
3. **Given** a newly created task, **When** it is added inline, **Then** it appears at the bottom of its day's current order.

---

### User Story 4 - Navigate between weeks (Priority: P2)

A user moves to the previous or next week and can jump directly back to the current week. The board re-renders with the selected week's day columns and dates and each day shows the tasks due on those dates.

**Why this priority**: Weekly navigation lets users plan ahead and review past weeks and is part of the PRD's Week definition, but the current-week board (Stories 1–3) already delivers standalone value, so navigation ranks below it.

**Independent Test**: From the current week, go to the next week and confirm the column dates advance by seven days and show that week's tasks; use the "today"/current-week control and confirm the board returns to the week containing today.

**Acceptance Scenarios**:

1. **Given** the Week view on the current week, **When** the user selects "previous week", **Then** the board shows the seven days of the prior week with their correct dates and the tasks due in that week.
2. **Given** the Week view on any non-current week, **When** the user selects "current week"/"today", **Then** the board returns to the week containing today with today's column distinguished.
3. **Given** the user has navigated to a different week, **When** they create a task inline under one of that week's days, **Then** the task's due date defaults to that displayed day, not to today.
4. **Given** a week with no tasks, **When** it is displayed, **Then** each day shows an empty state and the inline add control remains available.

---

### User Story 5 - Edit task details, complete, and reopen (Priority: P2)

A user opens a task to view and edit its details — title, description, due date, priority, and labels — and can mark it complete or reopen a completed task. Completed tasks remain visible on the board in a visually distinct (completed) state rather than disappearing.

**Why this priority**: Editing and the complete/reopen lifecycle turn captured titles into managed tasks and are required by the PRD ("Completed tasks remain visible and can be reopened"). They build on tasks existing on the board (Story 1) and round out task management, but the board is demonstrable without them, so P2.

**Independent Test**: Open a task, change its title/description/priority/labels and save; confirm changes persist. Mark it complete and confirm it stays visible in a completed state; reopen it and confirm it returns to open.

**Acceptance Scenarios**:

1. **Given** a task on the board, **When** the user opens it and edits the title, description, priority, or labels and saves, **Then** the changes are persisted and reflected on the board.
2. **Given** an open task, **When** the user marks it complete, **Then** it is shown in a completed (visually distinct) state and remains visible in its day rather than being removed.
3. **Given** a completed task, **When** the user reopens it, **Then** it returns to the open state and remains in its day.
4. **Given** a task detail view, **When** the user changes the due date to a date in a different day/week, **Then** the task moves to the day matching the new due date.
5. **Given** a task the user wants to remove, **When** they delete it, **Then** it is removed from the board and from persistence and no longer appears on reload.
6. **Given** a task edit that removes the title (empty), **When** the user tries to save, **Then** the save is rejected with a clear "title is required" message and the prior value is retained.

---

### Edge Cases

- **Unauthenticated / expired session**: If the session has expired when the Week view loads or when a change is submitted, the user is routed to log in (per Stage 2) and no task change is silently lost or applied under the wrong account.
- **Concurrent edits across devices**: If the same account has the board open on two devices and both change the same task, the system applies a last-write-wins update per the persistence model; the board reflects the latest saved state on refresh. (No real-time sync/collaboration is in scope.)
- **Week boundary / timezone**: Day placement is determined by the task's due date interpreted in a single consistent time reference so a task does not appear to jump days depending on the viewer's local clock; "today" and week boundaries (week starts Monday) are computed consistently.
- **Save failure / offline**: If a create, move, reorder, edit, or delete fails to persist (network/backend error), the user is shown a clear failure state and the board does not present the change as saved.
- **Drag dropped in place / invalid drop**: Dropping a card back onto its original position, or outside any column, results in no change.
- **Long titles / large day**: A very long task title is displayed without breaking the column layout; a day with many tasks scrolls within its column without breaking the board.
- **Rapid inline entry**: Adding several tasks in quick succession to one day preserves their creation order at the bottom of the day and persists each.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST present the Week view as seven day-columns ordered Monday through Sunday for a selected week, each labeled with its weekday and calendar date, with the column containing today visually distinguished when the current week is shown.
- **FR-002**: The system MUST display, in each day-column, the authenticated user's tasks whose due date falls on that day, in their persisted manual order.
- **FR-003**: The system MUST allow the user to create a task inline at the bottom of any day by entering a title, and MUST set the new task's due date to that day and append it to the bottom of that day's order.
- **FR-004**: The system MUST require a non-empty title to create or save a task and MUST reject empty/whitespace-only titles with clear, field-level feedback without creating or corrupting a task.
- **FR-005**: The system MUST allow the user to move a task to a different day via drag-and-drop, and MUST update the task's due date to the target day when moved.
- **FR-006**: The system MUST allow the user to reorder tasks within a day via drag-and-drop and MUST persist the resulting manual order so it is restored on subsequent visits.
- **FR-007**: The system MUST allow the user to navigate to the previous week, the next week, and directly back to the current week, re-rendering the board with the selected week's dates and the tasks due within it.
- **FR-008**: When a week other than the current week is displayed, the system MUST default a newly created task's due date to the displayed day it was added under, not to today.
- **FR-009**: The system MUST allow the user to open a task and view and edit its title, description, due date, priority, and labels, and MUST persist saved changes.
- **FR-010**: The system MUST reposition a task to the day matching its due date whenever the due date changes, whether changed by drag-and-drop or by editing the due date directly.
- **FR-011**: The system MUST support marking a task complete and reopening a completed task, and MUST keep completed tasks visible on the board in a visually distinct completed state rather than hiding or removing them.
- **FR-012**: The system MUST allow the user to delete a task, removing it from the board and from persistence.
- **FR-013**: The system MUST persist every task change (create, move, reorder, edit, complete/reopen, delete) durably so that the board state is restored on page reload and desktop-app restart.
- **FR-014**: The system MUST scope all task reads and writes to the authenticated owner so a user can only ever see and modify their own tasks, with ownership enforced at the data-access layer consistent with the Stage 2 isolation boundary; a request for another user's task MUST be denied without disclosing its existence.
- **FR-015**: The system MUST support a task's fields as defined by the product task model — title (required), description, due date (defaults to the day created), status (open/completed), priority (low/medium/high), and optional labels — and MUST default priority and status to sensible values (open; a defined default priority) when not specified.
- **FR-016**: The system MUST surface clear, user-facing states when a task operation fails to persist (network/backend/identity error) and MUST NOT present an unsaved change as saved.
- **FR-017**: The Week experience (board, columns, inline creation, drag-and-drop, task detail/editing, week navigation) MUST be delivered from the single shared frontend codebase and behave consistently on the PWA and desktop app, remaining responsive on smaller viewports and built from the shared design system.
- **FR-018**: Week behavior MUST be covered by automated unit/integration tests and end-to-end tests of the core flows (view week → create task → move across days → reorder within a day → complete/reopen → navigate weeks), including rejection of unauthenticated access and non-disclosure of other users' tasks, consistent with the project's test-first discipline.

### Key Entities

- **Task**: A unit of work owned by exactly one Account (the authenticated user). Key attributes: a unique identifier; owner reference (scopes all access); title (required); description (optional); due date (determines the day column it appears under; defaults to the day it was created); status (open or completed); priority (low, medium, or high); optional labels; and a manual ordering position within its day. The model is designed to also carry an optional project reference and links to notes for later stages, but those relationships are not created or exercised in this stage. Introduced in this stage as the product's core data entity.
- **Week (view construct)**: A derived, non-persisted representation of a seven-day span (Monday–Sunday) used to group and display Tasks by due date and to drive previous/next/current navigation. It is computed from the selected reference date rather than stored.
- **Label**: An optional, lightweight tag attached to a Task to aid categorization within the board. Treated as simple user-defined text/tags in this stage; richer label management is not in scope.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can open the Week view and add a task to a specific day in under 15 seconds, and the task appears on the correct day immediately.
- **SC-002**: 100% of task changes (create, move, reorder, edit, complete/reopen, delete) are still correctly reflected after a page reload and a desktop-app restart.
- **SC-003**: Dragging a task to a different day updates its due date to that day in 100% of tested cases, and the task appears under the new day after reload.
- **SC-004**: Manual within-day ordering is preserved across reloads in 100% of tested cases.
- **SC-005**: Week navigation always renders the correct seven Monday–Sunday dates for the selected week, and "current week" always returns to the week containing today, verified across week and month boundaries.
- **SC-006**: 100% of attempts by one authenticated user to read or modify another user's task are denied with no data disclosed, verified by automated tests.
- **SC-007**: The core Week flow (view → create → move across days → reorder → complete/reopen → navigate weeks) passes as an automated end-to-end test on both the PWA and desktop targets from the shared codebase.
- **SC-008**: Completed tasks remain visible on the board in a distinct state in 100% of cases and can be reopened, with no completed task disappearing from its day.
- **SC-009**: A user can locate and return to the current week from any other week in a single action.

## Assumptions

- Stage 2 authentication and per-user data isolation are in place; the Week view is a protected surface reachable only by an authenticated user, and all task persistence is scoped to the authenticated account using the established ownership boundary.
- This stage introduces the Task entity and its persistence for the first time; no Task data existed before this stage.
- The week starts on **Monday** and ends on Sunday, consistent with the PRD's Monday–Sunday column ordering.
- A task belongs to a single day determined by its due date; every task created via the Week board has a due date (it defaults to the day it was added under). Tasks with no due date (project backlog items) are a Projects-stage concern and are not created here.
- **Project reference** and **linked notes** are part of the eventual Task model but are **out of scope** for this stage's user experience because the Projects (Stage 4) and Notes (Stage 5) stages do not yet exist. The Task model is designed to accommodate them later without reshaping existing tasks; automatic surfacing of project tasks on the Week board is deferred to the Projects stage.
- Labels are treated as simple user-defined tags in this stage; a dedicated label-management experience is not in scope.
- Day placement uses a single consistent time reference for due dates so tasks do not shift columns based on the viewer's local timezone; a reasonable default (e.g., normalized/UTC-based date handling) is acceptable and will be fixed at planning time.
- Concurrency is handled with a simple last-write-wins model; real-time synchronization and collaboration are explicitly out of scope (per PRD MVP exclusions).
- Out-of-scope MVP capabilities (AI features, collaboration, calendar view, recurring tasks, notifications/reminders, file attachments) are not addressed in this stage.
- The Overview dashboard, which aggregates tasks across the app, is a later stage and is not part of this feature.
