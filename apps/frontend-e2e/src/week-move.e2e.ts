import { test, expect } from '@playwright/test';
import {
  E2E_ENABLED,
  openWeekBoard,
  currentWeekDates,
  addTask,
  waitForTaskWrite,
  dragCardTo,
} from './support/session';

/**
 * US2 (FR-005/FR-010, SC-003): drag a card to another day → it sits under the target day
 * with that day's due date and persists across reload. Runs under E2E_LOCAL or E2E_LIVE.
 */
test.describe('Week board — reschedule by dragging (US2)', () => {
  test.skip(!E2E_ENABLED, 'set E2E_LOCAL=1 (npm run e2e:local) or E2E_LIVE=1');

  test('moves a card to another day and persists across reload', async ({ page }) => {
    await openWeekBoard(page);
    const days = currentWeekDates();
    const fromDay = days[0];
    const toDay = days[1];

    const title = `Move ${Date.now()}`;
    await addTask(page, fromDay, title);

    const fromColumn = page.getByTestId(`day-column-${fromDay}`);
    const cardId = await fromColumn.getByText(title).locator('..').getAttribute('data-testid');

    // Drag the card onto the next day's column; wait for the persisted move (PATCH).
    await Promise.all([
      waitForTaskWrite(page),
      dragCardTo(page, cardId as string, `day-column-${toDay}`),
    ]);

    // Now under the next day, and still there after reload.
    await expect(page.getByTestId(`day-column-${toDay}`).getByText(title)).toBeVisible();
    await page.reload();
    await expect(page.getByTestId(`day-column-${toDay}`).getByText(title)).toBeVisible();
  });
});
