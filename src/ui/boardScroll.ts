export interface ScrollViewport {
  scrollTop: number;
  readonly scrollHeight: number;
}

export type BoardScrollMode = 'PRESERVE' | 'TAIL';

export function applyBoardScroll(
  viewport: ScrollViewport,
  mode: BoardScrollMode,
  previousScrollTop: number,
): void {
  viewport.scrollTop = mode === 'TAIL' ? viewport.scrollHeight : previousScrollTop;
}

export function scrollBoardToLogicalEnd(viewport: ScrollViewport): void {
  applyBoardScroll(viewport, 'TAIL', viewport.scrollTop);
}
