import { describe, expect, it } from 'vitest';

import {
  appendAliveNumbers,
  applyGameMove,
  canAddNumbers,
  createBoard,
  createGameState,
  getAdditionStartIndex,
  InvalidMoveError,
} from '../../src/core';

describe('数字追加', () => {
  it('生存数字だけを読み順で複製する', () => {
    const result = appendAliveNumbers(createBoard([1, 0, 9, 0, 2]));
    expect(result.cells).toEqual([1, 0, 9, 0, 2, 1, 9, 2]);
  });

  it('部分最終行の論理末尾から追加し、過去の穴を埋めない', () => {
    const result = appendAliveNumbers(createBoard([1, 0, 2]));
    expect(result.cells).toEqual([1, 0, 2, 1, 2]);
    expect(result.logicalLength).toBe(5);
  });

  it('42セルでは最初の追加位置を5行目7列目にする', () => {
    const board = createBoard(Array.from({ length: 42 }, (_, index) => (index % 9) + 1));
    const result = appendAliveNumbers(board);
    expect(getAdditionStartIndex(board)).toBe(42);
    expect(result.cells[42]).toBe(board.cells[0]);
    expect({ row: Math.floor(42 / 9), column: 42 % 9 }).toEqual({ row: 4, column: 6 });
  });

  it('論理長44の部分行でも改行せずindex 44から追加する', () => {
    const board = createBoard(Array.from({ length: 44 }, (_, index) => (index % 9) + 1));
    const result = appendAliveNumbers(board);
    expect(getAdditionStartIndex(board)).toBe(44);
    expect(result.cells[44]).toBe(board.cells[0]);
    expect({ row: Math.floor(44 / 9), column: 44 % 9 }).toEqual({ row: 4, column: 8 });
  });

  it('途中の削除穴を維持して最後の生存数字の直後へ追加する', () => {
    const board = createBoard([1, 2, 0, 4, 5, 0, 7, 8, 9]);
    const result = appendAliveNumbers(board);
    expect(result.cells.slice(0, 9)).toEqual(board.cells);
    expect(result.cells.slice(9)).toEqual([1, 2, 4, 5, 7, 8, 9]);
  });

  it('末尾の削除穴だけを取り除いて最後の生存数字の直後へ追加する', () => {
    const board = createBoard([1, 2, 3, 0, 0]);
    const result = appendAliveNumbers(board);
    expect(getAdditionStartIndex(board)).toBe(3);
    expect(result.cells).toEqual([1, 2, 3, 1, 2, 3]);
  });

  it('部分最終行のtrailing zeroを取り除き内部穴は維持する', () => {
    const board = createBoard([0, 2, 0, 0, 4, 0, 0, 0, 0]);
    const result = appendAliveNumbers(board);
    expect(getAdditionStartIndex(board)).toBe(5);
    expect(result.cells).toEqual([0, 2, 0, 0, 4, 2, 4]);
  });

  it('trailing zeroを除いた実際の追加結果で高さ上限を判定する', () => {
    const board = createBoard([
      ...Array.from({ length: 214 }, () => 1),
      ...Array.from({ length: 218 }, () => 0),
    ]);
    const state = createGameState(board, 1);
    expect(canAddNumbers(state)).toBe(true);
    expect(appendAliveNumbers(state.board).logicalLength).toBe(428);
  });

  it('すべて0の盤面には追加できない', () => {
    const board = createBoard([0, 0, 0]);
    const state = createGameState(board, 1);
    expect(getAdditionStartIndex(board)).toBe(0);
    expect(canAddNumbers(state)).toBe(false);
    expect(() => appendAliveNumbers(board)).toThrow(InvalidMoveError);
  });

  it('合法手がある場合も任意に追加できる', () => {
    const state = createGameState(createBoard([4, 4]), 3);
    expect(canAddNumbers(state)).toBe(true);
    expect(applyGameMove(state, { type: 'ADD_NUMBERS' }).additionsUsed).toBe(1);
  });

  it('合法手が0なら追加できる', () => {
    const state = createGameState(createBoard([1, 2]), 3);
    expect(canAddNumbers(state)).toBe(true);
  });

  it('追加残数を減らし、使用数と手数を増やす', () => {
    const state = createGameState(createBoard([1, 2]), 3);
    const next = applyGameMove(state, { type: 'ADD_NUMBERS' });
    expect(next.additionsRemaining).toBe(2);
    expect(next.additionsUsed).toBe(1);
    expect(next.moveCount).toBe(1);
  });

  it('追加残数0では追加できない', () => {
    const state = createGameState(createBoard([4, 4]), 0);
    expect(canAddNumbers(state)).toBe(false);
    expect(() => applyGameMove(state, { type: 'ADD_NUMBERS' })).toThrow(InvalidMoveError);
  });

  it('元状態と元盤面を破壊しない', () => {
    const state = createGameState(createBoard([1, 2]), 3);
    applyGameMove(state, { type: 'ADD_NUMBERS' });
    expect(state.board.cells).toEqual([1, 2]);
    expect(state.additionsRemaining).toBe(3);
    expect(state.history).toEqual([]);
  });
  it('processes the fifth addition and reaches zero remaining additions', () => {
    let state = createGameState(createBoard([1, 2]), 5);
    for (let count = 0; count < 5; count += 1) {
      state = applyGameMove(state, { type: 'ADD_NUMBERS' });
    }
    expect(state.additionsRemaining).toBe(0);
    expect(state.additionsUsed).toBe(5);
  });
});
