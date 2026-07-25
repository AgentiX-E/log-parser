import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MissAccumulator } from '../../src/control/MissAccumulator.js';
import type { MissEvent } from '../../src/control/PartitioningEngine.js';

function evt(msg: string): MissEvent {
  return { logMessage: msg, tokens: msg.split(' '), timestamp: Date.now() };
}

describe('MissAccumulator', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('should flush when batch reaches maxSize', async () => {
    const onBatch = vi.fn().mockResolvedValue(undefined);
    const acc = new MissAccumulator({ maxSize: 3, maxWaitMs: 5000 }, onBatch);
    acc.push(evt('a'));
    acc.push(evt('b'));
    expect(onBatch).not.toHaveBeenCalled();
    acc.push(evt('c'));
    await vi.runAllTimersAsync();
    expect(onBatch).toHaveBeenCalledTimes(1);
  });

  it('should flush on timeout when below maxSize', async () => {
    const onBatch = vi.fn().mockResolvedValue(undefined);
    const acc = new MissAccumulator({ maxSize: 10, maxWaitMs: 1000 }, onBatch);
    acc.push(evt('a'));
    acc.push(evt('b'));
    expect(onBatch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    await vi.runAllTimersAsync();
    expect(onBatch).toHaveBeenCalledTimes(1);
  });

  it('should not flush empty buffer on timeout', async () => {
    const onBatch = vi.fn().mockResolvedValue(undefined);
    new MissAccumulator({ maxSize: 10, maxWaitMs: 1000 }, onBatch);
    vi.advanceTimersByTime(2000);
    await vi.runAllTimersAsync();
    expect(onBatch).not.toHaveBeenCalled();
  });

  it('should track pending count', async () => {
    const onBatch = vi.fn().mockResolvedValue(undefined);
    const acc = new MissAccumulator({ maxSize: 10, maxWaitMs: 5000 }, onBatch);
    expect(acc.pending).toBe(0);
    acc.push(evt('a'));
    expect(acc.pending).toBe(1);
    vi.advanceTimersByTime(5000);
    await vi.runAllTimersAsync();
    expect(acc.pending).toBe(0);
  });
});
