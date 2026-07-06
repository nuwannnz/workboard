import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:4200';

/**
 * Playwright config for the frontend e2e sample (T039). Boots the frontend via
 * its Nx serve target and runs the shell smoke test against it.
 */
export default defineConfig({
  testDir: './src',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
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
  webServer: {
    command: 'npx nx serve frontend',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    cwd: '../..',
  },
});
