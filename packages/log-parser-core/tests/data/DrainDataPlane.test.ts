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
