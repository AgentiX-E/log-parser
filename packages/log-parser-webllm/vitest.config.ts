import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      // Browser-only package — WebLLM engine requires WebGPU, untestable in Node.js CI.
      // Full coverage verification runs in browser environment (Playwright E2E).
      exclude: ['src/index.ts'],
      thresholds: {
        statements: 56,
        branches: 50,
        functions: 60,
        lines: 56,
      },
    },
  },
});
