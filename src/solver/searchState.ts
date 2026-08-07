import {
  applyGameMove,
  applyKnownLegalPairMove,
  canAddNumbers,
  determineGameStatus,
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
  return canAddNumbers(state)
    ? [...pairs, { type: 'ADD_NUMBERS' }]
    : pairs;
}

export function applySearchMove(state: GameState, move: GameMove): GameState {
  const stateWithoutHistory: GameState = { ...state, history: [] };
  if (move.type === 'ADD_NUMBERS') {
    return { ...applyGameMove(stateWithoutHistory, move), history: [] };
  }

  // Search callers only pass moves returned by getSearchMoves. Avoid repeating the
  // full legality scan already performed to obtain that move.
  const board = applyKnownLegalPairMove(state.board, move);
  const status = determineGameStatus(board, state.additionsRemaining);
  return {
    ...stateWithoutHistory,
    board,
    moveCount: state.moveCount + 1,
    status,
  };
}

export function countSolutionAdditions(solution: readonly GameMove[]): number {
  return solution.reduce(
    (count, move) => count + (move.type === 'ADD_NUMBERS' ? 1 : 0),
    0,
  );
}

export function hasOddMatchClassWithoutAddition(state: GameState): boolean {
  if (state.additionsRemaining > 0) return false;
  const counts = [0, 0, 0, 0, 0];
  for (const digit of state.board.cells) {
    if (digit === 0) continue;
    const matchClass = Math.min(digit, 10 - digit) - 1;
    counts[matchClass] = (counts[matchClass] ?? 0) + 1;
  }
  return counts.some((count) => count % 2 === 1);
}
