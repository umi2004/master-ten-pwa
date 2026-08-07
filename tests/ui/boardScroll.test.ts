import { describe, expect, it } from 'vitest';

import { applyBoardScroll, scrollBoardToLogicalEnd } from '../../src/ui/boardScroll';

describe('追加後の盤面スクロール', () => {
  it('ページ位置に触れず盤面viewportだけを末尾へ動かす', () => {
    const page = { scrollTop: 120 };
    const viewport = { scrollTop: 0, scrollHeight: 884 };
    scrollBoardToLogicalEnd(viewport);
    expect(viewport.scrollTop).toBe(884);
    expect(page.scrollTop).toBe(120);
  });
});

describe('通常renderの盤面スクロール維持', () => {
  it.each([
    '数字を1つ選択',
    '下部の合法ペアを削除',
    '不正な2数字を選択',
    '選択を解除',
    'ヒントを表示',
    '11行超の盤面で再選択',
  ])('%sではscrollTopを維持する', () => {
    const viewport = { scrollTop: 0, scrollHeight: 1_800 };
    applyBoardScroll(viewport, 'PRESERVE', 734);
    expect(viewport.scrollTop).toBe(734);
  });

  it('数字追加だけは論理末尾へ移動する', () => {
    const viewport = { scrollTop: 734, scrollHeight: 1_800 };
    applyBoardScroll(viewport, 'TAIL', 734);
    expect(viewport.scrollTop).toBe(1_800);
  });
});
