import { describe, expect, it } from 'vitest';

import { createBoard, createGameState, indexToPosition, type GameMove } from '../../src/core';
import { analyzePostHocDifficulty } from '../../src/generator/postHocAnalysis';

describe('post-hoc difficulty analysis', () => {
  it('uses the complete oracle only after play and recognizes a fully safe tiny board', () => {
    const state = createGameState(createBoard([1, 1]), 0);
    const solution: readonly GameMove[] = [{
      type: 'PAIR',
      first: indexToPosition(0),
      second: indexToPosition(1),
    }];
    const result = analyzePostHocDifficulty(state, solution, 'tiny', {
      nodeLimitPerQuery: 10_000,
      timeLimitMsPerQuery: 1_000,
    });
    expect(result.safeMoves.meanRatioLower).toBe(1);
    expect(result.safeMoves.criticalDecisionCount).toBe(0);
    expect(result.survivalBasin.every((basin) => basin.solvedRateLower === 1)).toBe(true);
    expect(result.oracle.unknownQueries).toBe(0);
  });
});
