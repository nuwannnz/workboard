# Phase 0 Research: Stage 3 — Week Board

All Technical Context unknowns are resolved below. Each decision records the rationale and
the alternatives rejected, biased toward Principle VI (simplicity/YAGNI) and the Stage 2
patterns already in the codebase.

## §1. DynamoDB access pattern for reading a week of tasks

- **Decision**: Store each task as `PK = USER#<userId>`, `SK = TASK#<taskId>` with `dueDate`
  (`YYYY-MM-DD`) and `order` as plain attributes, where `userId` is the **app-level User
  UUID** resolved from the Cognito `sub` (see §11). Read a displayed week with a single
  `QueryCommand` on the user partition (`KeyConditionExpression: PK = :pk AND
  begins_with(SK, 'TASK#')`), then filter to the `from..to` date window and group by
  `dueDate` in the service. No secondary index.
- **Rationale**: This is a personal MVP; a single user's total task count is small (tens to
  low hundreds), so scanning one partition per week view is cheap and simple. Keeping
  `dueDate` as an attribute (not baked into the key) means **rescheduling a task is a single
  in-place `UpdateCommand`** — no delete+re-put to move it between days. Ownership falls out
  for free because `PK` is derived solely from the resolved `userId` (Principle IV).
- **Alternatives considered**:
  - *`SK = TASK#<dueDate>#<taskId>` + `begins_with`/range query per week*: lets DynamoDB
    filter the week server-side, but the item key then encodes a mutable field, so every
    reschedule (a signature Story-2 interaction) becomes a delete+put of a new key —
    fragile and more code for no benefit at this scale. Rejected.
  - *A GSI keyed on `dueDate`*: premature; adds infra, cost, and eventual-consistency
    nuance the current scale doesn't justify (Principle VI). Rejected.
  - *`GET /tasks` returns everything, group client-side*: acceptable but grows unbounded as
    weeks accumulate. Supporting an optional `from..to` filter keeps payloads bounded to the
    visible week while staying a single query. Chosen (server-side range filter).

## §2. Task identifier

- **Decision**: Generate task ids server-side as **ULIDs** (`ulid` package) in the service
  layer; the client never supplies the id.
- **Rationale**: ULIDs are unique, URL-safe, and lexicographically sortable by creation
  time, giving a stable tiebreaker and a natural "creation order" for rapid inline entry
  (spec Edge Case) without a separate timestamp sort. Server-generated ids prevent a client
  from targeting/guessing another partition's key.
- **Alternatives considered**: `crypto.randomUUID()` (fine, but not time-sortable — we'd
  lean harder on `createdAt` for tiebreaks); client-generated ids (rejected — trust boundary
  and collision risk).

## §3. Drag-and-drop library (cross-day move + within-day reorder)

- **Decision**: Use **`@dnd-kit/core` + `@dnd-kit/sortable`**. Model each day column as a
  droppable containing a `SortableContext` of task cards; a drag can end in the same column
  (reorder) or a different column (move → reschedule). Compute the new `order` from the
  drop neighbors via the fractional-index helpers (§4).
- **Rationale**: `@dnd-kit` is actively maintained, has first-class **keyboard and touch**
  sensors (accessibility + PWA/desktop parity, Principle II/FR-017), supports multi-container
  sortable lists (exactly the seven-column board), and is headless so it composes with
  shadcn/ui styling. It exposes drag start/over/end events that map cleanly to the
  optimistic-update flow.
- **Alternatives considered**:
  - *`react-beautiful-dnd`*: effectively unmaintained and React-18-StrictMode-hostile;
    rejected.
  - *Native HTML5 drag-and-drop*: weak touch support and poor keyboard a11y; would require
    hand-rolling what `@dnd-kit` provides. Rejected.
  - *`@hello-pangea/dnd`* (the RBD fork): viable, but `@dnd-kit` has better keyboard/touch
    sensors and multi-container ergonomics for a Kanban board. Rejected.

