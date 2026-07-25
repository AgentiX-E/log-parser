import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

export class NodeStreamAdapter {
  static async *fromFile(filePath: string): AsyncIterable<string> {
    const stream = createReadStream(filePath, { encoding: 'utf-8' });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) {
      if (line.trim()) yield line;
    }
  }

  static async *fromStdin(): AsyncIterable<string> {
    const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const line of rl) {
      if (line.trim()) yield line;
    }
  }
}
