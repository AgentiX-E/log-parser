import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCLI } from '../src/cli.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('CLI', () => {
  let tempDir: string;
  let testFile: string;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-parser-cli-'));
    testFile = path.join(tempDir, 'test.log');
    fs.writeFileSync(testFile, 'User admin logged in from 192.168.1.1\nUser guest logged in from 10.0.0.1\n');
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number): never => {
      throw new Error(`process.exit(${code})`);
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    exitSpy.mockRestore();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // Helper: parse with Commander using "from: node" to skip node and script args
  function parseArgs(command: string, ...extraArgs: string[]): string[] {
    return ['node', 'script.js', command, ...extraArgs];
  }

  // Basic CLI creation
  it('should create a Commander CLI instance', () => {
    const program = createCLI();
    expect(program).toBeDefined();
    expect(program.name()).toBe('log-parser');
    expect(program.description()).toBe('Intelligent log parsing engine');
  });

  // --version flag
  it('should show version with --version flag', () => {
    const program = createCLI();
    program.exitOverride();
    expect(() => {
      program.parse(parseArgs('--version'), { from: 'node' });
    }).toThrow();
  });

  // version output test
  it('should output version text', () => {
    const program = createCLI();
    const out = program.version();
    expect(out).toBe('0.1.0');
  });

  // --help shows expected content
  it('should show help with --help flag', () => {
    const program = createCLI();
    program.exitOverride();
    try {
      program.parse(parseArgs('--help'), { from: 'node' });
    } catch {
      // exitOverride throws — expected
    }
    // The program should contain expected commands
    const commands = program.commands.map((c) => c.name());
    expect(commands).toContain('parse');
    expect(commands).toContain('stats');
  });

  // parse command requires --input
  it('parse command should require --input option', () => {
    const program = createCLI();
    program.exitOverride();
    expect(() => {
      program.parse(parseArgs('parse'), { from: 'node' });
    }).toThrow();
  });

  // parse command with valid input
  it('parse command should process log file', async () => {
    fs.writeFileSync(testFile, 'User admin logged in from 192.168.1.1\nError detected on server\n');

    const program = createCLI();
    program.exitOverride();
    try {
      await program.parseAsync(parseArgs('parse', '-i', testFile), { from: 'node' });
    } catch {
      // Commander may throw after async action
    }

    // The action handler logs JSON to console
    const logCalls = consoleLogSpy.mock.calls.filter(
      (c) => typeof c[0] === 'string' && (c[0] as string).startsWith('{'),
    );
    expect(logCalls.length).toBeGreaterThanOrEqual(1);

    // Each call should be valid JSON with expected fields
    for (const call of logCalls) {
      const parsed = JSON.parse(call[0] as string) as Record<string, unknown>;
      expect(parsed).toHaveProperty('logId');
      expect(parsed).toHaveProperty('template');
      expect(parsed).toHaveProperty('source');
    }
  });

  // parse command handles adapter option
  it('parse command should accept --adapter option', async () => {
    const program = createCLI();
    program.exitOverride();
    try {
      await program.parseAsync(
        parseArgs('parse', '-i', testFile, '--adapter', 'syslog'),
        { from: 'node' },
      );
    } catch {
      // Expected
    }
    // The command should have executed (console.log called from action)
    const logCalls = consoleLogSpy.mock.calls.filter(
      (c) => typeof c[0] === 'string' && (c[0] as string).startsWith('{'),
    );
    expect(logCalls.length).toBeGreaterThanOrEqual(1);
  });

  // stats command with valid input
  it('stats command should show statistics', async () => {
    const program = createCLI();
    program.exitOverride();
    try {
      await program.parseAsync(parseArgs('stats', '-i', testFile), { from: 'node' });
    } catch {
      // Expected
    }

    // Should output stats JSON
    const calls = consoleLogSpy.mock.calls;
    expect(calls.length).toBeGreaterThan(0);

    // The output should be valid JSON with stats fields
    const statOutput = calls[0]![0] as string;
    const parsed = JSON.parse(statOutput) as Record<string, unknown>;
    expect(parsed).toHaveProperty('totalProcessed');
    expect(parsed).toHaveProperty('drainHits');
    expect(parsed).toHaveProperty('templateCount');
  });

  // stats command requires --input
  it('stats command should require --input option', () => {
    const program = createCLI();
    program.exitOverride();
    expect(() => {
      program.parse(parseArgs('stats'), { from: 'node' });
    }).toThrow();
  });

  // parse command with empty file
  it('parse command should handle empty file', async () => {
    const emptyFile = path.join(tempDir, 'empty.log');
    fs.writeFileSync(emptyFile, '');

    const program = createCLI();
    program.exitOverride();
    try {
      await program.parseAsync(parseArgs('parse', '-i', emptyFile), { from: 'node' });
    } catch {
      // Expected
    }
    // No JSON output for empty file
    const logCalls = consoleLogSpy.mock.calls.filter(
      (c) => typeof c[0] === 'string' && (c[0] as string).startsWith('{'),
    );
    expect(logCalls.length).toBe(0);
  });

  // CLI has parse and stats commands
  it('should have parse and stats commands registered', () => {
    const program = createCLI();
    const names = program.commands.map((c) => c.name());
    expect(names).toContain('parse');
    expect(names).toContain('stats');
    expect(names.length).toBe(2);
  });

  // parse command output is valid JSON on each line
  it('parse command should output valid JSON per line', async () => {
    fs.writeFileSync(testFile, 'Line one\nLine two\n');

    const program = createCLI();
    program.exitOverride();
    try {
      await program.parseAsync(parseArgs('parse', '-i', testFile), { from: 'node' });
    } catch {
      // Expected
    }

    for (const call of consoleLogSpy.mock.calls) {
      if (typeof call[0] !== 'string') continue;
      if (!(call[0] as string).startsWith('{')) continue;
      expect(() => JSON.parse(call[0] as string)).not.toThrow();
    }
  });
});
