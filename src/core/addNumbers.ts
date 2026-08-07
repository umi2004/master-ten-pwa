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

  const nextCells = [...board.cells.slice(0, additionStartIndex), ...alive];
  return createBoard(nextCells);
}

/** Addition starts immediately after the last alive digit, trimming only trailing holes. */
export function getAdditionStartIndex(board: Board): number {
  for (let index = board.cells.length - 1; index >= 0; index -= 1) {
    if (board.cells[index] !== 0) return index + 1;
  }
  return 0;
}

export function canAddNumbers(state: GameState): boolean {
  return state.status === 'PLAYING'
    && canAppendAliveNumbers(state.board, state.additionsRemaining);
}

export function canAppendAliveNumbers(board: Board, additionsRemaining: number): boolean {
  if (additionsRemaining <= 0 || !board.cells.some((cell) => cell !== 0)) return false;

  const aliveCount = board.cells.filter((cell) => cell !== 0).length;
  const rowsAfterAddition = Math.ceil(
    (getAdditionStartIndex(board) + aliveCount) / board.width,
  );
  return rowsAfterAddition <= MAX_BOARD_ROWS;
}
