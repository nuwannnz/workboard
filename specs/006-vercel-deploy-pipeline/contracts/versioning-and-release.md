# Contract: Versioning & Release

How a production deploy gets a version, how it's recorded, and how that version reaches the UI.

## Version scheme

- **Format**: SemVer `MAJOR.MINOR.PATCH`; git tag `vMAJOR.MINOR.PATCH` (constitution SemVer policy).
- **Derivation** (from Conventional Commits since the last tag — repo enforces
  `@commitlint/config-conventional`):

  | Commit types since last tag | Bump |
  |-----------------------------|------|
  | any `!` / `BREAKING CHANGE:` | MAJOR |
  | at least one `feat:` (no breaking) | MINOR |
  | only `fix:` (or other non-breaking) | PATCH |

- **Strictly increasing** (FR-014): each new version > the previous tag. The tool derives from the
  latest tag, so ordering is guaranteed.
- **Seed**: no tags exist yet; the first run establishes the baseline version (documented in
  `quickstart.md`).

## Release record

Created as the **final** step of a successful deploy run (contract: deploy-pipeline §7):

- Annotated git tag `vX.Y.Z` on the merge commit (identifies exact source — FR-015).
- GitHub Release for that tag; body may be auto-generated from Conventional Commit subjects.
- The **latest** Release ⇔ what is live, because the tag is only created after both deploys pass
  (FR-010, FR-017). No separate "isLive" store is needed.

## Version → UI path (FR-016, user request)

```text
tag action new_version ──▶ VITE_APP_VERSION (build env, step 5)
   ──▶ Vite inlines import.meta.env.VITE_APP_VERSION into the bundle
   ──▶ app-version.ts reads it (fallback "0.0.0-dev" when unset, e.g. local dev)
   ──▶ AppShell renders  v{version}  in the sidebar footer (data-testid="app-version")
```

- **Contract**: after a successful deploy, the version shown in the running app **equals** the
  latest Release version (SC-005). The `data-testid="app-version"` element is the stable test hook.
- Renders identically in PWA and Tauri (one shared component — Principle II).

## Rollback (US4, SC-006)

- **Frontend**: re-run the pipeline (or a `workflow_dispatch`) at a previous `vX.Y.Z` tag → rebuild
  with that tag's source + current CDK outputs + that version, `vercel deploy --prod`. (Manual
  fallback: promote the prior Vercel deployment in the dashboard.)
- **Backend**: `cdk deploy` from the previous tag if the backend must also roll back.
- **Data**: DynamoDB is retained and **never** reverted by rollback (FR-019).
- **Traceability**: the maintainer reads Releases to see the live version + its commit, and picks a
  prior known-good tag to redeploy — no manual rebuild-by-hand (FR-017, FR-018, SC-006).

## Invariants

- **INV-1**: exactly one version per successful deploy; none on failure (FR-013, SC-007).
- **INV-2**: version strictly increases across deploys (FR-014, SC-004).
- **INV-3**: UI-reported version matches the live Release after deploy (FR-016, SC-005).
- **INV-4**: every Release ties to the exact commit deployed (FR-015, FR-017).
