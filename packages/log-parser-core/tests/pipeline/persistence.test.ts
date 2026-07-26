import { describe, it, expect } from 'vitest';
import { LogParserPipeline } from '../../src/pipeline/LogParserPipeline.js';

describe('LogParserPipeline Persistence', () => {
  const LOGS = [
    'Dec 10 07:07:38 LabSZ sshd[24206]: input_userauth_request: invalid user test9',
    'Dec 10 07:08:24 LabSZ sshd[24206]: Failed password for invalid user test9 from 183.62.39.52 port 6702 ssh2',
    'Dec 10 07:28:50 LabSZ sshd[24250]: Accepted password for root from 183.62.39.52 port 4888 ssh2',
    'Dec 10 07:28:50 LabSZ sshd[24250]: pam_unix(sshd:session): session opened for user root by (uid=0)',
    'Dec 10 07:31:24 LabSZ sshd[24323]: Accepted password for root from 183.62.39.52 port 4617 ssh2',
    'Dec 10 07:32:23 LabSZ sshd[24323]: Received disconnect from 183.62.39.52: 11: disconnected by user',
    'Dec 10 07:39:46 LabSZ sshd[24435]: Invalid user admin from 61.177.172.19',
    'Dec 10 07:39:49 LabSZ sshd[24435]: Failed password for invalid user admin from 61.177.172.19 port 4758 ssh2',
    'Dec 10 07:47:20 LabSZ sshd[24557]: Accepted password for guest from 61.177.172.19 port 6153 ssh2',
    'Dec 10 08:03:41 LabSZ sshd[24673]: Failed password for root from 103.99.0.122 port 31378 ssh2',
    'Dec 10 07:07:38 LabSZ sshd[24206]: input_userauth_request: invalid user bob',
    'Dec 10 07:08:24 LabSZ sshd[24206]: Failed password for invalid user bob from 183.62.39.52 port 6702 ssh2',
    'Dec 10 07:28:50 LabSZ sshd[24250]: Accepted password for admin from 183.62.39.52 port 4888 ssh2',
    'Dec 10 07:32:23 LabSZ sshd[24323]: pam_unix(sshd:session): session closed for user guest',
    'Dec 10 08:03:41 LabSZ sshd[24674]: Received disconnect from 103.99.0.122: 11: Bye Bye',
    'Dec 10 08:04:37 LabSZ sshd[24691]: Invalid user test from 103.99.0.122',
    'Dec 10 08:04:37 LabSZ sshd[24691]: input_userauth_request: invalid user test',
    'Dec 10 07:47:59 LabSZ sshd[24557]: Received disconnect from 61.177.172.19: 11: disconnected by user',
    'Dec 10 07:47:59 LabSZ sshd[24557]: pam_unix(sshd:session): session closed for user guest',
    'Dec 10 07:28:50 LabSZ sshd[24250]: pam_unix(sshd:session): session opened for user admin by (uid=0)',
  ];

  it('round-trip serialize → deserialize produces same template count', () => {
    const pipeline = new LogParserPipeline();
    pipeline.parseBatch(LOGS);

    const saved = pipeline.serializeState();
    const restored = LogParserPipeline.deserialize(saved);
    expect(restored.stats.templateCount).toBeGreaterThan(0);
    expect(restored.stats.templateCount).toBe(pipeline.stats.templateCount);

    const newLogs = ['Brand new unique log message alpha', 'Brand new unique log message beta'];
    restored.parseBatch(newLogs);
    expect(restored.stats.templateCount).toBeGreaterThan(pipeline.stats.templateCount);
  });

  it('restored pipeline continues correctly with new logs', () => {
    const pipeline = new LogParserPipeline();
    const firstHalf = LOGS.slice(0, 10);
    const secondHalf = LOGS.slice(10);

    pipeline.parseBatch(firstHalf);
    const saved = pipeline.serializeState();
    const restored = LogParserPipeline.deserialize(saved);

    const results = restored.parseBatch(secondHalf);
    expect(results.every((r) => !!r.template)).toBe(true);
    expect(restored.stats.totalProcessed).toBe(LOGS.length);
    expect(restored.stats.templateCount).toBeGreaterThan(0);
  });

  it('exportState produces valid serializable object', () => {
    const pipeline = new LogParserPipeline();
    pipeline.parseBatch(LOGS.slice(0, 5));
    const state = pipeline.exportState();

    expect(state.version).toBe('1.0.0');
    expect(state.drainSnapshot).toBeDefined();
    expect(typeof state.totalProcessed).toBe('number');
    expect(state.totalProcessed).toBe(5);
  });

  it('deserialize with empty JSON creates fresh pipeline', () => {
    const pipeline = LogParserPipeline.deserialize('{"version":"1.0.0","totalProcessed":0}');
    const result = pipeline.parseBatch(['new log message'])[0]!;
    expect(result.template).toBeDefined();
  });
});
