import { test, expect } from '@playwright/test';
import {
  E2E_ENABLED,
  openWeekBoard,
  currentWeekDates,
  addTask,
  waitForTaskWrite,
} from './support/session';

/**
 * US5 (FR-009/FR-010/FR-011/FR-012, SC-008, Story 5.1–5.6): open detail → edit + save
 * persists; complete → visible distinct; reopen; change due date → moves day; delete → gone
 * after reload; empty-title save → "title required" with the prior title kept.
 * Runs under E2E_LOCAL or E2E_LIVE.
 */
test.describe('Week board — edit / complete / delete (US5)', () => {
  test.skip(!E2E_ENABLED, 'set E2E_LOCAL=1 (npm run e2e:local) or E2E_LIVE=1');

  test('edits, toggles, reschedules, rejects empty title, and deletes', async ({ page }) => {
    await openWeekBoard(page);
    const days = currentWeekDates();
    const day = days[1];
    const nextDay = days[2];

    const title = `Detail ${Date.now()}`;
    await addTask(page, day, title);
    const column = page.getByTestId(`day-column-${day}`);

    // Open the detail dialog.
    await column.getByText(title).click();
    const dialog = page.getByTestId('task-detail-dialog');
    await expect(dialog).toBeVisible();

    // Empty title on save → rejected, prior title retained.
    await page.getByTestId('detail-title').fill('');
    await page.getByTestId('detail-save').click();
    await expect(dialog.getByText('Title is required')).toBeVisible();

    // Edit the title + priority and save.
    const edited = `${title} edited`;
    await page.getByTestId('detail-title').fill(edited);
    await page.getByTestId('detail-priority').selectOption('high');
    await page.getByTestId('detail-save').click();
    await expect(dialog).toBeHidden();
    await expect(column.getByText(edited)).toBeVisible();

    // Complete → stays visible in a distinct (strikethrough) state. The `line-through` is on
    // the card container (the parent of the title span), so assert there.
    await column.getByText(edited).click();
    await page.getByTestId('detail-toggle-complete').click();
    const completedText = page.getByTestId(`day-column-${day}`).getByText(edited);
    await expect(completedText).toBeVisible();
    await expect(completedText.locator('..')).toHaveCSS('text-decoration-line', 'line-through');

    // Reopen, then change due date → moves to the matching day.
    await completedText.click();
    await page.getByTestId('detail-toggle-complete').click(); // reopen
    await page.getByTestId(`day-column-${day}`).getByText(edited).click();
    await page.getByTestId('detail-duedate').fill(nextDay);
    await page.getByTestId('detail-save').click();
    await expect(page.getByTestId(`day-column-${nextDay}`).getByText(edited)).toBeVisible();

    // Delete → gone after reload (wait for the DELETE to persist before reloading).
    await page.getByTestId(`day-column-${nextDay}`).getByText(edited).click();
    await Promise.all([
      waitForTaskWrite(page),
      page.getByTestId('detail-delete').click(),
    ]);
    await expect(page.getByText(edited)).toHaveCount(0);
    await page.reload();
    await expect(page.getByText(edited)).toHaveCount(0);
  });
});
