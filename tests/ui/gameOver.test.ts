import { describe, expect, it } from 'vitest';

import { createBoard, createGameState } from '../../src/core';
import { getGameOverCopy } from '../../src/ui/gameOver';

describe('ゲームオーバー表示', () => {
  it('敗北時にタイトル・説明・残り数字を表示する', () => {
    const copy = getGameOverCopy(createGameState(createBoard([1, 2]), 0));
    expect(copy).toEqual({
      title: 'GAME OVER',
      message: '手詰まりです',
      residual: '残り数字：2個',
    });
  });

  it('プレイ中は表示しない', () => {
    expect(getGameOverCopy(createGameState(createBoard([1, 2]), 1))).toBeUndefined();
  });
});
