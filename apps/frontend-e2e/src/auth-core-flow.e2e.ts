import { test, expect } from '@playwright/test';

/**
 * Core-flow e2e (T044, SC-006, FR-016): register → verify → login → access the protected
 * shell → logout, from the shared frontend code (same suite covers PWA and desktop).
 *
 * The happy path drives real Cognito (SRP register + emailed verification code) and the
 * deployed API, so it runs only when `E2E_LIVE=1` and the required test context is provided
 * (a controllable inbox for the verification code — see quickstart.md). Without it the test
 * is skipped so the suite stays green in environments without infrastructure. The unit /
 * integration suites cover the same logic deterministically offline.
 */
const LIVE = process.env.E2E_LIVE === '1';

test.describe('register → verify → login → access → logout', () => {
  test.skip(!LIVE, 'requires a deployed Cognito + API and a test inbox (set E2E_LIVE=1)');

  test('completes the full account lifecycle from the shared UI', async ({ page }) => {
    const email = process.env.E2E_TEST_EMAIL as string;
    const password = process.env.E2E_TEST_PASSWORD as string;
    const getVerificationCode = async (): Promise<string> => {
      // Supplied by the CI harness that reads the controllable test inbox.
      const code = process.env.E2E_VERIFICATION_CODE;
      if (!code) throw new Error('E2E_VERIFICATION_CODE not provided by the test harness');
      return code;
    };

    // Register.
    await page.goto('/register');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /create account/i }).click();

    // Verify.
    await expect(page).toHaveURL(/\/verify/);
    await page.getByLabel('Verification code').fill(await getVerificationCode());
    await page.getByRole('button', { name: /^verify$/i }).click();

    // Login.
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();

    // Access the protected shell.
    await expect(page.getByTestId('nav-week')).toBeVisible();

    // Session survives a reload (FR-006 / SC-004).
    await page.reload();
    await expect(page.getByTestId('nav-week')).toBeVisible();

    // Logout → back to /login; reload stays logged out.
    await page.getByTestId('logout').click();
    await expect(page).toHaveURL(/\/login/);
    await page.reload();
    await expect(page).toHaveURL(/\/login/);
  });
});
