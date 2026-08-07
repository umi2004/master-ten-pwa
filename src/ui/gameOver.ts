import { countAlive, type GameState } from '../core';

export interface GameOverCopy {
  readonly title: 'GAME OVER';
  readonly message: '手詰まりです';
  readonly residual: string;
}

export function getGameOverCopy(state: GameState): GameOverCopy | undefined {
  if (state.status !== 'LOST') return undefined;
  return {
    title: 'GAME OVER',
    message: '手詰まりです',
    residual: `残り数字：${countAlive(state.board)}個`,
  };
}
