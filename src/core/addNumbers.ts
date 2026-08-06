import { createBoard } from './board';
import { getLegalPairMoves, InvalidMoveError } from './moves';
import type { Board, Cell, GameState } from './types';
import { MAX_BOARD_ROWS } from './version';

export function appendAliveNumbers(board: Board): Board {
  const alive = board.cells.filter((cell): cell is Exclude<Cell, 0> => cell !== 0);
  if (alive.length === 0) {
    throw new InvalidMoveError('空の盤面には数字を追加できません。');
  }

  const nextLength = board.logicalLength + alive.length;
  if (Math.ceil(nextLength / board.width) > MAX_BOARD_ROWS) {
    throw new InvalidMoveError('盤面の高さ上限を超えるため数字を追加できません。');
  }

  return createBoard([...board.cells, ...alive]);
}

export function canAddNumbers(state: GameState): boolean {
  if (
    state.status !== 'PLAYING' ||
    state.additionsRemaining <= 0 ||
    getLegalPairMoves(state.board).length > 0 ||
    !state.board.cells.some((cell) => cell !== 0)
  ) {
    return false;
  }

  const aliveCount = state.board.cells.filter((cell) => cell !== 0).length;
  const rowsAfterAddition = Math.ceil(
    (state.board.logicalLength + aliveCount) / state.board.width,
  );
  return rowsAfterAddition <= MAX_BOARD_ROWS;
}
