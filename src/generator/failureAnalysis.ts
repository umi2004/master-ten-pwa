import { canAppendAliveNumbers, countAlive, getLegalPairMoves, type GameState } from '../core';
import type { HumanFailureClassification } from '../puzzles/types';

export function isNearMissState(state: GameState): boolean {
  const alive = countAlive(state.board);
  return state.additionsRemaining === 0
    && state.status === 'LOST'
    && getLegalPairMoves(state.board).length === 0
    && alive >= 2
    && alive <= 10;
}

export function classifyHumanFailure(
  state: GameState,
  stoppedAtStepLimit = false,
): HumanFailureClassification {
  if (stoppedAtStepLimit && state.status === 'PLAYING') return 'UNKNOWN';
  if (isNearMissState(state)) return 'LATE_NEAR_MISS';
  const alive = countAlive(state.board);
  if (
    state.additionsRemaining === 0
    && state.status === 'LOST'
    && getLegalPairMoves(state.board).length === 0
    && alive >= 11
  ) {
    return 'LATE_LARGE_REMAINDER';
  }
  if (
    state.status === 'LOST'
    && state.additionsRemaining > 0
    && !canAppendAliveNumbers(state.board, state.additionsRemaining)
    && getLegalPairMoves(state.board).length === 0
  ) {
    return 'HEIGHT_OVERFLOW';
  }
  return 'EARLY_COLLAPSE';
}
