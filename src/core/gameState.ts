import { countAlive } from './board';
import { appendAliveNumbers, canAddNumbers, canAppendAliveNumbers } from './addNumbers';
import { applyPairMove, getLegalPairMoves, InvalidMoveError } from './moves';
import { normalizeBoard } from './normalize';
import type {
  Board,
  GameMove,
  GameSnapshot,
  GameState,
  GameStatus,
} from './types';
import { RULE_VERSION } from './version';

export function determineGameStatus(board: Board, additionsRemaining: number): GameStatus {
  if (countAlive(board) === 0) {
    return 'WON';
  }
  if (
    getLegalPairMoves(board).length === 0
    && !canAppendAliveNumbers(board, additionsRemaining)
  ) {
    return 'LOST';
  }
  return 'PLAYING';
}

function snapshot(state: GameState): GameSnapshot {
  return {
    board: state.board,
    additionsRemaining: state.additionsRemaining,
    additionsUsed: state.additionsUsed,
    moveCount: state.moveCount,
    status: state.status,
  };
}

export function createGameState(board: Board, additionsRemaining = 3): GameState {
  if (!Number.isInteger(additionsRemaining) || additionsRemaining < 0) {
    throw new InvalidMoveError('数字追加残数は0以上の整数でなければなりません。');
  }

  const normalizedBoard = normalizeBoard(board);
  return {
    board: normalizedBoard,
    additionsRemaining,
    additionsUsed: 0,
    moveCount: 0,
    status: determineGameStatus(normalizedBoard, additionsRemaining),
    ruleVersion: RULE_VERSION,
    history: [],
    hintCount: 0,
    undoCount: 0,
    restartCount: 0,
  };
}

export function applyGameMove(state: GameState, move: GameMove): GameState {
  if (state.status !== 'PLAYING') {
    throw new InvalidMoveError('終了したゲームには手を適用できません。');
  }

  if (move.type === 'PAIR') {
    const board = applyPairMove(state.board, move);
    const nextState = {
      ...state,
      board,
      moveCount: state.moveCount + 1,
      history: [...state.history, snapshot(state)],
    };
    return {
      ...nextState,
      status: determineGameStatus(board, nextState.additionsRemaining),
    };
  }

  if (!canAddNumbers(state)) {
    throw new InvalidMoveError('現在は数字を追加できません。');
  }

  const board = appendAliveNumbers(state.board);
  const additionsRemaining = state.additionsRemaining - 1;
  const nextState = {
    ...state,
    board,
    additionsRemaining,
    additionsUsed: state.additionsUsed + 1,
    moveCount: state.moveCount + 1,
    history: [...state.history, snapshot(state)],
  };
  return {
    ...nextState,
    status: determineGameStatus(board, additionsRemaining),
  };
}

export function undoLastMove(state: GameState): GameState {
  const previous = state.history.at(-1);
  if (!previous) {
    return state;
  }

  return {
    ...state,
    ...previous,
    history: state.history.slice(0, -1),
    undoCount: state.undoCount + 1,
  };
}

export function recordHintUse(state: GameState): GameState {
  return { ...state, hintCount: state.hintCount + 1 };
}