## §4. Manual within-day ordering scheme

- **Decision**: Give each task an `order` string that is a **fractional index** (a
  lexicographically-sortable rank key, LexoRank/`fractional-indexing` style). Tasks in a day
  render sorted ascending by `order`. Inserting at a position computes a key *between* the
  neighbors' keys; appending computes a key *after* the last. A move/reorder writes `order`
  on **only the moved task** — siblings are untouched.
- **Rationale**: O(1) writes per reorder and no cascade renumbering (durability + fewer
  round-trips, SC-004). A string rank sorts correctly in both the client and a DynamoDB
  attribute. Ties (or exhausted precision) fall back to the ULID id as a stable secondary
  sort. Implemented as a tiny local `ordering.ts` (append / between) — no heavy dependency
  required; a minimal fractional-indexing helper is a few lines.
- **Alternatives considered**:
  - *Integer position with renumber-on-reorder*: simple to read but every reorder rewrites
    many items (N writes, race-prone under last-write-wins). Rejected.
  - *Float midpoint positions*: works until float precision runs out after repeated inserts
    between the same pair; the string fractional index degrades gracefully instead. Rejected.

## §5. Timezone / day-placement model

- **Decision**: A task's `dueDate` is a **date-only `YYYY-MM-DD` string** with no
  time-of-day component. Day placement, "today", and week boundaries are all computed on
  these calendar-date strings (Monday-start). The board groups tasks by exact `dueDate`
  string equality to a column's date.
- **Rationale**: Storing an instant (with time/zone) is exactly what makes a task appear to
  "jump days" for viewers in different zones (spec Edge Case). A bare calendar date is
  unambiguous: the day a user filed a task under is the day it shows under, everywhere
  (FR-010). This also makes reschedule trivial — set a new date string.
- **Alternatives considered**: UTC ISO instants normalized to date at render (extra
  conversion, still risks off-by-one at midnight boundaries); per-user timezone setting
  (out of scope, no requirement). Rejected in favor of date-only.

## §6. Week computation (Monday-start)

- **Decision**: Pure functions in `week.ts`: `startOfWeek(ref)` returns the Monday of the
  week containing `ref`; `weekDays(monday)` returns the seven `YYYY-MM-DD` dates
  Monday→Sunday; `isToday(date)`, `addWeeks(monday, n)`, `todayDate()`. All operate on
  date-only values. Navigation state is a single `referenceMonday` in the page; prev/next
  add ∓7 days, "current" resets to the Monday of today.
- **Rationale**: Isolating week math as pure, dependency-light functions makes SC-005 (correct
  seven dates across week/month/year boundaries) directly unit-testable without React
  (Principle III). Monday-start matches the PRD/spec.
- **Alternatives considered**: A date library (`date-fns`, `dayjs`) — reasonable, but the
  handful of calendar-date operations needed here are small and self-contained; adding a
  dependency isn't justified yet (Principle VI). Revisit if date logic grows.

## §7. REST surface + how each interaction maps to it

- **Decision**: A minimal REST surface under `/tasks` (all behind the Stage 2 authorizer):
  - `GET /tasks?from=YYYY-MM-DD&to=YYYY-MM-DD` — list the owner's tasks with `dueDate` in
    `[from, to]` (the displayed week).
  - `POST /tasks` — create `{ title, dueDate, priority?, description?, labels? }`; server
    assigns `id`, appends `order` to that day, defaults `status='open'`,
    `priority='medium'`.
  - `PATCH /tasks/:id` — partial update. **One endpoint covers edit, move, reorder, and
    complete/reopen**: reschedule = `{ dueDate }`; reorder/move = `{ dueDate?, order }`;
    complete/reopen = `{ status }`; edit = any of `{ title, description, priority, labels }`.
  - `DELETE /tasks/:id` — delete.
