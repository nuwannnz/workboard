/**
 * Root Vitest workspace registration (T008). Discovers every package's
 * vitest config so `vitest` can run the whole workspace when invoked directly.
 * Nx still drives per-project `test` targets via `nx run-many -t test`.
 */
export default [
  'libs/*/vitest.config.ts',
  'apps/backend/vitest.config.ts',
  'apps/frontend/vitest.config.ts',
  'apps/infra/vitest.config.ts',
];
