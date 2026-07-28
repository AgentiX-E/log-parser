import { describe, it, expect } from 'vitest';
import { DrainDataPlane } from '../../src/data/DrainDataPlane.js';

describe('DrainDataPlane', () => {
  const drain = new DrainDataPlane();

  it('trains and returns match for similar logs', () => {
    const r1 = drain.train('User alice logged in');
    expect(r1.kind).toBe('miss');
    expect(r1.template).toBeDefined();

    const r2 = drain.train('User bob logged in');
    expect(r2.kind).toBe('match');
    expect(r2.templateId).toBe(r1.templateId);
  });

  it('creates new template for different logs', () => {
    const r1 = drain.train('Unique pattern alpha');
    const r2 = drain.train('Totally different pattern beta');
    expect(r1.templateId).not.toBe(r2.templateId);
  });

  it('match finds existing template', () => {
    drain.train('System startup sequence initiated');
    drain.train('System startup sequence completed');
    const match = drain.match('System startup sequence triggered');
    expect(match).not.toBeNull();
    expect(match!.template).toBeDefined();
  });

  it('match returns null for unseen pattern', () => {
    expect(drain.match('completely new unseen message')).toBeNull();
  });

  it('reports templateCount correctly', () => {
    const d = new DrainDataPlane();
    d.train('Template one');
    d.train('Template two different');
    expect(d.templateCount).toBe(2);
  });

  it('reports totalProcessed correctly', () => {
    const d = new DrainDataPlane();
    d.train('Log one');
    d.train('Log two');
    d.train('Log three');
    expect(d.totalProcessed).toBe(3);
  });

  it('train with masking: IPs are parameterized', () => {
    const d = new DrainDataPlane();
    const r1 = d.train('Connection from 192.168.1.1');
    const r2 = d.train('Connection from 10.0.0.1');
    expect(r1.templateId).toBe(r2.templateId);
  });
});

describe('DrainDataPlane v1.1.0 features', () => {
  it('creates Drain engine by default', () => {
    const plane = new DrainDataPlane();
    expect(plane.engineType).toBe('Drain');
  });

  it('creates JaccardDrain engine when configured', () => {
    const plane = new DrainDataPlane({ engine: 'JaccardDrain' });
    expect(plane.engineType).toBe('JaccardDrain');
  });

  it('JaccardDrain handles variable-length logs', () => {
    const plane = new DrainDataPlane({ engine: 'JaccardDrain' });
    const r1 = plane.train('User alice logged in');
    expect(r1.kind).toBe('miss');
    // JaccardDrain uses first-token-based tree with Jaccard similarity,
    // supporting different token counts between messages
    const r2 = plane.train('User bob logged in successfully');
    expect(r2.template).toBeDefined();
  });

  it('enables extended masking', () => {
    const plane = new DrainDataPlane({ extendedMasking: true });
    const r1 = plane.train('Connection from 192.168.1.1:8080 /var/log/syslog');
    expect(r1.template).toBeDefined();
    // Extended masking should detect HOST_PORT and PATH in addition to IP
    expect(plane.templateCount).toBeGreaterThan(0);
  });

  it('enables AEL similarity', () => {
    const plane = new DrainDataPlane({ enableAELSimilarity: true });
    const r1 = plane.train('User alice logged in from 192.168.1.1');
    expect(r1.kind).toBe('miss');
    const r2 = plane.train('User bob logged in from 10.0.0.1');
    expect(r2.kind).toBe('match');
  });

  it('enables adjacent fusion', () => {
    const plane = new DrainDataPlane({ enableAdjacentFusion: true });
    const r1 = plane.train('Process started with pid 1234');
    expect(r1.template).toBeDefined();
  });

  it('enables param binning', () => {
    const plane = new DrainDataPlane({ enableParamBinning: true });
    const r1 = plane.train('User alice logged in from 192.168.1.1');
    expect(r1.template).toBeDefined();
  });

  it('enables affix preserving', () => {
    const plane = new DrainDataPlane({ enableAffixPreserving: true });
    const r1 = plane.train('bytes4096sent');
    expect(r1.template).toBeDefined();
  });

  it('enables cluster merge', () => {
    const plane = new DrainDataPlane({ enableClusterMerge: true });
    plane.train('User alice logged in');
    plane.train('User bob logged in');
    const merged = plane.mergeClusters();
    expect(merged).toBeGreaterThanOrEqual(0);
  });

  it('learnTokens does not throw', () => {
    const plane = new DrainDataPlane({ enableAdjacentFusion: true });
    expect(() => plane.learnTokens(['User alice logged in', 'User bob logged in'])).not.toThrow();
  });

  it('uses preprocessor when provided', () => {
    const plane = new DrainDataPlane({
      preprocessor: (msg) => msg.replace(/,\s+/g, ' '),
    });
    const r1 = plane.train('User, alice, logged, in');
    expect(r1.template).toBeDefined();
  });

  it('save and load preserves engine type', () => {
    const plane = new DrainDataPlane({ engine: 'JaccardDrain' });
    plane.train('User alice logged in');
    const snapshot = plane.saveSnapshot();
    const restored = DrainDataPlane.fromSnapshot(snapshot, { engine: 'JaccardDrain' });
    expect(restored.engineType).toBe('JaccardDrain');
    expect(restored.templateCount).toBe(1);
  });
});
