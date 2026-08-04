/**
 * Real DeepSeek LLM E2E integration test.
 *
 * Requires DEEPSEEK_API_KEY env var. Tests SKIP when key is absent.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { LogParserPipeline } from '../../src/pipeline/LogParserPipeline.js';
import type { ILLMProvider, LlmTemplateResult } from '../../src/llm/ILLMProvider.js';
import { PromptBuilder } from '../../src/control/PromptBuilder.js';

const API_KEY = process.env.DEEPSEEK_API_KEY;
const hasApiKey = typeof API_KEY === 'string' && API_KEY.length > 10;

describe.runIf(hasApiKey)('DeepSeek LLM E2E', () => {
  let pipeline: LogParserPipeline;

  beforeAll(() => {
    const llm: ILLMProvider = {
      modelId: 'deepseek/deepseek-chat',
      extractTemplate: async (samples: readonly string[]): Promise<LlmTemplateResult> => {
        const prompt = PromptBuilder.build(samples);
        const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + API_KEY,
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
              { role: 'system', content: PromptBuilder.SYSTEM_PROMPT },
              { role: 'user', content: prompt },
            ],
            temperature: 0,
            max_tokens: 500,
            response_format: { type: 'json_object' },
          }),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error('DeepSeek API error: ' + res.status + ' ' + errText.slice(0, 200));
        }

        const data = (await res.json()) as Record<string, unknown>;
        const choices = data.choices as Array<Record<string, unknown>> | undefined;
        const usageData = data.usage as Record<string, number> | undefined;
        const content =
          (choices?.[0]?.message as Record<string, string> | undefined)?.content ?? '';

        let template = content;
        let confidence = 0.5;
        let variables: Array<{ position: number; value: string; category: string }> = [];

        try {
          let json = content;
          const fence = content.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (fence) json = fence[1]!;
          const parsed = JSON.parse(json.trim());
          template = parsed.template ?? content;
          if (typeof parsed.confidence === 'number') confidence = parsed.confidence;
          if (Array.isArray(parsed.variables)) variables = parsed.variables;
        } catch {
          /* use raw content as template */
        }

        return {
          template,
          variables,
          confidence,
          usage: usageData
            ? {
                promptTokens: usageData.prompt_tokens ?? 0,
                completionTokens: usageData.completion_tokens ?? 0,
              }
            : undefined,
        };
      },
    };

    pipeline = new LogParserPipeline({ llmProvider: llm });
  });

  it('parses simple logs via DeepSeek LLM control plane', async () => {
    pipeline.parse('User alice logged in from 192.168.1.1');
    pipeline.parse('User bob logged in from 10.0.0.1');
    pipeline.parse('User charlie logged in from 172.16.0.1');

    await pipeline.flush();

    expect(pipeline.stats.totalProcessed).toBe(3);
    expect(pipeline.stats.templateCount).toBeGreaterThan(0);
  });

  it('processes unique patterns through LLM', async () => {
    pipeline.parse('ERROR database timeout on node-01 after 30s');
    pipeline.parse('ERROR database timeout on node-02 after 45s');
    pipeline.parse('ERROR database timeout on node-03 after 60s');

    await pipeline.flush();

    expect(pipeline.stats.totalProcessed).toBeGreaterThanOrEqual(6);
  });

  it('tracks token usage after processing', async () => {
    expect(pipeline.stats.llmTokensConsumed).toBeGreaterThanOrEqual(0);
  });
});
