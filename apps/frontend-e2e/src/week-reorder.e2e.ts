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
 * US3 (FR-006, SC-004): reorder cards within a day → the order reflows and persists across
 * reload (a manual order, not a default sort); a newly added task lands at the bottom.
 * Runs under E2E_LOCAL or E2E_LIVE.
 */
test.describe('Week board — reorder within a day (US3)', () => {
  test.skip(!E2E_ENABLED, 'set E2E_LOCAL=1 (npm run e2e:local) or E2E_LIVE=1');

  test('a new task lands at the bottom and manual order persists', async ({ page }) => {
    await openWeekBoard(page);
    const day = currentWeekDates()[3];
    const column = page.getByTestId(`day-column-${day}`);

    const stamp = Date.now();
    const titles = [`First ${stamp}`, `Second ${stamp}`, `Third ${stamp}`];
    for (const title of titles) {
      await addTask(page, day, title);
    }

    // New tasks appended at the bottom → cards render in creation order.
    const cardText = () => column.getByTestId(/^task-card-/).allTextContents();
    await expect.poll(cardText).toEqual(titles);

    // Reorder: drag the bottom card onto the top card; await the persisted order.
    const bottomId = await column.getByText(titles[2]).locator('..').getAttribute('data-testid');
    const topId = await column.getByText(titles[0]).locator('..').getAttribute('data-testid');
    await Promise.all([
      waitForTaskWrite(page),
      dragCardTo(page, bottomId as string, topId as string, { toTop: true }),
    ]);

    const reordered = [titles[2], titles[0], titles[1]];
    await expect.poll(cardText).toEqual(reordered);

    // Manual order persists across reload.
    await page.reload();
    await expect.poll(cardText).toEqual(reordered);
  });
});
