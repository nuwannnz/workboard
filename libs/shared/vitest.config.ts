import { mergeConfig, defineConfig } from 'vitest/config';
import { vitestBase } from '../../tools/vitest/vitest.base';

export default mergeConfig(
  vitestBase,
  defineConfig({
    test: {
      name: 'shared',
      environment: 'node',
      include: ['src/**/*.spec.ts'],
    },
  }),
);
