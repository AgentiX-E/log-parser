import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/index.ts',
        'src/**/*.d.ts',
        'src/**/adapters/LogInputAdapter.ts',
        'src/**/tokenizers/ITokenizer.ts',
        'src/**/embedding/IEmbeddingProvider.ts',
        'src/**/llm/ILLMProvider.ts',
      ],
      thresholds: {
        statements: 92,
        branches: 84,
        functions: 93,
        lines: 93,
      },
    },
  },
});
