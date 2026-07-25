import { trace, SpanStatusCode } from '@opentelemetry/api';
import type { LogParserPipeline, LogParseResult, PipelineStats } from '@agentix-e/log-parser-core';

const tracer = trace.getTracer('@agentix-e/log-parser');

export interface InstrumentedParseResult extends LogParseResult {
  traceId?: string;
  parseDurationMs?: number;
}

/**
 * Wrap a LogParserPipeline with OpenTelemetry instrumentation.
 *
 * Each `parse()` call creates an OTel span tracing the full pipeline
 * execution, including source attribution and timing.
 */
export function instrumentPipeline(pipeline: LogParserPipeline) {
  return {
    parse(logMessage: string): InstrumentedParseResult {
      const startTime = performance.now();
      const span = tracer.startSpan('log-parser.parse', {
        attributes: { 'log.length': logMessage.length },
      });
      try {
        const result = pipeline.parse(logMessage);
        span.setAttribute('parse.source', result.source);
        span.setAttribute('parse.template_id', result.templateId);
        span.setStatus({ code: SpanStatusCode.OK });
        return {
          ...result,
          traceId: span.spanContext().traceId,
          parseDurationMs: Math.round((performance.now() - startTime) * 100) / 100,
        };
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
        throw error;
      } finally {
        span.end();
      }
    },
    getStats(): PipelineStats {
      return pipeline.stats;
    },
    getPipeline(): LogParserPipeline {
      return pipeline;
    },
  };
}

export { tracer };
