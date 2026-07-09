# Phase 0 Research: Stage 4 — Projects

Resolves the design unknowns implied by the spec and Technical Context. Each item records the
decision, why it was chosen, and the alternatives rejected. There are no open
`NEEDS CLARIFICATION` markers: the spec's one materially-data-affecting choice (project deletion
cascades to tasks) was already fixed in the spec's Assumptions and is confirmed here (§5).

## §1. Reuse the Stage 3 Task model vs. a separate project-task model

**Decision**: Reuse the **same Task entity**. Stage 3 already reserved `projectId: string | null`
and `linkedNoteIds: string[]` in the shared shape and persists tasks as
`PK = USER#<userId>`, `SK = TASK#<id>`. Stage 4 populates `projectId` and permits `dueDate = null`;
it introduces **no** second task type.

**Rationale**: The PRD states "Project tasks use the same Task model" and the Stage 3 data-model
explicitly deferred `projectId` to Stage 4 with "no reshaping or migration." Reusing the model
means a task can be simultaneously a backlog item and a Week card with zero duplication, which is
exactly the FR-011/FR-013 requirement.

**Alternatives rejected**: A distinct `ProjectTask` entity would duplicate CRUD, validation, and
ordering and would make "a scheduled project task also appears on the Week board" a
cross-entity sync problem instead of a single record surfaced by two reads.

## §2. Reading a project's backlog — partition filter vs. GSI

**Decision**: Read a project's tasks with a **single `Query` on the owner partition**
(`PK = USER#<userId>`, `begins_with(SK, 'TASK#')`) and a `FilterExpression` of
`projectId = :projectId`. No secondary index.

**Rationale**: All of a user's tasks already live in one partition (Stage 3). For a personal MVP
the number of tasks per user is small, so filtering in-partition is cheap and needs no new access
structure — directly honoring Principle VI. A GSI would add provisioned/managed infrastructure
(Principle V change) and index-maintenance cost for no current benefit.

**Alternatives rejected**: (a) A `GSI1` on `projectId` — premature at this scale, adds infra. (b)
A duplicated `PROJECT#<id>#TASK#<id>` item per task — write amplification + consistency burden.

**Note**: A task with both a `projectId` and a `dueDate` is returned by **both** the Week window
query (matches `dueDate`) and the project query (matches `projectId`). That is the intended
behavior (FR-011): one record surfaced by two reads, no duplication.

## §3. Where project-task CRUD lives — extend the tasks module

