import { defineConfig } from 'vitest/config';

/**
 * Shared Vitest base preset reused by every package (T008).
 * Packages spread this into their own config and override `test.environment`,
 * `root`, and `plugins` as needed.
 */
export const vitestBase = defineConfig({
  test: {
    globals: true,
    passWithNoTests: true,
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
    },
  },
});

export default vitestBase;
