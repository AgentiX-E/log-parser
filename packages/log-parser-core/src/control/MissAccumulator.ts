import type { MissEvent } from './PartitioningEngine.js';

/**
 * Batch accumulator for log messages that the data plane couldn't match.
 *
 * Queues "miss" events and flushes them in batches when either:
 * - The batch reaches maxSize entries, OR
 * - maxWaitMs milliseconds have elapsed since the first queued event
 *
 * Thread-safe: flush operations serialize via an internal flag; concurrent
 * push/flush calls do not cause data loss or duplicate processing.
 */
export class MissAccumulator {
  private buffer: MissEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;

  constructor(
    private readonly config: { readonly maxSize: number; readonly maxWaitMs: number },
    private readonly onBatchReady: (batch: readonly MissEvent[]) => Promise<void>,
  ) {}

  /** Push a miss event into the accumulator. Triggers flush if batch is full. */
  push(event: MissEvent): void {
    this.buffer.push(event);
    if (this.buffer.length >= this.config.maxSize) {
      this.clearTimer();
      void this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => void this.flush(), this.config.maxWaitMs);
    }
  }

  /** Force-flush the current buffer immediately. */
  async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) return;
    this.flushing = true;
    this.clearTimer();
    const batch = this.buffer.splice(0);
    try {
      await this.onBatchReady(batch);
    } finally {
      this.flushing = false;
    }
  }

  /** Number of events currently queued. */
  get pending(): number {
    return this.buffer.length;
  }

  /** Whether a flush operation is currently in progress. */
  get isFlushing(): boolean {
    return this.flushing;
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
