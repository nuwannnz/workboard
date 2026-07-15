import { mergeConfig, defineConfig } from 'vitest/config';
import { vitestBase } from './vitest/vitest.base';

export default mergeConfig(
  vitestBase,
  defineConfig({
    test: {
      name: 'tools',
      environment: 'node',
      include: ['scripts/**/*.spec.mjs'],
    },
  }),
);
