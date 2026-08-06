import type { Cell } from '../core';
import type { DesignFamily } from '../puzzles/types';
import { createPrng, type Prng } from './prng';

export interface PuzzleCandidate {
  readonly displayNumber: number;
  readonly seed: string;
  readonly designFamily: DesignFamily;
  readonly cells: readonly Cell[];
  readonly additionsAllowed: number;
  readonly reviewed: boolean;
}

const FAMILY_ORDER: readonly DesignFamily[] = [
  'trap-cascade',
  'double-trap',
  'add-one',
  'add-two',
  'add-three',
];

const TRAP_BASE: readonly Cell[] = [
  0, 7, 0, 7, 0, 1, 0, 0, 7,
  0, 0, 7, 0, 8, 2, 0, 9, 0,
];

const CLASS_PAIRS = [
  [1, 2],
  [3, 4],
  [5, 1],
  [2, 3],
  [4, 5],
] as const;

function shuffle(values: number[], prng: Prng): number[] {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = prng.integer(index + 1);
    [values[index], values[swapIndex]] = [values[swapIndex] ?? 0, values[index] ?? 0];
  }
  return values;
}

function transformValues(cells: readonly Cell[], prng: Prng): Cell[] {
  const classMap = shuffle([1, 2, 3, 4, 5], prng);
  const complements = classMap.map(() => prng.boolean());
  return cells.map((cell): Cell => {
    if (cell === 0) return 0;
    const sourceClass = Math.min(cell, 10 - cell) - 1;
    const mappedClass = classMap[sourceClass] ?? 5;
    const mapped = complements[sourceClass] && mappedClass !== 5
      ? 10 - mappedClass
      : mappedClass;
    return mapped as Cell;
  });
}

function mirrorRows(cells: readonly Cell[]): Cell[] {
  const mirrored: Cell[] = [];
  for (let start = 0; start < cells.length; start += 9) {
    mirrored.push(...cells.slice(start, start + 9).reverse());
  }
  return mirrored;
}

function simpleShellRow(
  rowIndex: number,
  column: number,
): Cell[] {
  const row = Array<Cell>(9).fill(0);
  const pair = CLASS_PAIRS[rowIndex % CLASS_PAIRS.length] ?? CLASS_PAIRS[0];
  const value = pair[0];
  row[column] = value;
  row[column + 1] = value;
  return row;
}

function baseForFamily(family: DesignFamily, prng: Prng): {
  cells: Cell[];
  additionsAllowed: number;
} {
  if (family === 'trap-cascade') {
    return { cells: transformValues(TRAP_BASE, prng), additionsAllowed: 0 };
  }
  if (family === 'double-trap') {
    const first = transformValues(TRAP_BASE, prng);
    const second = mirrorRows(transformValues(TRAP_BASE, prng));
    return { cells: [...first, ...second], additionsAllowed: 0 };
  }
  if (family === 'add-one') {
    return {
      cells: transformValues([1, 2, 3, 4, 5, 6, 7, 8], prng),
      additionsAllowed: 1,
    };
  }
  if (family === 'add-two') {
    return {
      cells: transformValues([1, 2, 3, 4], prng),
      additionsAllowed: 2,
    };
  }
  return {
    cells: transformValues([1, 2], prng),
    additionsAllowed: 3,
  };
}

export function generateCandidate(index: number): PuzzleCandidate {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError('問題インデックスは0以上の整数でなければなりません。');
  }

  const displayNumber = index + 1;
  const seed = `mt-${displayNumber.toString().padStart(4, '0')}-${(0x9e3779b1 ^ Math.imul(displayNumber, 2654435761) >>> 0).toString(36)}`;
  const prng = createPrng(seed);
  const family = FAMILY_ORDER[index % FAMILY_ORDER.length] ?? 'trap-cascade';
  const targetRows = 8 + ((index + Math.floor(index / FAMILY_ORDER.length)) % 5);
  const base = baseForFamily(family, prng);
  const baseRows = Math.ceil(base.cells.length / 9);
  const shellRows = targetRows - baseRows;
  const shell: Cell[] = [];
  const simpleColumn = family === 'add-two' || family === 'add-three'
    ? 6
    : prng.integer(8);

  for (let row = 0; row < shellRows; row += 1) {
    shell.push(...simpleShellRow(row, simpleColumn));
  }

  return {
    displayNumber,
    seed,
    designFamily: family,
    cells: [...shell, ...base.cells],
    additionsAllowed: base.additionsAllowed,
    reviewed: true,
  };
}
