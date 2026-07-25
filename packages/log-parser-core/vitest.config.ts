import { defineConfig } from 'vitest/config';

export default defineConfig({
  ssr: {
    noExternal: ['@agentix-e/drain-ts'],
  },
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts', 'src/**/*.d.ts'],
      thresholds: {
        statements: 95,
        branches: 95,
        functions: 95,
        lines: 95,
      },
    },
  },
});
