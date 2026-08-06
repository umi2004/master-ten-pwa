import { describe, expect, it } from 'vitest';

import {
  appendAliveNumbers,
  applyGameMove,
  canAddNumbers,
  createBoard,
  createGameState,
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

  it('合法手がある場合は追加できない', () => {
    const state = createGameState(createBoard([4, 4]), 3);
    expect(canAddNumbers(state)).toBe(false);
    expect(() => applyGameMove(state, { type: 'ADD_NUMBERS' })).toThrow(InvalidMoveError);
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

  it('元状態と元盤面を破壊しない', () => {
    const state = createGameState(createBoard([1, 2]), 3);
    applyGameMove(state, { type: 'ADD_NUMBERS' });
    expect(state.board.cells).toEqual([1, 2]);
    expect(state.additionsRemaining).toBe(3);
    expect(state.history).toEqual([]);
  });
});
