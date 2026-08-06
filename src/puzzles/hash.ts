import type { Board } from '../core';

export function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function hashBoard(board: Board): string {
  return fnv1a(`${board.width}|${board.logicalLength}|${board.cells.join(',')}`);
}

export function structureSignature(board: Board): string {
  const matchClasses = board.cells
    .map((cell) => cell === 0 ? 0 : Math.min(cell, 10 - cell))
    .join('');
  return fnv1a(`${board.width}|${board.logicalLength}|${matchClasses}`);
}
