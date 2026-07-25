import { describe, it, expect } from 'vitest';
import { GranularityDistance } from '../../src/granularity/GranularityDistance.js';
import type { GranularityConfig } from '../../src/granularity/GranularityDistance.js';

describe('GranularityDistance', () => {
  const gd = new GranularityDistance();

  describe('compute', () => {
    it('should return 0 for identical templates', () => {
      expect(gd.compute(['User', '<*>', 'logged', 'in'], ['User', '<*>', 'logged', 'in'])).toBe(0);
    });

    it('should return 0 for templates with only variables', () => {
      expect(gd.compute(['<*>', '<*>'], ['<*>', '<*>'])).toBe(0);
    });

    it('should return 0 for two empty templates', () => {
      expect(gd.compute([], [])).toBe(0);
    });

    it('should return low distance for granularity difference (coarse variable vs fine breakdown)', () => {
      // Coarse: one variable covers "from 192.168.1.1 at /home"
      // Fine: separate variables for IP and path
      const coarse = ['User', '<*>', 'logged'];
      const fine = ['User', '<*>', 'logged', 'in', 'from', '<*>', 'at', '<*>'];
      const result = gd.compute(coarse, fine, { preference: 'balanced' });
      // Fine template breaks down one coarse variable into multiple components.
      // This should produce a moderate distance (not near 0, not near 1).
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(1);
    });

    it('should return high distance for semantic differences', () => {
      const result = gd.compute(
        ['User', '<*>', 'logged', 'in'],
        ['ERROR', '<*>', 'failed', 'to', 'connect'],
      );
      expect(result).toBeGreaterThan(0.7);
    });

    it('should penalize coarse merge more with fine preference', () => {
      const coarse = ['/usr/<*>'];
      const fine = ['/usr', '<*>', '<*>'];
      const finePenalty = gd.compute(coarse, fine, { preference: 'fine' });
      const coarsePenalty = gd.compute(coarse, fine, { preference: 'coarse' });
      expect(finePenalty).toBeGreaterThan(coarsePenalty);
    });

    it('should use balanced preference as default', () => {
      const coarse = ['/usr/<*>'];
      const fine = ['/usr', '<*>', '<*>'];
      const defaultResult = gd.compute(coarse, fine);
      const balancedResult = gd.compute(coarse, fine, { preference: 'balanced' });
      expect(defaultResult).toBe(balancedResult);
    });

    it('should return 0 for single-token identical templates', () => {
      expect(gd.compute(['User'], ['User'])).toBe(0);
    });

    it('should handle completely different single-token templates', () => {
      const result = gd.compute(['User'], ['ERROR']);
      expect(result).toBe(1);
    });

    it('should handle one variable, one constant as granularity difference', () => {
      const result = gd.compute(['<*>'], ['User'], { preference: 'balanced' });
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(1);
    });

    it('should return high distance for templates with different lengths and different content', () => {
      const result = gd.compute(
        ['User', '<*>', 'logged', 'in', 'from', '<*>'],
        ['ERROR', 'failed'],
      );
      expect(result).toBeGreaterThan(0.5);
    });

    it('should handle template A longer than template B', () => {
      const result = gd.compute(['User', '<*>', 'logged'], ['User']);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(1);
    });

    it('should handle template B longer than template A', () => {
      const result = gd.compute(['User'], ['User', '<*>', 'logged']);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(1);
    });

    it('should treat both <*> tokens as zero penalty', () => {
      expect(gd.compute(['<*>', '<*>', '<*>'], ['<*>', '<*>', '<*>'])).toBe(0);
    });

    it('should normalize penalty by max template length', () => {
      const r1 = gd.compute(['User', 'logged'], ['ERROR', 'failed']);
      expect(r1).toBe(1); // two different constants, length=2 → 2/2=1
    });

    it('should handle templates with only constants that match', () => {
      expect(gd.compute(['User', 'logged'], ['User', 'logged'])).toBe(0);
    });

    it('should handle templates with only constants that differ at one position', () => {
      expect(gd.compute(['User', 'logged'], ['User', 'failed'])).toBe(0.5);
    });

    it('should handle coarse preference (low variable penalty)', () => {
      const coarse: GranularityConfig = { preference: 'coarse' };
      const balanced: GranularityConfig = { preference: 'balanced' };
      const coarseResult = gd.compute(['<*>'], ['User'], coarse);
      const balancedResult = gd.compute(['<*>'], ['User'], balanced);
      expect(coarseResult).toBeLessThan(balancedResult);
    });

    it('should handle fine preference (high variable penalty)', () => {
      const fine: GranularityConfig = { preference: 'fine' };
      const balanced: GranularityConfig = { preference: 'balanced' };
      const fineResult = gd.compute(['<*>'], ['User'], fine);
      const balancedResult = gd.compute(['<*>'], ['User'], balanced);
      expect(fineResult).toBeGreaterThan(balancedResult);
    });

    it('should return 0 for empty template A and B', () => {
      expect(gd.compute([], [])).toBe(0);
    });
  });
});
