# Phase 1 Data Model: Stage 2 — Authentication & Data Isolation

## Storage overview

- **Identity store**: Cognito user pool (Stage 1). Owns credentials, email, and
  verification/enabled status. The application **never** stores passwords or credential
  material (FR-013, Principle IV).
- **Application store**: DynamoDB single table `WorkBoard` (`PK`/`SK`), accessed only
  through the Repository layer. Stage 2 persists exactly one owned item type — the
  account profile — to prove the isolation boundary; no feature data is written.

## Entities

### Account (User)

The authenticated owner of all data. Credential material lives entirely in Cognito.

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| id (`sub`) | string | Cognito | Stable subject; the ownership key for every item |
| email | string | Cognito | Unique login identifier |
| emailVerified | boolean | Cognito | Must be true before first login (FR-003) |
| status | enabled / disabled | Cognito | Disabled/deleted accounts are rejected at the boundary (edge case) |

The app's shared `userSchema` (`libs/shared`) exposes only `{ id, email }` to app code;
verification/status are read from Cognito tokens/exceptions, not stored by the app.

### Session

An authenticated period for an Account, represented by Cognito tokens — not a DB row.

| Field | Type | Notes |
|-------|------|-------|
| idToken | JWT | Presented in `Authorization: Bearer` on protected requests; verified by the API Gateway Cognito authorizer, which forwards its claims (`sub`, `email`) to the Lambda |
| accessToken | JWT | Held by the client; not used for API authorization in this scope-less app |
| refreshToken | opaque | Used to silently renew an expired access token (FR-006) |
| expiry | timestamp | From token claims; expired access token → treated as unauthenticated (FR-006) |

Persisted client-side behind the platform adapter token store (web `localStorage`,
desktop secure store). Cleared on logout (FR-007).

### Account Profile (representative protected resource)

Minimal owned DynamoDB item that proves per-user isolation without feature data.

| Attribute | Value | Notes |
|-----------|-------|-------|
| PK | `USER#<sub>` | Ownership partition; derived only from the authenticated `sub` |
| SK | `PROFILE#<sub>` | Entity discriminator (`PROFILE#`) per Stage 1 key design |
| email | string | Copied from verified token claims on first access |
| createdAt | ISO-8601 string | Set on bootstrap |

Bootstrapped lazily on the first authenticated request. The repository derives the key
solely from `req.sub`, so cross-user access is structurally impossible (FR-011, SC-003).

## Key design (single-table)

- Reuses the Stage 1 decision: `PK` begins with `USER#<userId>`; `SK` carries the entity
  prefix. Stage 2 introduces the `PROFILE#` prefix in practice.
- The Repository layer **always** constructs `PK` from the authenticated `sub`; it never
  accepts a caller-supplied owner. A read/write for a key that resolves to another user's
  partition returns not-found — no existence disclosed.

## Validation rules

- **Email**: valid format (shared Zod `emailSchema`); Cognito is authoritative for
  uniqueness (FR-001).
- **Password**: min length 8, at least one lowercase letter and one digit — mirrored in a
  shared Zod schema for client-side field-level feedback and enforced authoritatively by
  the Cognito pool policy (FR-002). See [research.md](./research.md) §8.
- **Verification code**: non-empty; format validated by Cognito on `confirmRegistration`
  (FR-003).

## State transitions

### Account lifecycle (Cognito-managed)
```
(none) --signUp--> UNCONFIRMED --confirmRegistration--> CONFIRMED(enabled)
UNCONFIRMED --resendConfirmationCode--> UNCONFIRMED (new code; no duplicate account)
CONFIRMED --admin disable/delete--> DISABLED  (auth rejected at boundary)
```
Login is permitted only from `CONFIRMED(enabled)`; `UNCONFIRMED` login is refused and the
UI routes to verification (FR-005, Story 2.4).

### Session lifecycle
```
(unauthenticated) --login success--> ACTIVE
ACTIVE --access token expired, refresh valid--> ACTIVE (silent refresh)
ACTIVE --refresh expired / logout--> ENDED --> (unauthenticated)
```

## Shared schemas (libs/shared)

New/extended Zod schemas, imported by both frontend and backend (Principle V):

- `registerRequestSchema` — `{ email, password }`
- `verifyRequestSchema` — `{ email, code }`
- `resendVerificationRequestSchema` — `{ email }`
- `loginRequestSchema` — `{ email, password }`
- `meResponseSchema` — `{ id, email }` (the authenticated profile)

These make client-side validation and server-side request validation identical.
