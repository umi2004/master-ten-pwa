import { createBoard } from './board';
import type { Board, Cell } from './types';

export function normalizeBoard(board: Board): Board {
  const normalized: Cell[] = [];

  for (let start = 0; start < board.logicalLength; start += board.width) {
    const row = board.cells.slice(start, Math.min(start + board.width, board.logicalLength));
    if (row.some((cell) => cell !== 0)) {
      normalized.push(...row);
    }
  }

  return createBoard(normalized);
}
