import { test, expect } from '@playwright/test';
import { E2E_ENABLED, openWeekBoard, currentWeekDates, addTask } from './support/session';

/**
 * US4 (FR-007/FR-008, SC-005/SC-009): next/prev advance the seven dates and show that week's
 * tasks; "This week" returns to today in a single action; adding on a non-current week
 * defaults the due date to the displayed day; an empty week still shows the empty state +
 * inline add. Runs under E2E_LOCAL or E2E_LIVE.
 */
function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

test.describe('Week board — navigate between weeks (US4)', () => {
  test.skip(!E2E_ENABLED, 'set E2E_LOCAL=1 (npm run e2e:local) or E2E_LIVE=1');

  test('advances a week, defaults due date to the displayed day, and returns to today', async ({
    page,
  }) => {
    await openWeekBoard(page);

    const current = currentWeekDates();
    const nextWeek = current.map((d) => addDays(d, 7));

    // Next week → dates advance seven days.
    await page.getByTestId('week-next').click();
    for (const date of nextWeek) {
      await expect(page.getByTestId(`day-column-${date}`)).toBeVisible();
    }

    // An empty day still offers the empty state + inline add.
    const targetDay = nextWeek[2];
    const column = page.getByTestId(`day-column-${targetDay}`);
    await expect(column.getByText('No tasks')).toBeVisible();

    // Adding here defaults the due date to the displayed day (not today).
    const title = `Next-week ${Date.now()}`;
    await addTask(page, targetDay, title);

    await page.reload();
    await page.getByTestId('week-next').click();
    await expect(page.getByTestId(`day-column-${targetDay}`).getByText(title)).toBeVisible();

    // "This week" returns to the week containing today in a single action.
    await page.getByTestId('week-today').click();
    for (const date of current) {
      await expect(page.getByTestId(`day-column-${date}`)).toBeVisible();
    }
  });
});
