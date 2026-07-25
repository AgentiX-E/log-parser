import { describe, it, expect } from 'vitest';
import { Evaluator } from '../../src/evaluation/Evaluator.js';
import type { ParsedLogEntry, GroundTruthEntry } from '../../src/evaluation/Evaluator.js';

describe('Evaluator', () => {
  const evaluator = new Evaluator();

  describe('perfect match', () => {
    it('should return all metrics at 1.0 and NED at 0', () => {
      const parsed: ParsedLogEntry[] = [
        { logId: '0', template: 'User <*> logged', eventId: 'E1' },
        { logId: '1', template: 'User <*> logged', eventId: 'E1' },
        { logId: '2', template: 'ERROR <*> failed', eventId: 'E2' },
      ];
      const gt: GroundTruthEntry[] = [
        { logId: '0', template: 'User <*> logged', eventId: 'E1' },
        { logId: '1', template: 'User <*> logged', eventId: 'E1' },
        { logId: '2', template: 'ERROR <*> failed', eventId: 'E2' },
      ];

      const result = evaluator.evaluate(parsed, gt);
      expect(result.ga).toBe(1);
      expect(result.pa).toBe(1);
      expect(result.pta).toBe(1);
      expect(result.rta).toBe(1);
      expect(result.fta).toBe(1);
      expect(result.ned).toBe(0);
    });
  });

  describe('complete mismatch', () => {
    it('should return metrics close to 0', () => {
      const parsed: ParsedLogEntry[] = [{ logId: '0', template: 'User <*> logged', eventId: 'E1' }];
      const gt: GroundTruthEntry[] = [{ logId: '0', template: 'ERROR failed', eventId: 'E99' }];

      const result = evaluator.evaluate(parsed, gt);
      expect(result.ga).toBe(0);
      expect(result.pa).toBe(0);
      expect(result.ned).toBeGreaterThan(0);
    });
  });

  describe('empty input', () => {
    it('should return all metrics at 0 with no NaN', () => {
      const result = evaluator.evaluate([], []);
      expect(result.ga).toBe(0);
      expect(result.fga).toBe(0);
      expect(result.pa).toBe(0);
      expect(result.pta).toBe(0);
      expect(result.rta).toBe(0);
      expect(result.fta).toBe(0);
      expect(result.ned).toBe(0);
      expect(Number.isNaN(result.ga)).toBe(false);
      expect(Number.isNaN(result.pa)).toBe(false);
      expect(Number.isNaN(result.ned)).toBe(false);
    });
  });

  describe('over-splitting', () => {
    it('should produce lower PTA than RTA when parser creates extra templates', () => {
      const parsed: ParsedLogEntry[] = [
        { logId: '0', template: 'User <*> logged', eventId: 'E1' },
        { logId: '1', template: 'User <*> logged', eventId: 'E2' }, // over-split
      ];
      const gt: GroundTruthEntry[] = [
        { logId: '0', template: 'User <*> logged', eventId: 'E1' },
        { logId: '1', template: 'User <*> logged', eventId: 'E1' }, // should be E1
      ];

      const result = evaluator.evaluate(parsed, gt);
      expect(result.pta).toBeLessThan(result.rta);
    });
  });

  describe('missing logIds', () => {
    it('should handle parsed entries with no matching ground truth', () => {
      const parsed: ParsedLogEntry[] = [
        { logId: '0', template: 'User <*> logged', eventId: 'E1' },
        { logId: '999', template: 'orphan', eventId: 'E99' },
      ];
      const gt: GroundTruthEntry[] = [{ logId: '0', template: 'User <*> logged', eventId: 'E1' }];

      const result = evaluator.evaluate(parsed, gt);
      expect(result.ga).toBeLessThan(1);
      expect(result.pa).toBeLessThan(1);
    });
  });

  describe('NED calculation', () => {
    it('should calculate NED correctly for similar templates', () => {
      const parsed: ParsedLogEntry[] = [{ logId: '0', template: 'User <*> logged', eventId: 'E1' }];
      const gt: GroundTruthEntry[] = [
        { logId: '0', template: 'User <*> logged in', eventId: 'E1' },
      ];

      const result = evaluator.evaluate(parsed, gt);
      expect(result.ned).toBeGreaterThan(0);
      expect(result.ned).toBeLessThan(1);
    });

    it('should return NED 0 for identical templates', () => {
      const parsed: ParsedLogEntry[] = [{ logId: '0', template: 'User <*> logged', eventId: 'E1' }];
      const gt: GroundTruthEntry[] = [{ logId: '0', template: 'User <*> logged', eventId: 'E1' }];

      const result = evaluator.evaluate(parsed, gt);
      expect(result.ned).toBe(0);
    });
  });

  describe('single template scenario', () => {
    it('should handle single log entry correctly', () => {
      const parsed: ParsedLogEntry[] = [{ logId: '0', template: 'single', eventId: 'E1' }];
      const gt: GroundTruthEntry[] = [{ logId: '0', template: 'single', eventId: 'E1' }];

      const result = evaluator.evaluate(parsed, gt);
      expect(result.ga).toBe(1);
      expect(result.pa).toBe(1);
      expect(result.pta).toBe(1);
      expect(result.rta).toBe(1);
    });
  });
});
