import { describe, it, expect } from 'vitest';
import { defaultPipelineConfig } from '../../src/pipeline/types.js';

describe('defaultPipelineConfig', () => {
  it('returns dataPlane enabled by default', () => {
    const config = defaultPipelineConfig();
    expect(config.dataPlane.enabled).toBe(true);
  });

  it('returns controlPlane disabled by default', () => {
    const config = defaultPipelineConfig();
    expect(config.controlPlane.enabled).toBe(false);
  });

  it('has sensible drain defaults', () => {
    const config = defaultPipelineConfig();
    expect(config.dataPlane.drain?.simTh).toBe(0.4);
    expect(config.dataPlane.drain?.depth).toBe(4);
    expect(config.dataPlane.drain?.maxChildren).toBe(100);
    expect(config.dataPlane.drain?.maxClusters).toBeNull();
  });

  it('has sensible batch defaults', () => {
    const config = defaultPipelineConfig();
    expect(config.controlPlane.batch.maxSize).toBe(50);
    expect(config.controlPlane.batch.maxWaitMs).toBe(5000);
  });

  it('has sensible partitioning defaults', () => {
    const config = defaultPipelineConfig();
    expect(config.controlPlane.partitioning.method).toBe('dbscan');
    expect(config.controlPlane.partitioning.dbscan?.epsilon).toBe(0.5);
    expect(config.controlPlane.partitioning.dbscan?.minPoints).toBe(3);
  });

  it('has sensible sampling defaults', () => {
    const config = defaultPipelineConfig();
    expect(config.controlPlane.sampling.method).toBe('dpp');
    expect(config.controlPlane.sampling.samplesPerBatch).toBe(5);
  });

  it('has enabled self-reflection with 3 max iterations', () => {
    const config = defaultPipelineConfig();
    expect(config.controlPlane.selfReflection.enabled).toBe(true);
    expect(config.controlPlane.selfReflection.maxIterations).toBe(3);
  });

  it('has tokenization defaults', () => {
    const config = defaultPipelineConfig();
    expect(config.tokenization.languageDetection).toBe(true);
    expect(config.tokenization.fallbackLanguage).toBe('en');
  });

  it('returns a frozen-like config structure', () => {
    const config1 = defaultPipelineConfig();
    const config2 = defaultPipelineConfig();
    expect(config1).toEqual(config2);
    // Ensure no shared mutable references
    config1.dataPlane.drain!.simTh = 0.99;
    expect(config2.dataPlane.drain!.simTh).toBe(0.4);
  });
});