- **Rationale**: Move and reorder are the same operation on the model (change `dueDate`
  and/or `order`), so a single `PATCH` avoids bespoke per-interaction endpoints (Principle
  VI) while keeping controllers thin. Partial update matches the task-detail dialog and the
  DnD flow equally.
- **Alternatives considered**: Dedicated `/tasks/:id/move`, `/tasks/:id/reorder`,
  `/tasks/:id/complete` verbs — more surface, more tests, no added clarity. Rejected.

## §8. Optimistic UI + save-failure handling

- **Decision**: Mutations (create, move, reorder, edit, complete, delete) update local board
  state **optimistically**, then call the API. On failure the change is **rolled back** to
  the pre-mutation state and a clear, non-blocking error is surfaced (toast/inline), so the
  board never presents an unsaved change as saved (FR-016, SC-002). A `401` is handled by the
  existing `api-client` refresh-then-redirect path (Stage 2). Concurrency is last-write-wins;
  a reload reflects the latest persisted state (spec Edge Case).
- **Rationale**: Optimistic updates meet the "appears immediately" UX targets (SC-001/SC-003)
  while rollback preserves the correctness guarantee that the board reflects only durably
  saved state. Reusing the Stage 2 `api-client` keeps auth handling in one place.
- **Alternatives considered**: Pessimistic (await server before moving the card) — safer but
  visibly laggy for drag-and-drop; rejected. Client-side offline queue/retry — out of scope
  (no offline requirement beyond surfacing failure). Rejected.

## §9. Shared Task schema extension

- **Decision**: Extend `libs/shared/src/schemas/task.ts`: add `order: z.string()`,
  `createdAt: z.string()`, `updatedAt: z.string()`; keep existing `projectId` (null this
  stage) and `linkedNoteIds` (`[]` this stage). Add request schemas: `createTaskSchema`
  (`title` required, `dueDate` required `YYYY-MM-DD`, optional `description`/`priority`/
  `labels`) and `updateTaskSchema` (all fields optional, but `title` if present must be
  non-empty). Both sides import these.
- **Rationale**: One source of truth for validation keeps the controller and the client in
  lockstep (Principle V) and enforces "non-empty title" (FR-004) identically. Keeping the
  deferred `projectId`/`linkedNoteIds` fields in the shape (unused) is exactly the "designed
  to accommodate later stages without reshaping data" the spec calls for.
- **Alternatives considered**: A separate Stage-3-only task type (rejected — divergence from
  the shared shape the spec deliberately preserves).

## §10. Testing strategy alignment

- **Decision**: Unit-test the pure modules (`week.ts`, `ordering.ts`) exhaustively across
  week/month/year boundaries and repeated-insert ordering; unit-test the repository against
  DynamoDB Local (as Stage 2 does) for ownership + cross-user not-found; unit-test the service
  for create/list-week/move/reorder/complete/delete and validation rejections; one Playwright
  spec drives the full core flow on the running frontend, plus specs for unauthenticated
  access and cross-user non-disclosure.
- **Rationale**: Mirrors Stage 2's proven layering and satisfies FR-018/SC-006/SC-007 with
  the highest-value coverage on the interactions most likely to silently corrupt user data
  (Principle III): due-date-on-move and manual order persistence.
- **Alternatives considered**: e2e-only coverage (too slow/flaky for the ordering/week-math
  edge cases); no e2e (violates Principle III priority coverage). Rejected.

## §11. Application-level User identity (UUID) vs. Cognito `sub`

