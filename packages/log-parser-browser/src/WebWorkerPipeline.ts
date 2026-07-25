/**
 * WebWorkerPipeline offloads log parsing to a Web Worker thread,
 * preventing the main UI thread from blocking during heavy parsing workloads.
 *
 * The Worker instance must import and use LogParserPipeline internally.
 * This class manages the Worker lifecycle and message dispatching.
 */
export class WebWorkerPipeline {
  #worker: Worker;

  constructor(worker: Worker) {
    this.#worker = worker;
  }

  /**
   * Sends a batch of log lines to the worker for parsing.
   * Returns a promise that resolves with the parsed templates.
   *
   * @param lines - Array of raw log lines to parse.
   * @returns Parsed result from the worker thread.
   */
  parse(lines: string[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const onMessage = (event: MessageEvent) => {
        cleanup();
        if (event.data?.error) {
          reject(new Error(event.data.error));
        } else {
          resolve(event.data);
        }
      };
      const onError = (error: ErrorEvent) => {
        cleanup();
        reject(new Error(`Worker error: ${error.message}`));
      };
      const cleanup = () => {
        this.#worker.removeEventListener('message', onMessage);
        this.#worker.removeEventListener('error', onError);
      };

      this.#worker.addEventListener('message', onMessage);
      this.#worker.addEventListener('error', onError);
      this.#worker.postMessage({ type: 'parse', lines });
    });
  }

  /**
   * Terminates the underlying Web Worker and frees resources.
   */
  terminate(): void {
    this.#worker.terminate();
  }
}
