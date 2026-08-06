import {
  createBoard,
  indexToPosition,
  positionToIndex,
} from './board';
import { normalizeBoard } from './normalize';
import type { Board, Cell, PairMove } from './types';

const DIRECTIONS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
] as const;

export class InvalidMoveError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'InvalidMoveError';
  }
}

export function valuesMatch(first: Cell, second: Cell): boolean {
  return first !== 0 && second !== 0 && (first === second || first + second === 10);
}

function pairKey(first: number, second: number): string {
  return first < second ? `${first}:${second}` : `${second}:${first}`;
}

function addCandidate(
  board: Board,
  firstIndex: number,
  secondIndex: number,
  candidates: Map<string, PairMove>,
): void {
  const first = Math.min(firstIndex, secondIndex);
  const second = Math.max(firstIndex, secondIndex);
  const firstCell = board.cells[first];
  const secondCell = board.cells[second];

  if (firstCell === undefined || secondCell === undefined || !valuesMatch(firstCell, secondCell)) {
    return;
  }

  candidates.set(pairKey(first, second), {
    type: 'PAIR',
    first: indexToPosition(first),
    second: indexToPosition(second),
  });
}

export function getLegalPairMoves(board: Board): readonly PairMove[] {
  const candidates = new Map<string, PairMove>();
  const rowCount = Math.ceil(board.logicalLength / board.width);

  for (let index = 0; index < board.logicalLength; index += 1) {
    if (board.cells[index] === 0) {
      continue;
    }

    const row = Math.floor(index / board.width);
    const column = index % board.width;

    for (const [rowStep, columnStep] of DIRECTIONS) {
      let nextRow = row + rowStep;
      let nextColumn = column + columnStep;

      while (
        nextRow >= 0 &&
        nextRow < rowCount &&
        nextColumn >= 0 &&
        nextColumn < board.width
      ) {
        const nextIndex = nextRow * board.width + nextColumn;
        if (nextIndex >= board.logicalLength) {
          break;
        }
        if (board.cells[nextIndex] !== 0) {
          addCandidate(board, index, nextIndex, candidates);
          break;
        }
        nextRow += rowStep;
        nextColumn += columnStep;
      }
    }
  }

  let previousAliveIndex: number | undefined;
  for (let index = 0; index < board.logicalLength; index += 1) {
    if (board.cells[index] === 0) {
      continue;
    }
    if (
      previousAliveIndex !== undefined &&
      Math.floor(previousAliveIndex / board.width) !== Math.floor(index / board.width)
    ) {
      addCandidate(board, previousAliveIndex, index, candidates);
    }
    previousAliveIndex = index;
  }

  return [...candidates.entries()]
    .sort(([firstKey], [secondKey]) => {
      const [firstA = 0, firstB = 0] = firstKey.split(':').map(Number);
      const [secondA = 0, secondB = 0] = secondKey.split(':').map(Number);
      return firstA - secondA || firstB - secondB;
    })
    .map(([, move]) => move);
}

export function isPairMoveLegal(board: Board, move: PairMove): boolean {
  let firstIndex: number;
  let secondIndex: number;
  try {
    firstIndex = positionToIndex(board, move.first);
    secondIndex = positionToIndex(board, move.second);
  } catch {
    return false;
  }

  if (firstIndex === secondIndex) {
    return false;
  }
  const targetKey = pairKey(firstIndex, secondIndex);
  return getLegalPairMoves(board).some((candidate) => {
    const candidateFirst = positionToIndex(board, candidate.first);
    const candidateSecond = positionToIndex(board, candidate.second);
    return pairKey(candidateFirst, candidateSecond) === targetKey;
  });
}

export function applyPairMove(board: Board, move: PairMove): Board {
  if (!isPairMoveLegal(board, move)) {
    throw new InvalidMoveError('この2つの数字は消去できません。');
  }

  const nextCells = [...board.cells];
  nextCells[positionToIndex(board, move.first)] = 0;
  nextCells[positionToIndex(board, move.second)] = 0;
  return normalizeBoard(createBoard(nextCells));
}
