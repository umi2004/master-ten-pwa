import { describe, expect, it } from 'vitest';

import { createBoard, createGameState } from '../../src/core';
import {
  HUMAN_BENCHMARK_TRIALS,
  HUMAN_PLAYER_AUDIT,
  humanTrialSeed,
  simulateHumanStrategy,
} from '../../src/generator/humanPlayers';

describe('human player audit boundary', () => {
  it('uses the required reproducible trial counts', () => {
    expect(HUMAN_BENCHMARK_TRIALS.random).toBeGreaterThanOrEqual(2_000);
    for (const strategy of ['proximity', 'same-value', 'sum-ten', 'row-clear', 'reserve-add', 'early-add'] as const) {
      expect(HUMAN_BENCHMARK_TRIALS[strategy]).toBeGreaterThanOrEqual(1_000);
    }
    for (const strategy of ['lookahead-2', 'lookahead-3', 'lookahead-4'] as const) {
      expect(HUMAN_BENCHMARK_TRIALS[strategy]).toBeGreaterThanOrEqual(200);
    }
  });

  it('declares the requested ply depth and no complete-solver use', () => {
    expect(HUMAN_PLAYER_AUDIT.find((model) => model.strategy === 'lookahead-2')?.depth).toBe(2);
    expect(HUMAN_PLAYER_AUDIT.find((model) => model.strategy === 'lookahead-3')?.depth).toBe(3);
    expect(HUMAN_PLAYER_AUDIT.find((model) => model.strategy === 'lookahead-4')?.depth).toBe(4);
    expect(HUMAN_PLAYER_AUDIT.every((model) => model.usesCompleteSolver === false)).toBe(true);
  });

  it('has stable trial seeds and Wilson confidence bounds', () => {
    expect(humanTrialSeed('puzzle', 'random', 7)).toBe('puzzle|human-v3|random|0007');
    const state = createGameState(createBoard([1, 1]), 0);
    const first = simulateHumanStrategy(state, 'audit', 'random', 20);
    const second = simulateHumanStrategy(state, 'audit', 'random', 20);
    expect(second).toEqual(first);
    expect(first.clears).toBe(20);
    expect(first.clearRate95.lower).toBeLessThanOrEqual(first.clearRate);
    expect(first.clearRate95.upper).toBeGreaterThanOrEqual(first.clearRate);
    expect(first.failures).toBe(0);
    expect(first.nearMissRate).toBe(0);
  });

  it('records residual histograms and near-miss failures without solver data', () => {
    const state = createGameState(createBoard([1, 2]), 0);
    const result = simulateHumanStrategy(state, 'near-miss', 'same-value', 5);
    expect(result.clears).toBe(0);
    expect(result.lateNearMissRate).toBe(1);
    expect(result.residualAliveHistogram).toEqual({ '2': 5 });
    expect(result.failureRemainingAdditionsDistribution).toEqual({ '0': 5 });
  });

  it('keeps analysis off by default and records only bounded successful traces when requested', () => {
    const state = createGameState(createBoard([1, 1]), 0);
    const normal = simulateHumanStrategy(state, 'trace', 'proximity', 2);
    expect('successfulTraces' in normal).toBe(false);

    const analyzed = simulateHumanStrategy(
      state,
      'trace',
      'proximity',
      2,
      10,
      { analysis: true, maxSuccessfulTraces: 1 },
    );
    expect(analyzed.metrics.clears).toBe(2);
    expect(analyzed.successfulTraces).toHaveLength(1);
    expect(analyzed.successfulTraces[0]?.steps[0]).toMatchObject({
      strategy: 'proximity',
      trial: 0,
      ply: 0,
      legalTransitionCount: 1,
      additionsRemaining: 0,
      additionsUsed: 0,
    });
  });
});
