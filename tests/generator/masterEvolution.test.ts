import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createBoard, createGameState } from '../../src/core';
import { simulateHumanStrategy } from '../../src/generator/humanPlayers';
import {
  calculateMasterFitness,
  hammingDistance,
  measureDiversity,
  summarizeEvolutionMetrics,
} from '../../src/generator/masterEvolution';
import {
  evaluationCacheKey,
  MasterSearchStore,
} from '../../src/generator/masterSearchStore';

describe('MASTER evolution scoring and persistence', () => {
  it('rewards lower heuristic clear rates and leaves absent statistics undefined', () => {
    const hard = createGameState(createBoard([1, 2]), 0);
    const easy = createGameState(createBoard([1, 1]), 0);
    const strategies = ['proximity', 'row-clear', 'lookahead-2'] as const;
    const hardMetrics = summarizeEvolutionMetrics(strategies.map((strategy) =>
      simulateHumanStrategy(hard, 'hard', strategy, 2)));
    const easyMetrics = summarizeEvolutionMetrics(strategies.map((strategy) =>
      simulateHumanStrategy(easy, 'easy', strategy, 2)));
    expect(hardMetrics.successfulAdditionsMean).toBeUndefined();
    expect(easyMetrics.nearMissAmongFailures).toBeUndefined();
    expect(calculateMasterFitness(hardMetrics)).toBeGreaterThan(calculateMasterFitness(easyMetrics));
  });

  it('measures exact diversity without imposing a parent-child Hamming 12 gate', () => {
    const parent = Array.from({ length: 42 }, () => 1) as 1[];
    const child = [...parent];
    child[0] = 2 as never;
    child[10] = 3 as never;
    expect(hammingDistance(parent, child)).toBe(2);
    const diversity = measureDiversity(child, [], parent);
    expect(diversity.hammingToParent).toBe(2);
    expect(diversity.boardHash).not.toBe(measureDiversity(parent, [], parent).boardHash);
  });

  it('appends ledger entries, resumes checkpoints, and caches identical evaluations', () => {
    const directory = mkdtempSync(join(tmpdir(), 'master-ten-search-'));
    try {
      const store = new MasterSearchStore(directory);
      store.appendLedger({ candidateId: 'one' });
      expect(store.readLedger<{ candidateId: string }>()).toEqual([{ candidateId: 'one' }]);
      store.writeCheckpoint({ generation: 3 });
      expect(store.readCheckpoint<{ generation: number }>()).toEqual({ generation: 3 });

      const state = createGameState(createBoard([1, 1]), 0);
      let simulations = 0;
      const key = evaluationCacheKey('board', 'proximity', 2, 'seed');
      const compute = () => {
        simulations += 1;
        return simulateHumanStrategy(state, 'seed', 'proximity', 2);
      };
      expect(store.getOrComputeEvaluation(key, compute).cacheHit).toBe(false);
      expect(store.getOrComputeEvaluation(key, compute).cacheHit).toBe(true);
      expect(simulations).toBe(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
