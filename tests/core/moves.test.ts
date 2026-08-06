import { describe, expect, it } from 'vitest';

import {
  applyPairMove,
  createBoard,
  getLegalPairMoves,
  isPairMoveLegal,
  type PairMove,
} from '../../src/core';

function pair(first: number, second: number): PairMove {
  return {
    type: 'PAIR',
    first: { row: Math.floor(first / 9), column: first % 9 },
    second: { row: Math.floor(second / 9), column: second % 9 },
  };
}

function hasPair(cells: readonly number[], first: number, second: number): boolean {
  return isPairMoveLegal(createBoard(cells), pair(first, second));
}

describe('合法ペア', () => {
  it('同じ数字の隣接ペアを認める', () => {
    expect(hasPair([4, 4], 0, 1)).toBe(true);
  });

  it('合計10の隣接ペアを認める', () => {
    expect(hasPair([6, 4], 0, 1)).toBe(true);
  });

  it('5と5を1つのペアとして列挙する', () => {
    expect(getLegalPairMoves(createBoard([5, 5]))).toHaveLength(1);
  });

  it('数値条件が不一致なら認めない', () => {
    expect(hasPair([2, 3], 0, 1)).toBe(false);
  });

  it('空所越し水平接続を認める', () => {
    expect(hasPair([2, 0, 0, 8], 0, 3)).toBe(true);
  });

  it('空所越し垂直接続を認める', () => {
    const cells = Array<number>(28).fill(0);
    cells[0] = 1;
    cells[27] = 1;
    expect(hasPair(cells, 0, 27)).toBe(true);
  });

  it('空所越し斜め接続を認める', () => {
    const cells = Array<number>(21).fill(0);
    cells[0] = 3;
    cells[20] = 7;
    expect(hasPair(cells, 0, 20)).toBe(true);
  });

  it('途中の生存数字がその先を遮断する', () => {
    expect(hasPair([2, 5, 0, 8], 0, 3)).toBe(false);
  });

  it('各方向で最初の生存数字だけを候補にする', () => {
    const board = createBoard([2, 0, 8, 2]);
    expect(isPairMoveLegal(board, pair(0, 2))).toBe(true);
    expect(isPairMoveLegal(board, pair(0, 3))).toBe(false);
  });

  it('行末から次行頭のペアを認める', () => {
    const cells = Array<number>(10).fill(0);
    cells[8] = 6;
    cells[9] = 4;
    expect(hasPair(cells, 8, 9)).toBe(true);
  });

  it('行境界の前後に空所がある読み順接続を認める', () => {
    const cells = Array<number>(13).fill(0);
    cells[6] = 6;
    cells[12] = 4;
    expect(hasPair(cells, 6, 12)).toBe(true);
  });

  it('読み順の中間に生存数字があれば接続しない', () => {
    const cells = Array<number>(13).fill(0);
    cells[6] = 6;
    cells[9] = 5;
    cells[12] = 4;
    expect(hasPair(cells, 6, 12)).toBe(false);
  });

  it('直線と読み順で見つかる同じペアを重複列挙しない', () => {
    const cells = Array<number>(10).fill(0);
    cells[0] = 1;
    cells[9] = 1;
    expect(getLegalPairMoves(createBoard(cells))).toHaveLength(1);
  });

  it('ペア削除後に空行を除去して位置を更新する', () => {
    const cells = [
      4, 4, 0, 0, 0, 0, 0, 0, 0,
      6, 4, 1, 2, 3, 4, 5, 6, 7,
    ];
    const result = applyPairMove(createBoard(cells), pair(0, 1));
    expect(result.cells).toEqual([6, 4, 1, 2, 3, 4, 5, 6, 7]);
    expect(result.logicalLength).toBe(9);
  });

  it('元盤面を破壊しない', () => {
    const board = createBoard([4, 4]);
    const before = [...board.cells];
    applyPairMove(board, pair(0, 1));
    expect(board.cells).toEqual(before);
  });
});
