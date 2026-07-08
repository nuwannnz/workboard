import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:4200';

/** Fully-local mode (`npm run e2e:local`): drive the real backend + cognito-local stack. */
const LOCAL = process.env.E2E_LOCAL === '1';

/**
 * Playwright config for the frontend e2e suite.
 *
 * - Default / E2E_LIVE: boots only the frontend (`nx serve frontend`); the Week specs skip
 *   unless E2E_LIVE points them at a deployed API.
 * - E2E_LOCAL (`npm run e2e:local`): also boots the backend so the specs run end-to-end
 *   against the local DynamoDB + cognito-local stack. `local-stack.mjs` (run first by the
 *   npm script) brings up Docker + seeds + writes the `.env` files; a running `npm run local`
 *   is reused via `reuseExistingServer`.
 */
const frontendServer = {
  command: 'npx nx serve frontend',
  url: baseURL,
  reuseExistingServer: !process.env.CI,
  timeout: 120_000,
  cwd: '../..',
};

const backendServer = {
  command: 'npx nx serve backend',
  url: 'http://localhost:3000/health',
  reuseExistingServer: !process.env.CI,
  timeout: 120_000,
  cwd: '../..',
};

export default defineConfig({
  testDir: './src',
  testMatch: '**/*.e2e.ts',
  // Local mode shares one backend + cognito-local emulator; run serially so concurrent
  // register/login/writes don't overwhelm the emulator and make specs flaky.
  fullyParallel: !LOCAL,
  workers: LOCAL ? 1 : undefined,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: LOCAL ? [backendServer, frontendServer] : frontendServer,
});
