import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    server: {
      deps: {
        // drain-ts has conditional exports; inline it to avoid ESM resolution issues
        inline: [/@agentix-e\/drain-ts/],
      },
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/index.ts',
        'src/**/*.d.ts',
        'src/llm/ILLMProvider.ts',
        'src/embedding/IEmbeddingProvider.ts',
        'src/preprocessing/tokenizers/ITokenizer.ts',
        'src/preprocessing/adapters/LogInputAdapter.ts',
      ],
      thresholds: {
        statements: 95,
        branches: 93,
        functions: 95,
        lines: 95,
      },
    },
  },
});
