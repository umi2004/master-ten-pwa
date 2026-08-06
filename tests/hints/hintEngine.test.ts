import { describe, expect, it } from 'vitest';

import {
  applyGameMove,
  createBoard,
  createGameState,
  getLegalPairMoves,
  type GameMove,
} from '../../src/core';
import { HintEngine, requestHint } from '../../src/hints';
import {
  solveWithBfs,
  solveWithDfs,
  type SolverResult,
} from '../../src/solver';

const noTime = { now: () => 0, timeLimitMs: 10_000, nodeLimit: 100_000 } as const;
const trapFixture = [0, 7, 0, 7, 0, 1, 0, 0, 7, 0, 0, 7, 0, 8, 2, 0, 9, 0];

function key(move: GameMove): string {
  if (move.type === 'ADD_NUMBERS') return move.type;
  const first = move.first.row * 9 + move.first.column;
  const second = move.second.row * 9 + move.second.column;
  return [move.type, Math.min(first, second), Math.max(first, second)].join(':');
}

function unknownResult(): SolverResult {
  return {
    status: 'UNKNOWN',
    solution: [],
    nodesExpanded: 1,
    maxDepth: 0,
    elapsedMs: 1,
    terminationReason: 'time-limit',
    provenOptimal: false,
    minimumAdditionsProven: false,
  };
}

describe('安全ヒント', () => {
  it('検証済み完走経路上のペアを返す', () => {
    const state = createGameState(createBoard([5, 5]), 0);
    const hint = new HintEngine().getHint(state, noTime);
    expect(hint.status).toBe('SAFE_MOVE');
    if (hint.status === 'SAFE_MOVE') {
      expect(hint.move.type).toBe('PAIR');
      expect(applyGameMove(state, hint.move).status).toBe('WON');
    }
  });

  it('詰みへ進む合法手を返さない', () => {
    const state = createGameState(createBoard(trapFixture), 0);
    const trapMove = getLegalPairMoves(state.board)[1];
    expect(trapMove).toBeDefined();
    if (!trapMove) return;
    expect(solveWithBfs(applyGameMove(state, trapMove), noTime).status).toBe('UNSOLVABLE');

    const hint = new HintEngine().getHint(state, noTime);
    expect(hint.status).toBe('SAFE_MOVE');
    if (hint.status === 'SAFE_MOVE') {
      expect(key(hint.move)).not.toBe(key(trapMove));
      expect(solveWithBfs(applyGameMove(state, hint.move), noTime).status).toBe('SOLVED');
    }
  });

  it('解答経路が複数ある場合も安全な手を返す', () => {
    const state = createGameState(createBoard([1, 1, 2, 2]), 0);
    const hint = new HintEngine().getHint(state, noTime);
    expect(hint.status).toBe('SAFE_MOVE');
    if (hint.status === 'SAFE_MOVE') {
      expect(solveWithBfs(applyGameMove(state, hint.move), noTime).status).toBe('SOLVED');
    }
  });

  it('数字追加が安全な次手なら数字追加を返す', () => {
    const state = createGameState(createBoard([1, 2, 3, 4, 5, 6, 7, 8, 9]), 1);
    const hint = new HintEngine().getHint(state, { ...noTime, maxDepth: 20 });
    expect(hint.status).toBe('SAFE_MOVE');
    if (hint.status === 'SAFE_MOVE') {
      expect(hint.move.type).toBe('ADD_NUMBERS');
    }
  });

  it('UNKNOWN時に無保証の合法手を返さない', () => {
    const state = createGameState(createBoard([5, 5]), 0);
    const hint = new HintEngine(() => unknownResult()).getHint(state, noTime);
    expect(hint).toEqual({
      status: 'UNAVAILABLE',
      message: '現在この局面の安全なヒントを確認できません',
      source: 'none',
      solverStatus: 'UNKNOWN',
    });
  });

  it('同じ局面では検証済み解経路キャッシュを使う', () => {
    let calls = 0;
    const solver = (state: Parameters<typeof solveWithDfs>[0]): SolverResult => {
      calls += 1;
      return solveWithDfs(state, noTime);
    };
    const state = createGameState(createBoard([1, 1, 2, 2]), 0);
    const engine = new HintEngine(solver);
    expect(engine.getHint(state, noTime)).toMatchObject({ source: 'search' });
    expect(engine.getHint(state, noTime)).toMatchObject({ source: 'cache' });
    expect(calls).toBe(1);
  });

  it('解経路外の盤面では古い局面のヒントを使わず再探索する', () => {
    let calls = 0;
    const solver = (state: Parameters<typeof solveWithDfs>[0]): SolverResult => {
      calls += 1;
      return solveWithDfs(state, noTime);
    };
    const initial = createGameState(createBoard(trapFixture), 0);
    const engine = new HintEngine(solver);
    const firstHint = engine.getHint(initial, noTime);
    expect(firstHint.status).toBe('SAFE_MOVE');

    const alternative = getLegalPairMoves(initial.board).at(-1);
    expect(alternative).toBeDefined();
    if (!alternative) return;
    const changed = applyGameMove(initial, alternative);
    const changedHint = engine.getHint(changed, noTime);
    expect(changedHint.status).toBe('SAFE_MOVE');
    expect(changedHint).toMatchObject({ source: 'search' });
    expect(calls).toBe(2);
  });

  it('不正なSOLVED応答の手を安全手として返さない', () => {
    const invalidSolved: SolverResult = {
      status: 'SOLVED',
      solution: [],
      nodesExpanded: 1,
      maxDepth: 0,
      elapsedMs: 0,
      terminationReason: 'solved',
      provenOptimal: false,
      minimumAdditionsProven: false,
    };
    const state = createGameState(createBoard([5, 5]), 0);
    expect(new HintEngine(() => invalidSolved).getHint(state, noTime).status).toBe('UNAVAILABLE');
  });

  it('ヒント要求回数を状態へ記録し、元状態を破壊しない', () => {
    const state = createGameState(createBoard([5, 5]), 0);
    const requested = requestHint(state, new HintEngine(), noTime);
    expect(requested.state.hintCount).toBe(1);
    expect(state.hintCount).toBe(0);
  });
});
