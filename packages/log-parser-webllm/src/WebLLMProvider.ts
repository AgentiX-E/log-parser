import type { ILLMProvider, LlmTemplateResult } from '@agentix-e/log-parser-core';
import { PromptBuilder } from '@agentix-e/log-parser-core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WebLLMModule = any;

/**
 * Browser-local LLM provider using @mlc-ai/web-llm.
 *
 * Runs large language models entirely in the browser with WebGPU
 * acceleration. Zero server dependency, zero API keys, data never
 * leaves the browser.
 *
 * IMPORTANT: This provider requires `@mlc-ai/web-llm` as a peer
 * dependency. It only works in browser environments with WebGPU support.
 * Call `WebLLMProvider.create()` instead of `new WebLLMProvider()`.
 *
 * Usage:
 * ```typescript
 * const provider = await WebLLMProvider.create({
 *   model: 'gemma-2-2b-it-q4f16_1-MLC',
 * });
 * ```
 */
export class WebLLMProvider implements ILLMProvider {
  readonly modelId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private engine: any = null;

  constructor(config: { readonly model: string }) {
    this.modelId = `webllm/${config.model}`;
  }

  /** Static factory — WebLLM requires async engine initialization. */
  static async create(config: { readonly model: string }): Promise<WebLLMProvider> {
    // Dynamic import of @mlc-ai/web-llm (browser-only module, no TS types available)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const webllm: WebLLMModule = await import('@mlc-ai/web-llm');
    const provider = new WebLLMProvider(config);
    provider.engine = await webllm.CreateMLCEngine(config.model, {
      initProgressCallback: (report: { text: string }) => {
        console.debug(`[WebLLM] Loading ${config.model}: ${report.text}`);
      },
    });
    return provider;
  }

  async extractTemplate(logSamples: readonly string[]): Promise<LlmTemplateResult> {
    if (!this.engine) {
      throw new Error(
        'WebLLMProvider not initialized. Use WebLLMProvider.create() instead of new WebLLMProvider().',
      );
    }
    const prompt = PromptBuilder.build(logSamples);
    const reply = await this.engine.chat.completions.create({
      messages: [
        { role: 'system', content: PromptBuilder.SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0,
      max_tokens: 500,
    });
    return this.parseResponse(reply.choices[0]?.message?.content ?? '');
  }

  private parseResponse(content: string): LlmTemplateResult {
    const match = content.match(/<TEMPLATE>([\s\S]*?)<\/TEMPLATE>/);
    const template = match?.[1]?.trim() ?? content.trim();
    return { template, variables: [], confidence: 0.85 };
  }

  /** Whether the WebGPU engine is loaded and ready. */
  get isReady(): boolean {
    return this.engine !== null;
  }
}
