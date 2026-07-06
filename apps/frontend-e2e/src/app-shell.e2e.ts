import { test, expect } from '@playwright/test';

/**
 * Sample e2e (T038): the running shell renders the four nav areas
 * (Week / Projects / Notes / Overview). Proves the Playwright layer is wired
 * end to end against the served frontend.
 */
test('app shell renders the four navigation areas', async ({ page }) => {
  await page.goto('/');

  for (const id of ['week', 'projects', 'notes', 'overview']) {
    await expect(page.getByTestId(`nav-${id}`)).toBeVisible();
  }

  await expect(page.getByRole('heading', { name: 'WorkBoard' })).toBeVisible();
});
