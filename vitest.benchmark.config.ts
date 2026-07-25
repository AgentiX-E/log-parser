import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['benchmark/**/*.test.ts'],
    pool: 'forks',
    testTimeout: 300_000,
  },
});
