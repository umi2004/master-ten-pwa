import { describe, expect, it } from 'vitest';

import { createBoard, createGameState, getLegalPairMoves } from '../../src/core';
import { createStateKey, getSearchMoves } from '../../src/solver';
import {
  extractCounterexamples,
  mutateCounterexampleGuided,
} from '../../src/generator/counterexampleGuided';
import type { SuccessfulHumanTrace } from '../../src/generator/humanPlayers';

describe('counterexample-guided mutation', () => {
  it('maps a branching successful move back to its initial cells', () => {
    const state = createGameState(createBoard([1, 1]), 1);
    const selectedMove = getLegalPairMoves(state.board)[0]!;
    const trace: SuccessfulHumanTrace = {
      strategy: 'row-clear',
      trial: 0,
      steps: [{
        strategy: 'row-clear',
        trial: 0,
        ply: 0,
        stateKey: createStateKey(state),
        legalTransitionCount: getSearchMoves(state).length,
        legalMoves: getSearchMoves(state),
        selectedMove,
        additionsRemaining: 1,
        additionsUsed: 0,
      }],
    };
    const summary = extractCounterexamples(state, [trace], [{ type: 'ADD_NUMBERS' }]);
    expect(summary.initialIndexes).toEqual([0, 1]);
    expect(summary.firstDivergencePly).toBe(0);
  });

  it('changes only 2-6 initial cells and is deterministic for one seed and index', () => {
    const cells = Array.from({ length: 42 }, (_, index) => (index % 9) + 1) as (1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9)[];
    const counterexample = { initialIndexes: [4, 8, 12, 16, 20, 24], rankedCells: [] };
    const first = mutateCounterexampleGuided(cells, counterexample, 'stable', 5);
    const second = mutateCounterexampleGuided(cells, counterexample, 'stable', 5);
    expect(second).toEqual(first);
    expect(first.changedInitialIndexes.length).toBeGreaterThanOrEqual(2);
    expect(first.changedInitialIndexes.length).toBeLessThanOrEqual(6);
    const changed = cells.flatMap((cell, index) => cell === first.initialCells[index] ? [] : [index]);
    expect(changed).toEqual(first.changedInitialIndexes);
  });
});
