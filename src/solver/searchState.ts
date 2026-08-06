import {
  applyGameMove,
  canAddNumbers,
  getLegalPairMoves,
  type GameMove,
  type GameState,
} from '../core';

export function createStateKey(state: GameState): string {
  return [
    state.ruleVersion,
    state.board.logicalLength,
    state.additionsRemaining,
    state.board.cells.join(','),
  ].join('|');
}

export function getSearchMoves(state: GameState): readonly GameMove[] {
  if (state.status !== 'PLAYING') {
    return [];
  }

  const pairs = getLegalPairMoves(state.board);
  if (pairs.length > 0) {
    return pairs;
  }
  return canAddNumbers(state) ? [{ type: 'ADD_NUMBERS' }] : [];
}

export function applySearchMove(state: GameState, move: GameMove): GameState {
  const stateWithoutHistory: GameState = { ...state, history: [] };
  return { ...applyGameMove(stateWithoutHistory, move), history: [] };
}

export function countSolutionAdditions(solution: readonly GameMove[]): number {
  return solution.reduce(
    (count, move) => count + (move.type === 'ADD_NUMBERS' ? 1 : 0),
    0,
  );
}