- **Decision**: Introduce an **app-generated `userId` (UUID v4)** as the canonical owner of
  all feature data. The Cognito `sub` becomes an **authentication-only** attribute recorded
  on the User record; it is used solely to *find* the user, never as a foreign key on Tasks
  (or, later, Projects/Notes). Single-table items:
  - **User profile**: `PK = USER#<userId>`, `SK = PROFILE` → `{ id: userId, cognitoSub,
    email, createdAt }`.
  - **Auth pointer** (for `sub → userId` lookup): `PK = AUTH#<sub>`, `SK = AUTH#<sub>` →
    `{ userId, createdAt }`.
  - **Task**: `PK = USER#<userId>`, `SK = TASK#<taskId>`.
  This refactors the Stage 2 profile bootstrap, which keyed the profile directly on
  `PK = USER#<sub>`, `SK = PROFILE#<sub>`.
- **Rationale**: The user requirement is explicit — the User owns Tasks/Projects/Notes via a
  unique app id, and the `sub` is "only used for authentication." A provider-independent
  owner key means a future identity-provider change, a re-created Cognito user (which mints a
  **new** `sub` for the same person/email), or an eventual account-merge never orphans or
  re-keys existing data. Doing this now — before any Task data exists — costs nothing to
  migrate (spec Assumption: no Task data predates this stage) and is far cheaper than
  re-keying every item later. Ownership is still enforced at the lowest layer: the tasks
  repository builds `PK` solely from the resolved `userId` (Principle IV).
- **Bootstrap (idempotent)**: on an authenticated request with no existing pointer for `sub`,
  generate `userId = uuidv4()` and write the pointer **and** the profile in one
  `TransactWriteCommand`, each guarded by `attribute_not_exists(PK)`. If two concurrent cold
  requests race, one transaction wins and the loser re-reads the pointer — so exactly one
  `userId` is ever bound to a `sub`.
- **Alternatives considered**:
  - *Keep using `sub` as the owner key (Stage 2 status quo)*: simplest, but couples every row
    to the identity provider and violates the stated requirement; a re-issued `sub` would
    silently strand a user's whole board. Rejected.
  - *A GSI keyed on `cognitoSub` to look up the user*: works, but adds an index (infra + cost
    + eventual consistency) when a single deterministic pointer item does the same lookup with
    a strongly-consistent `GetItem` (Principle VI). Rejected.
  - *Use `sub` as `userId` but expose a separate public id*: still couples storage to the
    provider; doesn't satisfy "sub only for authentication." Rejected.

## §12. Resolving `sub → userId` at the request boundary (+ caching)

- **Decision**: Add a cross-cutting **`resolve-identity` middleware** that runs immediately
  after `authenticate` on protected feature routers. It reads the gateway-verified `sub`
  (and `email`), calls `identity.service.resolveUserId(sub, email)` (get-or-bootstrap per
  §11), and attaches `req.auth = { sub, email, userId }`. Feature controllers (Tasks) read
  **only** `req.auth.userId`. The mapping is cached in an **in-Lambda `Map<sub, userId>`**
  because a `sub → userId` binding is immutable once created, so a warm container resolves
  with zero DynamoDB calls; a cold container does at most one `GetItem` (or the one-time
  bootstrap transaction).
- **Rationale**: Placing resolution in middleware keeps it out of every controller and keeps
  the tasks module from importing the auth module's repository (Principle I: modules don't
  reach into each other; cross-cutting concerns live in middleware). Caching an immutable
  mapping is safe and removes a per-request read on the hot path (Performance Goals). The
  resolver lives in the auth module (which owns User records); the middleware composes it at
  the app wiring layer.
- **Alternatives considered**:
  - *Resolve inside each feature service*: duplicates the lookup across Tasks/Projects/Notes
    and tempts cross-module repository imports. Rejected.
  - *Put `userId` as a custom claim in the Cognito token*: avoids the lookup entirely but
    requires a Pre-Token-Generation Lambda + provisioning the claim before the user record
    exists (chicken-and-egg on first login) — more infra than a pointer item and cache.
    Deferred; revisit only if the cache proves insufficient. Rejected for now.
  - *External cache (e.g. DynamoDB DAX / ElastiCache)*: unjustified at personal scale; the
    in-process map suffices (Principle VI). Rejected.
