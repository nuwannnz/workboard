# Phase 1 Data Model: Stage 1 — Project Setup & Foundation

Stage 1 provisions the persistence store and **shared type definitions only**. No domain feature logic (CRUD, auth flows, aggregation) is implemented (FR-018). The entities below ship as shared TypeScript types + Zod schemas in `libs/shared`; their runtime behavior is deferred to later stages.

## Storage shape

- **Store**: DynamoDB, single-table design, accessed exclusively through the backend Repository layer (FR-011, Principle IV).
- **Table (Stage 1 decision)**: one table `WorkBoard` with a partition key `PK` and sort key `SK`.
  - Ownership prefix: every item's `PK` begins with the owning user (`USER#<userId>`) so the repository layer can enforce per-user isolation at the lowest layer in later stages (Principle IV). Stage 1 wires the abstraction; it does not implement ownership checks on feature data.
  - Entity discriminator via `SK` prefix: `TASK#`, `PROJECT#`, `NOTE#`, `PROFILE#`.
- **Stage 1 usage**: only the health check touches DynamoDB (a lightweight connectivity probe). No task/project/note items are written or read by product code yet.

## Shared entities (placeholder types)

### Task
Core work item. Defined as a shared type; behavior deferred.

| Field | Type | Notes |
|-------|------|-------|
| id | string | Unique identifier |
| title | string | Required |
| description | string | Optional |
| dueDate | string (ISO date) \| null | Defaults to creation day in later stages |
| status | `'open' \| 'completed'` | Completed tasks remain visible (later stage) |
| priority | `'low' \| 'medium' \| 'high'` | |
| labels | string[] | Optional |
| projectId | string \| null | Optional project reference |
| linkedNoteIds | string[] | Links to Notes |

### Project
Grouping of tasks. Defined as a shared type; behavior deferred.

| Field | Type | Notes |
|-------|------|-------|
| id | string | Unique identifier |
| name | string | Required |
| description | string | Optional |
| color | string | Display color |

### Note
Markdown document. Defined as a shared type; behavior deferred.

| Field | Type | Notes |
|-------|------|-------|
| id | string | Unique identifier |
| title | string | Required |
| markdown | string | Markdown content |
| linkedProjectIds | string[] | Links to Projects |
| linkedTaskIds | string[] | Links to Tasks |

### User / Account
Authenticated owner of all data, backed by Cognito. Provisioned as infrastructure in Stage 1 (Cognito user pool); registration/login flows deferred.

| Field | Type | Notes |
|-------|------|-------|
| id | string | Cognito subject (`sub`) |
| email | string | Login identifier |

## Relationships

- A **Task** may reference one **Project** (`projectId`) and many **Notes** (`linkedNoteIds`).
- A **Note** may link to many **Projects** and **Tasks**.
- A **User** owns all Tasks, Projects, and Notes (enforced via `PK = USER#<userId>` in later stages).

## Validation rules (declared, enforced later)

- `title` (Task) and `name` (Project) are required non-empty strings.
- `status` and `priority` are constrained to their enum values.
- Zod schemas in `libs/shared` are the single source of truth for these shapes, imported by both frontend and backend so types/validation stay consistent (Principle V). Enforcement in request handlers is deferred to the feature stages (FR-018).

## State transitions

None implemented in Stage 1. (Task `open → completed → open` reopen flow and related transitions are deferred to the Week/Projects stages.)
