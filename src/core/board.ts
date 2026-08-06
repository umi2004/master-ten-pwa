import type { Board, Cell, Position } from './types';
import { BOARD_WIDTH } from './version';

export class InvalidBoardError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'InvalidBoardError';
  }
}

export function isCell(value: number): value is Cell {
  return Number.isInteger(value) && value >= 0 && value <= 9;
}

export function createBoard(
  cells: readonly number[],
  logicalLength = cells.length,
): Board {
  if (!Number.isInteger(logicalLength) || logicalLength < 0) {
    throw new InvalidBoardError('論理長は0以上の整数でなければなりません。');
  }
  if (logicalLength !== cells.length) {
    throw new InvalidBoardError('セル配列長と論理長が一致していません。');
  }
  if (!cells.every(isCell)) {
    throw new InvalidBoardError('セル値は0から9の整数でなければなりません。');
  }

  return {
    width: BOARD_WIDTH,
    cells: [...cells] as Cell[],
    logicalLength,
  };
}

export function positionToIndex(board: Board, position: Position): number {
  if (
    !Number.isInteger(position.row) ||
    !Number.isInteger(position.column) ||
    position.row < 0 ||
    position.column < 0 ||
    position.column >= board.width
  ) {
    throw new InvalidBoardError('盤面位置が範囲外です。');
  }

  const index = position.row * board.width + position.column;
  if (index >= board.logicalLength) {
    throw new InvalidBoardError('盤面位置が論理範囲外です。');
  }
  return index;
}

export function indexToPosition(index: number): Position {
  if (!Number.isInteger(index) || index < 0) {
    throw new InvalidBoardError('インデックスは0以上の整数でなければなりません。');
  }
  return {
    row: Math.floor(index / BOARD_WIDTH),
    column: index % BOARD_WIDTH,
  };
}

export function countAlive(board: Board): number {
  return board.cells.reduce<number>(
    (count, cell) => count + (cell === 0 ? 0 : 1),
    0,
  );
}

export function boardRows(board: Board): number {
  return Math.ceil(board.logicalLength / board.width);
}
