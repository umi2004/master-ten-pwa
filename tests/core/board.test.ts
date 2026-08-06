import { describe, expect, it } from 'vitest';

import {
  createBoard,
  InvalidBoardError,
  normalizeBoard,
  positionToIndex,
} from '../../src/core';

describe('盤面の生成と正規化', () => {
  it('セル配列を複製し、入力の後変更から分離する', () => {
    const source = [1, 2, 3];
    const board = createBoard(source);
    source[0] = 9;
    expect(board.cells).toEqual([1, 2, 3]);
  });

  it('不正なセル値と論理長を拒否する', () => {
    expect(() => createBoard([10])).toThrow(InvalidBoardError);
    expect(() => createBoard([1, 2], 1)).toThrow(InvalidBoardError);
  });

  it('完全空行を削除し、下の行を上へ移動する', () => {
    const board = createBoard([
      0, 0, 0, 0, 0, 0, 0, 0, 0,
      6, 4, 1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(normalizeBoard(board).cells).toEqual([6, 4, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('空になった部分最終行も削除する', () => {
    const board = createBoard([1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 0]);
    expect(normalizeBoard(board).logicalLength).toBe(9);
  });

  it('部分最終行の論理範囲外位置を拒否する', () => {
    const board = createBoard([1, 2]);
    expect(() => positionToIndex(board, { row: 0, column: 2 })).toThrow(InvalidBoardError);
  });
});
