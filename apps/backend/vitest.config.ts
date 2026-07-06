import { mergeConfig, defineConfig } from 'vitest/config';
import { vitestBase } from '../../tools/vitest/vitest.base';

export default mergeConfig(
  vitestBase,
  defineConfig({
    test: {
      name: 'backend',
      environment: 'node',
      include: ['src/**/*.spec.ts'],
    },
  }),
);
