import { describe, it, expect } from 'vitest';
import { ConfigExporter } from '../../src/optimization/ConfigExporter.js';
import type { DrainDataPlaneConfig } from '../../src/data/DrainDataPlane.js';

describe('ConfigExporter', () => {
  it('JSON round-trip preserves all fields', () => {
    const config: DrainDataPlaneConfig = {
      simTh: 0.5,
      depth: 5,
      maxChildren: 200,
      extendedMasking: true,
      enableAELSimilarity: false,
      enableAdjacentFusion: true,
      engine: 'jaccard',
    };
    const json = ConfigExporter.toJSON(config);
    const parsed = ConfigExporter.fromJSON(json);
    expect(parsed.simTh).toBe(0.5);
    expect(parsed.depth).toBe(5);
    expect(parsed.maxChildren).toBe(200);
    expect(parsed.extendedMasking).toBe(true);
    expect(parsed.enableAELSimilarity).toBe(false);
    expect(parsed.enableAdjacentFusion).toBe(true);
    expect(parsed.engine).toBe('jaccard');
  });

  it('fromJSON handles partial configs', () => {
    const json = '{"simTh": 0.6}';
    const parsed = ConfigExporter.fromJSON(json);
    expect(parsed.simTh).toBe(0.6);
    expect(parsed.depth).toBeUndefined();
  });

  it('toEnv produces valid env format', () => {
    const config: DrainDataPlaneConfig = { simTh: 0.4, depth: 4 };
    const env = ConfigExporter.toEnv(config);
    expect(env).toContain('LOG_PARSER_SIM_TH=0.4');
    expect(env).toContain('LOG_PARSER_DEPTH=4');
  });

  it('toEnv handles undefined fields gracefully', () => {
    const env = ConfigExporter.toEnv({});
    expect(env).toBe('');
  });

  it('toJSON handles empty config', () => {
    const json = ConfigExporter.toJSON({});
    const parsed = ConfigExporter.fromJSON(json);
    expect(parsed.simTh).toBeUndefined();
  });
});
