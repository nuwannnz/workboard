import { mergeConfig, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { vitestBase } from '../../tools/vitest/vitest.base';

export default mergeConfig(
  vitestBase,
  defineConfig({
    plugins: [react()],
    test: {
      name: 'frontend',
      environment: 'jsdom',
      setupFiles: ['./src/test-setup.ts'],
      include: ['src/**/*.spec.{ts,tsx}'],
    },
  }),
);
