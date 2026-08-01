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

  // ── Env export with all flags (I4 continued) ──

  it('toEnv exports AEL similarity flag when set', () => {
    const env = ConfigExporter.toEnv({ enableAELSimilarity: true });
    expect(env).toContain('LOG_PARSER_AEL_SIMILARITY=true');
  });

  it('toEnv exports adjacent fusion flag when set', () => {
    const env = ConfigExporter.toEnv({ enableAdjacentFusion: true });
    expect(env).toContain('LOG_PARSER_ADJACENT_FUSION=true');
  });

  it('toEnv exports engine type when set', () => {
    const env = ConfigExporter.toEnv({ engine: 'JaccardDrain' });
    expect(env).toContain('LOG_PARSER_ENGINE=JaccardDrain');
  });

  // ── Roundtrip (I4 continued) ──

  it('roundtrip JSON preserves all config fields', () => {
    const config = { simTh: 0.5, depth: 5, maxChildren: 200, engine: 'Drain' as const };
    const json = ConfigExporter.toJSON(config);
    const parsed = ConfigExporter.fromJSON(json);
    expect(parsed.simTh).toBe(0.5);
    expect(parsed.depth).toBe(5);
    expect(parsed.maxChildren).toBe(200);
  });

  it('toEnv skips undefined fields', () => {
    const env = ConfigExporter.toEnv({ simTh: 0.4 });
    expect(env).toContain('LOG_PARSER_SIM_TH=0.4');
    expect(env).not.toContain('LOG_PARSER_DEPTH');
  });

  it('toEnv with extended masking flag', () => {
    const env = ConfigExporter.toEnv({ extendedMasking: false });
    expect(env).toContain('LOG_PARSER_EXTENDED_MASKING=false');
  });
});
