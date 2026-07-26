import { generateObject, generateText } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { z } from 'zod';
import type { ILLMProvider, LlmTemplateResult } from '@agentix-e/log-parser-core';
import { PromptBuilder } from '@agentix-e/log-parser-core';

/**
 * Supported provider types for OpenAI-compatible LLM backends.
 *
 * - `ollama`: Local models via Ollama (localhost:11434/v1).
 * - `openai`: OpenAI API (api.openai.com/v1).
 * - `deepseek`: DeepSeek API (api.deepseek.com/v1).
 * - `anthropic`: Anthropic API (requires compatible adapter).
 * - `custom`: Any OpenAI-compatible endpoint.
 */
export type LLMProviderType = 'ollama' | 'openai' | 'deepseek' | 'anthropic' | 'custom';

/**
 * Configuration for an OpenAI-compatible LLM provider.
 */
export interface OpenAICompatibleConfig {
  /** Provider type. */
  readonly provider: LLMProviderType;
  /** Model identifier (e.g., "qwen2.5:7b", "gpt-4o-mini"). */
  readonly model: string;
  /** API key. Not required for local providers (Ollama). */
  readonly apiKey?: string;
  /** Base URL for the API endpoint. Defaults are provider-specific. */
  readonly baseURL?: string;
}

/**
 * Default base URLs for known providers.
 */
const DEFAULT_BASE_URLS: Record<LLMProviderType, string> = {
  ollama: 'http://localhost:11434/v1',
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  custom: 'http://localhost:11434/v1',
};

/**
 * Zod schema for structured LLM template extraction output.
 *
 * Uses NER-style annotation: the LLM identifies variable positions
 * and their categories rather than generating a free-form template string.
 */
const templateResultSchema = z.object({
  template: z.string().describe('The extracted log template with typed placeholders'),
  variables: z
    .array(
      z.object({
        position: z.number().describe('Zero-based position in the template token sequence'),
        value: z.string().describe('The original variable value from the log message'),
        category: z
          .enum(['IP', 'NUM', 'PATH', 'UUID', 'EMAIL', 'TIMESTAMP', 'HOSTNAME', 'GENERIC'])
          .describe('The detected variable category'),
      }),
    )
    .describe('NER-style variable annotations'),
  confidence: z.number().min(0).max(1).describe('Confidence score between 0 and 1'),
});

/**
 * OpenAI-compatible LLM provider.
 *
 * Implements {@link ILLMProvider} using the Vercel AI SDK with structured output
 * via `generateObject()`. Supports any OpenAI-compatible endpoint: Ollama, OpenAI,
 * DeepSeek, Anthropic, or custom providers.
 *
 * **No network calls occur at construction time** — the provider lazily creates
 * the underlying AI SDK client. Network activity only occurs when `extractTemplate()`
 * is called.
 *
 * @example Basic usage with Ollama
 * ```typescript
 * import { OpenAICompatibleProvider } from '@agentix-e/log-parser-llm';
 *
 * const llm = new OpenAICompatibleProvider({
 *   provider: 'ollama',
 *   model: 'qwen2.5:7b',
 *   baseURL: 'http://localhost:11434/v1',
 * });
 * ```
 *
 * @example Usage with OpenAI
 * ```typescript
 * const llm = new OpenAICompatibleProvider({
 *   provider: 'openai',
 *   model: 'gpt-4o-mini',
 *   apiKey: process.env.OPENAI_API_KEY,
 * });
 * ```
 *
 * @example Inject into pipeline
 * ```typescript
 * import { LogParserPipeline } from '@agentix-e/log-parser-core';
 *
 * const pipeline = new LogParserPipeline({ llmProvider: llm });
 * ```
 */
export class OpenAICompatibleProvider implements ILLMProvider {
  readonly modelId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly model: any;

  constructor(config: OpenAICompatibleConfig) {
    if (!config.model || config.model.trim() === '') {
      throw new Error('model is required and must not be empty');
    }
    if (!['ollama', 'openai', 'deepseek', 'anthropic', 'custom'].includes(config.provider)) {
      throw new Error(
        `invalid provider type: "${config.provider}". Supported: ollama, openai, deepseek, anthropic, custom`,
      );
    }

    this.modelId = `${config.provider}/${config.model}`;

    const baseURL = config.baseURL ?? DEFAULT_BASE_URLS[config.provider];
    const client = createOpenAICompatible({
      name: config.provider,
      apiKey: config.apiKey ?? 'ollama',
      baseURL,
    });
    this.model = client.chatModel(config.model);
  }

  /**
   * Extract a common log template from representative samples.
   *
   * Calls the configured LLM with NER-style prompting (via {@link PromptBuilder})
   * and parses the structured output using a Zod schema.
   *
   * @param logSamples - Representative log samples selected by DPP sampling.
   * @returns Extracted template with variable annotations and confidence.
   */
  async extractTemplate(logSamples: readonly string[]): Promise<LlmTemplateResult> {
    if (logSamples.length === 0) {
      return { template: '', variables: [], confidence: 0 };
    }

    const prompt = PromptBuilder.build(logSamples);

    // Try structured output first (supported by OpenAI, etc.)
    try {
      const result = await generateObject({
        model: this.model,
        schema: templateResultSchema,
        system: PromptBuilder.SYSTEM_PROMPT,
        prompt,
        temperature: 0,
      });

      return {
        template: result.object.template,
        variables: result.object.variables,
        confidence: result.object.confidence,
        usage: result.usage
          ? {
              promptTokens: (result.usage as Record<string, number>).promptTokens ?? 0,
              completionTokens: (result.usage as Record<string, number>).completionTokens ?? 0,
            }
          : undefined,
      };
    } catch {
      // Fallback: use generateText + manual JSON parsing
      // (needed for providers like DeepSeek that don't support structured outputs)
    }

    const textResult = await generateText({
      model: this.model,
      system: PromptBuilder.SYSTEM_PROMPT + '\nRespond ONLY with a valid JSON object.',
      prompt,
      temperature: 0,
    });

    const jsonMatch = textResult.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { template: textResult.text.trim(), variables: [], confidence: 0.7 };
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        template: parsed.template ?? textResult.text.trim(),
        variables: Array.isArray(parsed.variables) ? parsed.variables : [],
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
        usage: textResult.usage
          ? {
              promptTokens: (textResult.usage as Record<string, number>).promptTokens ?? 0,
              completionTokens: (textResult.usage as Record<string, number>).completionTokens ?? 0,
            }
          : undefined,
      };
    } catch {
      return { template: textResult.text.trim(), variables: [], confidence: 0.5 };
    }
  }
}
