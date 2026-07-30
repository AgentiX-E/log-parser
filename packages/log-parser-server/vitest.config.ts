import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      exclude: ['src/index.ts'],
      thresholds: {
        statements: 78,
        branches: 92,
        functions: 76,
        lines: 81,
      },
    },
  },
});
