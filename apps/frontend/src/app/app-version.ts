/**
 * The app version stamped into the bundle at build time: the deploy pipeline injects the
 * computed release SemVer as `VITE_APP_VERSION` (contracts/frontend-build-config.md), so the
 * running app always reports the version of the Release that produced it (FR-016, SC-005).
 * Local/dev builds have no injected version and fall back to `0.0.0-dev`.
 */
export function appVersion(): string {
  return import.meta.env.VITE_APP_VERSION || '0.0.0-dev';
}
