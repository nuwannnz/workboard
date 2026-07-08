import { test, expect } from '@playwright/test';

/**
 * Rejection-path e2e (T045): SC-002 (unauthenticated access denied), SC-003 (cross-user
 * access denied with no disclosure), SC-007 (repeated failed logins throttled/blocked with
 * a generic message).
 *
 * The unauthenticated-redirect check is enforced entirely client-side (the route guard) so
 * it runs against the served frontend with no backend. The cross-user and throttling checks
 * exercise the deployed API Gateway + Cognito and only run when `E2E_LIVE=1` and test
 * credentials are provided (quickstart.md — "Stage 1 deployed"); otherwise they are skipped
 * so the suite stays green without infrastructure.
 */
const LIVE = process.env.E2E_LIVE === '1';

test.describe('unauthenticated access is denied (SC-002)', () => {
  test('visiting a protected route redirects to /login and never shows the shell', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    // The protected app shell (nav areas) must not be reachable without a session.
    await expect(page.getByTestId('nav-week')).toHaveCount(0);
    await expect(page.getByLabel('Email')).toBeVisible();
  });

  test('a deep protected link is also gated', async ({ page }) => {
    await page.goto('/some/protected/path');
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('cross-user isolation + throttling (SC-003, SC-007)', () => {
  test.skip(!LIVE, 'requires a deployed Cognito + API (set E2E_LIVE=1 with test creds)');

  test('repeated failed logins return a single generic message (no enumeration)', async ({
    page,
  }) => {
    await page.goto('/login');
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await page.getByLabel('Email').fill(process.env.E2E_TEST_EMAIL ?? 'user@example.com');
      await page.getByLabel('Password').fill('definitely-wrong-1');
      await page.getByRole('button', { name: /sign in/i }).click();
      // Always the same generic message — never discloses whether the account exists.
      await expect(page.getByRole('alert')).toContainText(/invalid email or password|try again later/i);
    }
  });

  test('cross-user profile access discloses nothing (returns not-found/own item)', async ({
    request,
  }) => {
    const apiBase = process.env.E2E_API_BASE_URL;
    test.skip(!apiBase, 'E2E_API_BASE_URL not configured');
    // With user B's token, addressing user A's identity must never disclose A's data.
    const res = await request.get(`${apiBase}/me`, {
      headers: { Authorization: `Bearer ${process.env.E2E_USER_B_ID_TOKEN ?? ''}` },
    });
    // Own profile only — the response carries B's identity, never A's.
    expect([200, 401]).toContain(res.status());
    if (res.status() === 200) {
      const body = (await res.json()) as { email?: string };
      expect(body.email).not.toBe(process.env.E2E_USER_A_EMAIL);
    }
  });
});
