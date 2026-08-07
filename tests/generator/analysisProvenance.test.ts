import { describe, expect, it } from 'vitest';

import { createBoard, createGameState, getLegalPairMoves } from '../../src/core';
import {
  applyMoveWithProvenance,
  createAnalysisProvenance,
} from '../../src/generator/analysisProvenance';

describe('analysis-only cell provenance', () => {
  it('starts each logical cell at its own initial origin and marks pair deletions dead', () => {
    const state = createGameState(createBoard([1, 1, 2, 2]), 1);
    const provenance = createAnalysisProvenance(state.board);
    expect(provenance.cells.map((cell) => cell.originInitialIndex)).toEqual([0, 1, 2, 3]);
    const move = getLegalPairMoves(state.board).find((candidate) => candidate.first.column === 0)!;
    const next = applyMoveWithProvenance(state, provenance, move);
    expect(next.provenance.cells[0]?.alive).toBe(false);
    expect(next.provenance.cells[1]?.alive).toBe(false);
    expect(next.provenance.cells[2]?.originInitialIndex).toBe(2);
  });

  it('uses the trimmed ADD tail and preserves origins through multiple additions', () => {
    let state = createGameState(createBoard([0, 2, 0, 0, 4, 0, 0, 0, 0]), 2);
    let provenance = createAnalysisProvenance(state.board);
    let next = applyMoveWithProvenance(state, provenance, { type: 'ADD_NUMBERS' });
    expect(next.state.board.cells).toEqual([0, 2, 0, 0, 4, 2, 4]);
    expect(next.provenance.cells[5]).toMatchObject({
      originInitialIndex: 1,
      parentLogicalIndex: 1,
      generation: 1,
      copiedByAdditionNumber: 1,
    });
    expect(next.provenance.cells[6]?.originInitialIndex).toBe(4);

    state = next.state;
    provenance = next.provenance;
    next = applyMoveWithProvenance(state, provenance, { type: 'ADD_NUMBERS' });
    expect(next.provenance.cells.slice(-4).map((cell) => cell.originInitialIndex)).toEqual([1, 4, 1, 4]);
    expect(next.provenance.cells.at(-1)?.generation).toBe(2);
  });
});
