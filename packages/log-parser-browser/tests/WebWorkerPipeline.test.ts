import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebWorkerPipeline } from '../src/WebWorkerPipeline.js';

describe('WebWorkerPipeline', () => {
  let mockWorker: Worker;

  beforeEach(() => {
    mockWorker = {
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      terminate: vi.fn(),
    } as unknown as Worker;
  });

  it('terminate calls worker.terminate', () => {
    const pipeline = new WebWorkerPipeline(mockWorker);
    pipeline.terminate();
    expect(mockWorker.terminate).toHaveBeenCalledOnce();
  });

  it('parse sends correct message to worker', () => {
    const pipeline = new WebWorkerPipeline(mockWorker);
    const lines = ['log1', 'log2', 'log3'];
    pipeline.parse(lines);

    expect(mockWorker.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    expect(mockWorker.addEventListener).toHaveBeenCalledWith('error', expect.any(Function));
    expect(mockWorker.postMessage).toHaveBeenCalledWith({ type: 'parse', lines });
  });

  it('parse resolves with worker response', async () => {
    const pipeline = new WebWorkerPipeline(mockWorker);

    // Capture the message handler so we can trigger it
    let messageHandler: ((event: MessageEvent) => void) | null = null;
    (mockWorker.addEventListener as ReturnType<typeof vi.fn>).mockImplementation(
      (event: string, handler: unknown) => {
        if (event === 'message') {
          messageHandler = handler as (event: MessageEvent) => void;
        }
      },
    );

    const parsePromise = pipeline.parse(['log1']);
    // Simulate worker response
    expect(messageHandler).not.toBeNull();
    messageHandler!({ data: { templates: [{ template: 'test', count: 1 }] } } as MessageEvent);

    const result = await parsePromise;
    expect(result).toEqual({ templates: [{ template: 'test', count: 1 }] });
  });

  it('parse rejects on worker error response', async () => {
    const pipeline = new WebWorkerPipeline(mockWorker);

    let messageHandler: ((event: MessageEvent) => void) | null = null;
    (mockWorker.addEventListener as ReturnType<typeof vi.fn>).mockImplementation(
      (event: string, handler: unknown) => {
        if (event === 'message') {
          messageHandler = handler as (event: MessageEvent) => void;
        }
      },
    );

    const parsePromise = pipeline.parse(['bad']);
    messageHandler!({ data: { error: 'Something went wrong' } } as MessageEvent);

    await expect(parsePromise).rejects.toThrow('Something went wrong');
  });

  it('parse rejects on worker error event', async () => {
    const pipeline = new WebWorkerPipeline(mockWorker);

    let errorHandler: ((event: ErrorEvent) => void) | null = null;
    (mockWorker.addEventListener as ReturnType<typeof vi.fn>).mockImplementation(
      (event: string, handler: unknown) => {
        if (event === 'error') {
          errorHandler = handler as (event: ErrorEvent) => void;
        }
      },
    );

    const parsePromise = pipeline.parse(['log1']);
    errorHandler!({ message: 'Script error' } as ErrorEvent);

    await expect(parsePromise).rejects.toThrow('Worker error: Script error');
  });

  it('parse cleans up listeners after resolution', async () => {
    const pipeline = new WebWorkerPipeline(mockWorker);

    let messageHandler: ((event: MessageEvent) => void) | null = null;
    (mockWorker.addEventListener as ReturnType<typeof vi.fn>).mockImplementation(
      (event: string, handler: unknown) => {
        if (event === 'message') {
          messageHandler = handler as (event: MessageEvent) => void;
        }
      },
    );

    const parsePromise = pipeline.parse(['log1']);
    messageHandler!({ data: { result: 'ok' } } as MessageEvent);
    await parsePromise;

    // Listeners should be removed after response
    expect(mockWorker.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    expect(mockWorker.removeEventListener).toHaveBeenCalledWith('error', expect.any(Function));
  });
});
