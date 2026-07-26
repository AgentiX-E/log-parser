import { describe, it, expect, beforeEach } from 'vitest';
import { DrainDataPlane } from '../../src/data/DrainDataPlane.js';
import { AdaptiveLearner } from '../../src/learning/AdaptiveLearner.js';

describe('AdaptiveLearner', () => {
  let drain: DrainDataPlane;
  let learner: AdaptiveLearner;

  beforeEach(() => {
    drain = new DrainDataPlane();
    learner = new AdaptiveLearner(drain);
  });

  it('should start with Drain3 defaults', () => {
    expect(learner.recommendedSimTh).toBe(0.4);
    expect(learner.recommendedDepth).toBe(4);
    expect(learner.correctionCount).toBe(0);
  });

  it('should decrease simTh on over-splitting corrections', () => {
    learner.learnFromCorrection(
      'User alice logged in from 10.0.0.1',
      'User <*> logged in from <IP>',
      'User alice logged in from 10.0.0.1',
    );
    expect(learner.recommendedSimTh).toBeLessThan(0.4);
    expect(learner.overSplittingTotal).toBe(1);
  });

  it('should increase simTh on under-splitting corrections', () => {
    learner.learnFromCorrection(
      'User alice logged in from 10.0.0.1',
      'User alice logged in from 10.0.0.1',
      'User <*> logged in from <IP>',
    );
    expect(learner.recommendedSimTh).toBeGreaterThan(0.4);
    expect(learner.underSplittingTotal).toBe(1);
  });

  it('should keep simTh within safe bounds [0.2, 0.8]', () => {
    // 20 over-splitting corrections → should not go below 0.2
    for (let i = 0; i < 20; i++) {
      learner.learnFromCorrection(
        `User user${i} logged in from 10.0.0.${i}`,
        'User <*> logged in from <IP>',
        `User user${i} logged in from 10.0.0.${i}`,
      );
    }
    expect(learner.recommendedSimTh).toBeGreaterThanOrEqual(0.2);

    learner.reset();
    // 20 under-splitting corrections → should not exceed 0.8
    for (let i = 0; i < 20; i++) {
      learner.learnFromCorrection(
        `User user${i} logged in from 10.0.0.${i}`,
        `User user${i} logged in from 10.0.0.${i}`,
        'User <*> logged in from <IP>',
      );
    }
    expect(learner.recommendedSimTh).toBeLessThanOrEqual(0.8);
  });

  it('should increment correction count', () => {
    learner.learnFromCorrection('a', 'b', 'c');
    learner.learnFromCorrection('d', 'e', 'f');
    expect(learner.correctionCount).toBe(2);
  });

  it('should track over-splitting and under-splitting separately', () => {
    learner.learnFromCorrection('a', 'User <*>', 'User alice');
    learner.learnFromCorrection('b', 'User <*>', 'User bob');
    learner.learnFromCorrection('c', 'Foo bar', 'Foo <*>');
    expect(learner.overSplittingTotal).toBe(2); // first two: actual has fewer <*>
    expect(learner.underSplittingTotal).toBe(1); // last: actual has more <*>
    expect(learner.correctionCount).toBe(3);
  });

  it('should reset to defaults', () => {
    learner.learnFromCorrection('a', 'User <*> logged in', 'User alice logged in');
    learner.learnFromCorrection('b', 'User bob logged in', 'User <*> logged in');
    expect(learner.correctionCount).toBe(2);

    learner.reset();
    expect(learner.recommendedSimTh).toBe(0.4);
    expect(learner.recommendedDepth).toBe(4);
    expect(learner.correctionCount).toBe(0);
    expect(learner.overSplittingTotal).toBe(0);
    expect(learner.underSplittingTotal).toBe(0);
  });

  it('should apply learned config to drain', () => {
    learner.learnFromCorrection(
      'User alice logged in from 10.0.0.1',
      'User <*> logged in from <IP>',
      'User alice logged in from 10.0.0.1',
    );
    const simBefore = learner.recommendedSimTh;
    expect(simBefore).toBeLessThan(0.4);
    // Apply should succeed without error
    expect(() => learner.apply()).not.toThrow();
    // Verify correction was counted
    expect(learner.correctionCount).toBe(1);
  });

  it('should handle same-variable-count templates by token length', () => {
    learner.learnFromCorrection(
      'connection from 192.168.1.1 closed',
      'connection from <IP> closed and logged',
      'connection from 192.168.1.1 closed',
    );
    // expected has more tokens → over-splitting
    expect(learner.overSplittingTotal).toBe(1);
  });

  it('should handle empty templates', () => {
    learner.learnFromCorrection('', '', '');
    expect(learner.correctionCount).toBe(1);
    // Empty templates with same variable count → under-splitting by default
    expect(learner.underSplittingTotal).toBe(1);
  });

  it('should handle multiple corrections cumulatively (bounded by min)', () => {
    // 5 over-splitting corrections — simTh hits min bound 0.2 after 4 steps
    for (let i = 0; i < 5; i++) {
      learner.learnFromCorrection(`log${i}`, 'User <*> logged in', `User user${i} logged in`);
    }
    // Should be clamped at min 0.2
    expect(learner.recommendedSimTh).toBe(0.2);
    expect(learner.overSplittingTotal).toBe(5);
  });
});
