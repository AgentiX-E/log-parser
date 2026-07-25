import { describe, it, expect, beforeEach } from 'vitest';
import { GranularityCalibrator } from '../../src/granularity/GranularityCalibrator.js';

describe('GranularityCalibrator', () => {
  let calibrator: GranularityCalibrator;

  beforeEach(() => {
    calibrator = new GranularityCalibrator();
  });

  it('should not calibrate with fewer than 32 samples', () => {
    for (let i = 0; i < 31; i++) {
      calibrator.addSample('log line', 'User <*> logged in');
    }
    expect(calibrator.isCalibrated).toBe(false);
    expect(calibrator.config).toBeNull();
  });

  it('should calibrate at exactly 32 samples', () => {
    for (let i = 0; i < 32; i++) {
      calibrator.addSample('log line', 'User <*> logged in');
    }
    expect(calibrator.isCalibrated).toBe(true);
    expect(calibrator.config).not.toBeNull();
  });

  it('should detect fine preference from high variable density samples', () => {
    // Fine: many variables, high var/density ratio
    for (let i = 0; i < 32; i++) {
      calibrator.addSample('log', '<*> <*> <*> <*> <*>');
    }
    expect(calibrator.config?.preference).toBe('fine');
  });

  it('should detect coarse preference from low variable density samples', () => {
    // Coarse: very few variables
    for (let i = 0; i < 32; i++) {
      calibrator.addSample('log', 'User logged in successfully');
    }
    expect(calibrator.config?.preference).toBe('coarse');
  });

  it('should detect balanced preference from moderate variable density', () => {
    // Balanced: ~30-40% variables
    for (let i = 0; i < 32; i++) {
      calibrator.addSample('log', 'User <*> logged in from <*>');
    }
    expect(calibrator.config?.preference).toBe('balanced');
  });

  it('should return balanced when mixed samples have no clear majority', () => {
    for (let i = 0; i < 16; i++) {
      calibrator.addSample('log', '<*> <*> <*> <*> <*> <*>'); // fine
    }
    for (let i = 0; i < 16; i++) {
      calibrator.addSample('log', 'User logged in'); // coarse
    }
    expect(calibrator.config?.preference).toBe('balanced');
  });

  it('should reset all samples and calibration', () => {
    for (let i = 0; i < 32; i++) {
      calibrator.addSample('log', 'User <*> logged');
    }
    expect(calibrator.isCalibrated).toBe(true);

    calibrator.reset();
    expect(calibrator.isCalibrated).toBe(false);
    expect(calibrator.config).toBeNull();
    expect(calibrator.sampleCount).toBe(0);
  });

  it('should track sample count correctly', () => {
    expect(calibrator.sampleCount).toBe(0);
    calibrator.addSample('log', 'template');
    expect(calibrator.sampleCount).toBe(1);
    calibrator.addSample('log', 'template');
    expect(calibrator.sampleCount).toBe(2);
  });

  it('should calibrate after adding more than 32 samples', () => {
    for (let i = 0; i < 40; i++) {
      calibrator.addSample('log', 'User <*> logged');
    }
    expect(calibrator.isCalibrated).toBe(true);
  });

  it('should handle empty template string in sample', () => {
    for (let i = 0; i < 32; i++) {
      calibrator.addSample('log', '');
    }
    expect(calibrator.isCalibrated).toBe(true);
    expect(calibrator.config?.preference).toBe('coarse');
  });
});
