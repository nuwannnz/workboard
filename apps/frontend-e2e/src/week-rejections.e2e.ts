import { test, expect } from '@playwright/test';
import {
  E2E_ENABLED,
  E2E_LOCAL,
  registerAndLogin,
  login,
  uniqueEmail,
  currentWeekDates,
  addTask,
} from './support/session';

/**
 * Denial paths (SC-006, FR-014). The unauthenticated redirect runs offline against the
 * frontend alone (no backend needed); the cross-user non-disclosure check drives real auth +
 * persistence and runs under E2E_LOCAL (two fresh accounts) or E2E_LIVE (two seeded accounts).
 */
test.describe('Week board — access denial', () => {
  test('unauthenticated access to /week redirects to /login', async ({ page }) => {
    await page.goto('/week');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByTestId('nav-week')).toHaveCount(0);
  });
});

test.describe('Week board — cross-user isolation', () => {
  test.skip(!E2E_ENABLED, 'set E2E_LOCAL=1 (npm run e2e:local) or E2E_LIVE=1');

  test('one user cannot see another user’s task', async ({ browser }) => {
    // User A creates a task.
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    if (E2E_LOCAL) await registerAndLogin(pageA, uniqueEmail('userA'));
    else await login(pageA, process.env.E2E_TEST_EMAIL as string, process.env.E2E_TEST_PASSWORD as string);
    await pageA.getByTestId('nav-week').click();

    const day = currentWeekDates()[0];
    const title = `A-only ${Date.now()}`;
    await addTask(pageA, day, title);
    await pageA.reload(); // ensure it persisted server-side
    await expect(pageA.getByTestId(`day-column-${day}`).getByText(title)).toBeVisible();

    // User B never sees A's task.
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    if (E2E_LOCAL) await registerAndLogin(pageB, uniqueEmail('userB'));
    else await login(pageB, process.env.E2E_TEST_EMAIL_B as string, process.env.E2E_TEST_PASSWORD_B as string);
    await pageB.getByTestId('nav-week').click();
    await expect(pageB.getByText(title)).toHaveCount(0);

    await ctxA.close();
    await ctxB.close();
  });
});
