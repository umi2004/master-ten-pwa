import { describe, expect, it } from 'vitest';

import {
  applyGameMove,
  createBoard,
  createGameState,
  type PairMove,
  undoLastMove,
} from '../../src/core';

const onlyPair: PairMove = {
  type: 'PAIR',
  first: { row: 0, column: 0 },
  second: { row: 0, column: 1 },
};

describe('ゲーム状態', () => {
  it('生存数字0で勝利する', () => {
    const state = createGameState(createBoard([5, 5]), 3);
    expect(applyGameMove(state, onlyPair).status).toBe('WON');
  });

  it('合法手0かつ追加残数0で敗北する', () => {
    expect(createGameState(createBoard([1, 2]), 0).status).toBe('LOST');
  });

  it('Undoで直前の盤面とカウンターを復元する', () => {
    const initial = createGameState(createBoard([5, 5]), 3);
    const won = applyGameMove(initial, onlyPair);
    const restored = undoLastMove(won);
    expect(restored.board.cells).toEqual([5, 5]);
    expect(restored.status).toBe('PLAYING');
    expect(restored.moveCount).toBe(0);
    expect(restored.undoCount).toBe(1);
    expect(restored.history).toHaveLength(0);
  });

  it('履歴がないUndoは同じ状態を返す', () => {
    const state = createGameState(createBoard([4, 4]), 3);
    expect(undoLastMove(state)).toBe(state);
  });

  it('同一入力と操作から決定論的に同じ結果を返す', () => {
    const first = createGameState(createBoard([4, 4]), 3);
    const second = createGameState(createBoard([4, 4]), 3);
    expect(applyGameMove(first, onlyPair)).toEqual(applyGameMove(second, onlyPair));
  });
});
