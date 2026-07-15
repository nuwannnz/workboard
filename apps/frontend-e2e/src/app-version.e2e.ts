import { test, expect } from '@playwright/test';
import { E2E_ENABLED, openWeekBoard } from './support/session';

/**
 * US3 (FR-016, SC-005): the authenticated shell surfaces the app version in the sidebar
 * footer at `data-testid="app-version"`. Locally the build carries no injected version, so
 * the fallback `v0.0.0-dev` renders; a deployed build shows the pipeline-computed `vX.Y.Z`.
 * Runs under E2E_LOCAL or E2E_LIVE.
 */
test.describe('App version indicator (US3)', () => {
  test.skip(!E2E_ENABLED, 'set E2E_LOCAL=1 (npm run e2e:local) or E2E_LIVE=1');

  test('authenticated shell displays a SemVer app version', async ({ page }) => {
    await openWeekBoard(page);

    const version = page.getByTestId('app-version');
    await expect(version).toBeVisible();
    // `v` + SemVer, optionally suffixed (e.g. v1.4.0 or the local v0.0.0-dev fallback).
    await expect(version).toHaveText(/^v\d+\.\d+\.\d+(-[\w.]+)?$/);
  });
});
