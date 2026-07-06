# Contract: Health/Status API

The only runtime interface exposed in Stage 1. It proves the backend's layered structure (route → controller → service → repository) and Lambda-compatible entry point are wired (FR-007, FR-008, US3), and gives the infrastructure story a reachable endpoint through API Gateway (US4).

## Endpoint

`GET /health`

- Served identically by the local Express entry (`main.ts`) and the Lambda entry (`lambda.ts`) via the shared `app.ts` factory.
- Must flow through the full layer stack: **route → controller → service → repository (DynamoDB connectivity probe)**. No persistence or business logic in the route/controller (Principle I).

## Response — healthy (200)

```json
{
  "status": "healthy",
  "service": "workboard-backend",
  "checks": {
    "persistence": "healthy"
  },
  "timestamp": "2026-07-06T00:00:00.000Z"
}
```

## Response — degraded/unhealthy (503)

Returned when the DynamoDB connectivity probe fails (FR-007, SC-004, edge case: backend cannot reach the database).

```json
{
  "status": "unhealthy",
  "service": "workboard-backend",
  "checks": {
    "persistence": "unhealthy"
  },
  "timestamp": "2026-07-06T00:00:00.000Z"
}
```

## Contract expectations

| # | Given | When | Then |
|---|-------|------|------|
| 1 | Backend running locally, DynamoDB reachable | `GET /health` | `200` with `status: "healthy"` and `checks.persistence: "healthy"` |
| 2 | Backend running, persistence unreachable | `GET /health` | `503` with `status: "unhealthy"` and `checks.persistence: "unhealthy"` |
| 3 | Deployed stack | `GET /health` through API Gateway URL | `200` healthy response (US4 AS4) |
| 4 | Codebase inspection | — | The response is produced by a service+repository call, not assembled inline in the route/controller |

## Out of scope (Stage 1)

No authentication is applied to `/health`, and no feature endpoints (tasks, projects, notes, overview, auth) exist yet (FR-018). The `modules/*` folders are empty placeholders.
