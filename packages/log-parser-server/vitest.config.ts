import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      thresholds: {
        statements: 92,
        branches: 92,
        functions: 85,
        lines: 92,
      },
    },
  },
});
