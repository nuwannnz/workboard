import { mergeConfig, defineConfig } from 'vitest/config';
import { vitestBase } from '../../tools/vitest/vitest.base';

export default mergeConfig(
  vitestBase,
  defineConfig({
    test: {
      name: 'infra',
      environment: 'node',
      include: ['lib/**/*.spec.ts', 'bin/**/*.spec.ts'],
      // CDK asset bundling (esbuild) can take a moment on first synth.
      testTimeout: 60000,
    },
  }),
);
