import { describe, expect, it } from 'vitest';

import { applyGameMove, createBoard, createGameState } from '../../src/core';
import {
  compareLexicographicObjectives,
  solveMultiObjective,
  summarizeAdditionCapProofs,
  type AdditionCapProof,
} from '../../src/solver';

const generous = { nodeLimit: 1_000_000, timeLimitMs: 30_000, maxDepth: 80 } as const;

function proof(additionsAvailable: number, status: AdditionCapProof['status']): AdditionCapProof {
  return {
    additionsAvailable,
    status,
    solution: [],
    nodesExpanded: 1,
    elapsedMs: 1,
    terminationReason: status === 'UNSOLVABLE' ? 'exhausted' : status === 'SOLVED' ? 'solved' : 'node-limit',
  };
}

describe('multi-objective solver', () => {
  it('compares additions, then moves, then maximum rows lexicographically', () => {
    expect(compareLexicographicObjectives(
      { additions: 4, moves: 100, maximumRows: 40 },
      { additions: 5, moves: 1, maximumRows: 1 },
    )).toBeLessThan(0);
    expect(compareLexicographicObjectives(
      { additions: 5, moves: 40, maximumRows: 20 },
      { additions: 5, moves: 41, maximumRows: 1 },
    )).toBeLessThan(0);
    expect(compareLexicographicObjectives(
      { additions: 5, moves: 40, maximumRows: 10 },
      { additions: 5, moves: 40, maximumRows: 11 },
    )).toBeLessThan(0);
  });

  it('proves a real kernel needs exactly three additions and replays the optimum', () => {
    const initial = createGameState(createBoard([1, 2]), 5);
    const result = solveMultiObjective(initial, 5, generous, false);
    expect(result.status).toBe('SOLVED');
    expect(result.minimumAdditions).toBe(3);
    expect(result.minimumAdditionsProven).toBe(true);
    expect(result.minimumMovesProven).toBe(true);
    expect(result.minimumMaximumRowsProven).toBe(true);
    const terminal = result.minimumMoveSolutionAtMinimumAdditions.reduce(
      (state, move) => applyGameMove(state, move),
      initial,
    );
    expect(terminal.status).toBe('WON');
  });

  it('recognizes the required 0..4 UNSOLVABLE and 5 SOLVED proof pattern', () => {
    const summary = summarizeAdditionCapProofs([
      proof(0, 'UNSOLVABLE'), proof(1, 'UNSOLVABLE'), proof(2, 'UNSOLVABLE'),
      proof(3, 'UNSOLVABLE'), proof(4, 'UNSOLVABLE'), proof(5, 'SOLVED'),
    ]);
    expect(summary).toEqual({ status: 'SOLVED', minimumAdditions: 5, minimumAdditionsProven: true });
  });

  it('never treats UNKNOWN as an UNSOLVABLE lower-cap proof', () => {
    const summary = summarizeAdditionCapProofs([
      proof(0, 'UNSOLVABLE'), proof(1, 'UNSOLVABLE'), proof(2, 'UNKNOWN'),
      proof(3, 'UNSOLVABLE'), proof(4, 'UNSOLVABLE'), proof(5, 'SOLVED'),
    ]);
    expect(summary.minimumAdditions).toBe(5);
    expect(summary.minimumAdditionsProven).toBe(false);
  });
});