**Decision**: **All Task read/write stays in the tasks module.** The projects module owns only
Project CRUD. The backlog uses the tasks endpoints: `POST /tasks` (with `projectId`, optional
`dueDate`), `PATCH /tasks/:id`, `DELETE /tasks/:id`, and a project-scoped list
`GET /tasks?projectId=…`. Concretely, extend:
- `createTaskSchema`: `dueDate` optional; `projectId` optional.
- `updateTaskSchema`: `dueDate` nullable (clear → back to backlog); `projectId` settable/clearable.
- `tasks.repository`: add `queryByProject(userId, projectId)` and a delete-by-project helper.
- `tasks.service`: create computes `order` against the correct sibling set (the project's tasks
  when no `dueDate`, else the day's tasks); add `listByProject`, `deleteByProject`.

**Rationale**: Principle I forbids a module reaching into another module's repository/domain.
Keeping every Task persistence path in the tasks module preserves that boundary while letting the
backlog be "just tasks."

**Alternatives rejected**: Duplicating task CRUD inside the projects module — violates Principle I
and the single-source Task model (§1).

## §4. Computing project progress — client-side derived value

**Decision**: Compute progress (`completed ÷ total`) **on the client**, from the backlog the
project-detail page already loads, via a pure `progress(tasks)` helper. It is never persisted.

**Rationale**: Progress is defined in the spec as a **derived, non-persisted construct** and must
recompute as tasks change (FR-010). Computing it client-side keeps the backend modules cleanly
decoupled (the projects service would otherwise have to read tasks to aggregate, coupling it to
the tasks module for a value the UI can trivially derive). A pure function is trivially unit-test
able and zero-safe (0 tasks → 0%, no division artifact).

**Alternatives rejected**: (a) Persisting `completedCount`/`totalCount` on the Project — invites
drift and needs transactional updates on every task change. (b) A backend aggregate endpoint —
adds a round trip and cross-module read for data the detail page already holds.

## §5. Deleting a project — cascade to its tasks (confirmed)

**Decision**: Deleting a project **also deletes all tasks belonging to it** (backlog and
scheduled), after an explicit client-side warning/confirmation. Implemented as: the projects
service resolves the project's task ids via the **tasks service** and deletes them, then deletes
the project record.

**Rationale**: A backlog-only task (no due date) with no project would have no home surface, so
"detach on delete" is incoherent for those tasks. Cascade is the simplest coherent behavior and
matches "a project owns its tasks." The cross-module step goes through the tasks module's
**public service API** (`listByProject` + `deleteByProject`) — the sanctioned seam — so Principle I
holds (no reach into the tasks repository/domain).

**Alternatives rejected**: (a) Block deletion while tasks exist — worse UX, and the spec chose
cascade. (b) Detach (null out `projectId`) — orphans no-due-date tasks (see above). (c) Cascade
implemented by the projects repository directly deleting `TASK#` items — violates Principle I.

**Atomicity note**: DynamoDB has no cross-item transaction spanning an unbounded set cheaply. For
a personal-scale project the cascade issues a `Query` then batched `DeleteCommand`s (or
`BatchWrite`) followed by the project delete; if it partially fails the client surfaces a failure
state (FR-018) and a retry is idempotent (deleting an already-deleted id is a no-op not-found).
This is acceptable for the MVP (last-write-wins, single user); a fully-atomic transaction is
out of scope (Principle VI).

## §6. Manual ordering across two groupings with one `order` field

**Decision**: Keep the **single `order` field** on Task. A day column sorts its tasks by `order`;
a project backlog sorts its tasks by `order`. Reorder within either grouping computes a fractional
`between(prev, next)` rank using the existing `ordering.ts` helpers, against that grouping's
sibling set.

**Rationale**: One comparable rank string orders any subset consistently. Reusing the Stage 3
fractional-index approach means a reorder rewrites only the moved card (SC-005) with no new
mechanism. For a scheduled project task (in both a day and a backlog), a reorder in one view can
shift its relative position in the other — an accepted MVP simplification (last-write-wins, one
field), explicitly not worth a per-context ordering scheme (Principle VI).

**Alternatives rejected**: Separate `dayOrder` / `backlogOrder` fields — doubles the ordering
surface and migration for a rare cross-grouping edge case with no validated need.

## §7. Project color — fixed palette vs. free-form picker

**Decision**: `color` is a **token from a fixed palette** defined once in `libs/shared`
(`PROJECT_COLORS`), validated by the shared schema (`z.enum`). A default token is applied when
none is chosen, so every project always has a valid color.

**Rationale**: The PRD lists "Color" as a simple project attribute; a curated palette guarantees
accessible, on-brand colors that render consistently on the card, detail header, and the Week
board project badge, and keeps validation trivial and identical on both sides (Principle V).

**Alternatives rejected**: A free-form hex/color picker — arbitrary contrast/theming problems and
looser validation, with no MVP benefit (Principle VI).

## §8. `projectId` generation

**Decision**: Generate `projectId` with **ULID** (already a backend dependency), server-side,
never client-supplied — mirroring Stage 3 task ids.

**Rationale**: Time-sortable, collision-resistant, no new dependency, consistent with the existing
id strategy. The SK is `PROJECT#<ulid>`.

**Alternatives rejected**: `uuid` (also present, but ULID gives natural creation ordering);
client-supplied ids (breaks the server-authoritative id invariant, Principle IV).

## §9. Showing project name/color on the Week board

**Decision**: The Week board loads the user's **projects list once** (a single `GET /projects`)
and builds a `projectId → { name, color }` map; a scheduled task with a `projectId` renders a
small project badge on its `task-card`. Standalone tasks (no `projectId`) render no badge.

**Rationale**: One extra list read hydrates every day card's project label without per-task
lookups; the map recomputes only when projects change. Keeps the Week query unchanged (§2).

**Alternatives rejected**: Embedding denormalized project name/color on each task item — drift on
project rename/recolor (FR-014 requires the rename to propagate) and write amplification.

## §10. No new infrastructure

**Decision**: **No `apps/infra` change.** Stage 2's greedy protected `ANY /{proxy+}` already routes
`/projects/*` through the Cognito authorizer to the single Lambda, the DynamoDB table already
grants the Lambda read/write, and Project items live in the same single table with no GSI (§2).

**Rationale**: Confirmed against `apps/infra/lib/api-stack.ts` (greedy protected proxy) — Stage 4's
REST surface is fully covered. Adding infra would violate Principle VI with no need.

**Alternatives rejected**: A dedicated `/projects` API Gateway resource or a GSI — unnecessary
(§2), adds infra surface.
