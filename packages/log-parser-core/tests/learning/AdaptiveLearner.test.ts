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

  // ── Insight messages ──

  it('should report "no corrections" insight when empty', () => {
    expect(learner.insight).toBe('No corrections yet.');
  });

  it('should report "increase simTh" insight when more under-splitting', () => {
    learner.learnFromCorrection('a', 'Foo bar', 'Foo <*>');
    learner.learnFromCorrection('b', 'Hello world', 'Hello <*>');
    learner.learnFromCorrection('c', 'User <*> login', 'User alice login');
    expect(learner.underSplittingTotal).toBeGreaterThan(learner.overSplittingTotal);
    expect(learner.insight).toBe('Increase simTh to separate merged templates.');
  });

  it('should report "decrease simTh" insight when more over-splitting', () => {
    learner.learnFromCorrection('a', 'User <*> in', 'User alice in');
    learner.learnFromCorrection('b', 'User <*> out', 'User bob out');
    learner.learnFromCorrection('c', 'Foo <*> bar', 'Foo baz bar');
    expect(learner.overSplittingTotal).toBeGreaterThan(learner.underSplittingTotal);
    expect(learner.insight).toBe('Decrease simTh to merge fragmented templates.');
  });

  it('should report "balanced" insight when equal corrections', () => {
    learner.learnFromCorrection(
      'User alice logged in from 10.0.0.1',
      'User <*> logged in from <IP>',
      'User alice logged in from 10.0.0.1',
    ); // over-splitting
    learner.learnFromCorrection(
      'User bob logged in from 10.0.0.2',
      'User bob logged in from 10.0.0.2',
      'User <*> logged in from <IP>',
    ); // under-splitting
    expect(learner.overSplittingTotal).toBe(1);
    expect(learner.underSplittingTotal).toBe(1);
    expect(learner.insight).toBe('Current simTh appears balanced.');
  });

  // ── Depth adjustment ──

  it('should increase depth on over-splitting corrections', () => {
    const initialDepth = learner.recommendedDepth;
    for (let i = 0; i < 3; i++) {
      learner.learnFromCorrection(
        `User user${i} from 10.0.0.${i}`,
        'User <*> from <IP>',
        `User user${i} from 10.0.0.${i}`,
      );
    }
    expect(learner.recommendedDepth).toBeGreaterThan(initialDepth);
  });

  it('should decrease depth on under-splitting corrections', () => {
    const initialDepth = learner.recommendedDepth;
    for (let i = 0; i < 3; i++) {
      learner.learnFromCorrection(
        `User user${i} online`,
        `User user${i} online`,
        'User <*> online',
      );
    }
    expect(learner.recommendedDepth).toBeLessThan(initialDepth);
  });

  it('should clamp depth within [3, 8] range', () => {
    // 20 over-splitting corrections → depth should be 8 (max)
    for (let i = 0; i < 20; i++) {
      learner.learnFromCorrection(`a${i} b${i}`, '<*> <*>', `a${i} b${i}`);
    }
    expect(learner.recommendedDepth).toBeLessThanOrEqual(8);
    expect(learner.recommendedDepth).toBeGreaterThanOrEqual(3);

    learner.reset();
    // 20 under-splitting corrections → depth should be 3 (min)
    for (let i = 0; i < 20; i++) {
      learner.learnFromCorrection(`a${i} b${i}`, `a${i} b${i}`, '<*> <*>');
    }
    expect(learner.recommendedDepth).toBeGreaterThanOrEqual(3);
    expect(learner.recommendedDepth).toBeLessThanOrEqual(8);
  });

  // ── Edge: same var count, longer expected → over-splitting ──

  it('should detect over-splitting when expected has more tokens but same vars', () => {
    learner.learnFromCorrection(
      'connection from 10.0.0.1 closed',
      'connection from <IP> closed and logged',
      'connection from 10.0.0.1 closed',
    );
    // expected template is longer → treat as over-splitting
    expect(learner.overSplittingTotal).toBe(1);
    expect(learner.recommendedSimTh).toBeLessThan(0.4);
  });

  // ── Apply test ──

  it('should apply learned config without throwing', () => {
    learner.learnFromCorrection('a', 'B <*> C', 'B a C');
    expect(() => learner.apply()).not.toThrow();
  });

  it('should accumulate corrections across multiple learn + apply cycles', () => {
    learner.learnFromCorrection('a', 'B <*> C', 'B a C');
    learner.apply();
    learner.learnFromCorrection('d', 'E <*> F', 'E d F');
    learner.apply();
    expect(learner.correctionCount).toBe(2);
    expect(learner.overSplittingTotal).toBe(2);
  });
});
