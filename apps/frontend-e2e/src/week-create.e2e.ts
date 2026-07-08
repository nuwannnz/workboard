import { test, expect } from '@playwright/test';
import { E2E_ENABLED, openWeekBoard, currentWeekDates, addTask } from './support/session';

/**
 * US1 core flow (FR-001/FR-003/FR-013, SC-005): open Week → seven dated columns with today
 * distinguished → inline-add under a day → the card appears at the bottom with that day's
 * date → reload → it is still present.
 *
 * Runs locally with `npm run e2e:local` (E2E_LOCAL) or against a deployed API (E2E_LIVE);
 * skips otherwise (the Vitest suites cover the logic offline).
 */
test.describe('Week board — view & capture tasks (US1)', () => {
  test.skip(!E2E_ENABLED, 'set E2E_LOCAL=1 (npm run e2e:local) or E2E_LIVE=1');

  test('shows seven dated columns and captures a persisted task', async ({ page }) => {
    await openWeekBoard(page);
    const days = currentWeekDates();

    // Seven Monday→Sunday columns, correctly dated.
    for (const date of days) {
      await expect(page.getByTestId(`day-column-${date}`)).toBeVisible();
    }

    // Add a task under the third day (mid-week) via the inline control.
    const targetDay = days[2];
    const title = `E2E task ${Date.now()}`;
    await addTask(page, targetDay, title);

    // Survives a reload (durably persisted, owner-scoped).
    await page.reload();
    await expect(page.getByTestId(`day-column-${targetDay}`).getByText(title)).toBeVisible();
  });
});
