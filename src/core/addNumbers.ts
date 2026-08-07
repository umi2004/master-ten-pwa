import { createBoard } from './board';
import { InvalidMoveError } from './moves';
import type { Board, Cell, GameState } from './types';
import { MAX_BOARD_ROWS } from './version';

export function appendAliveNumbers(board: Board): Board {
  const alive = board.cells.filter((cell): cell is Exclude<Cell, 0> => cell !== 0);
  if (alive.length === 0) {
    throw new InvalidMoveError('空の盤面には数字を追加できません。');
  }

  const additionStartIndex = getAdditionStartIndex(board);
  const nextLength = additionStartIndex + alive.length;
  if (Math.ceil(nextLength / board.width) > MAX_BOARD_ROWS) {
    throw new InvalidMoveError('盤面の高さ上限を超えるため数字を追加できません。');
  }

  const nextCells = [...board.cells];
  nextCells.splice(additionStartIndex, 0, ...alive);
  return createBoard(nextCells);
}

/** Addition always starts after the logical tail, never after the last alive digit. */
export function getAdditionStartIndex(board: Board): number {
  return board.logicalLength;
}

export function canAddNumbers(state: GameState): boolean {
  return state.status === 'PLAYING'
    && canAppendAliveNumbers(state.board, state.additionsRemaining);
}

export function canAppendAliveNumbers(board: Board, additionsRemaining: number): boolean {
  if (additionsRemaining <= 0 || !board.cells.some((cell) => cell !== 0)) return false;

  const aliveCount = board.cells.filter((cell) => cell !== 0).length;
  const rowsAfterAddition = Math.ceil(
    (board.logicalLength + aliveCount) / board.width,
  );
  return rowsAfterAddition <= MAX_BOARD_ROWS;
}
