import { describe, expect, it } from 'vitest';

import {
  applyGameMove,
  createBoard,
  createGameState,
  type GameMove,
  type GameState,
} from '../../src/core';
import {
  createStateKey,
  solveWithBfs,
  solveWithDfs,
} from '../../src/solver';

const noTime = { now: () => 0, timeLimitMs: 10_000 } as const;

function applySolution(
  initialState: GameState,
  solution: readonly GameMove[],
): GameState {
  return solution.reduce((state, move) => applyGameMove(state, move), initialState);
}

describe.each([
  ['BFS', solveWithBfs],
  ['DFS', solveWithDfs],
] as const)('%sソルバー', (_name, solve) => {
  it('既知の単純可解盤面を解く', () => {
    const state = createGameState(createBoard([5, 5]), 0);
    const result = solve(state, noTime);
    expect(result.status).toBe('SOLVED');
    expect(result.solution).toHaveLength(1);
    expect(result.terminationReason).toBe('solved');
  });

  it('既知の不可能盤面をUNSOLVABLEと証明する', () => {
    const state = createGameState(createBoard([1, 2]), 0);
    const result = solve(state, noTime);
    expect(result.status).toBe('UNSOLVABLE');
    expect(result.terminationReason).toBe('exhausted');
  });

  it('追加なしで解ける盤面の最小追加0を証明する', () => {
    const state = createGameState(createBoard([4, 4]), 3);
    const result = solve(state, noTime);
    expect(result.status).toBe('SOLVED');
    expect(result.minimumAdditionsProven).toBe(true);
    expect(result.solution.some((move) => move.type === 'ADD_NUMBERS')).toBe(false);
  });

  it('追加1回が必要な盤面を解く', () => {
    const state = createGameState(createBoard([1, 2, 3, 4, 5, 6, 7, 8, 9]), 1);
    const result = solve(state, { ...noTime, nodeLimit: 100_000, maxDepth: 20 });
    expect(result.status).toBe('SOLVED');
    expect(result.solution.filter((move) => move.type === 'ADD_NUMBERS')).toHaveLength(1);
  });

  it('追加残数不足の盤面をUNSOLVABLEとする', () => {
    const state = createGameState(createBoard([1, 2, 3, 4, 5, 6, 7, 8, 9]), 0);
    expect(solve(state, noTime).status).toBe('UNSOLVABLE');
  });

  it('同じ問題を複数回解いて同じ結果を返す', () => {
    const state = createGameState(createBoard([1, 1, 2, 2]), 0);
    const first = solve(state, noTime);
    const second = solve(state, noTime);
    expect(first).toEqual(second);
  });

  it('ノード上限でUNKNOWNを返す', () => {
    const state = createGameState(createBoard([4, 4]), 0);
    const result = solve(state, { ...noTime, nodeLimit: 0 });
    expect(result.status).toBe('UNKNOWN');
    expect(result.terminationReason).toBe('node-limit');
  });

  it('時間上限でUNKNOWNを返す', () => {
    let time = 0;
    const state = createGameState(createBoard([4, 4]), 0);
    const result = solve(state, { now: () => time++, timeLimitMs: 1 });
    expect(result.status).toBe('UNKNOWN');
    expect(result.terminationReason).toBe('time-limit');
  });

  it('深度上限でUNKNOWNを返す', () => {
    const state = createGameState(createBoard([4, 4]), 0);
    const result = solve(state, { ...noTime, maxDepth: 0 });
    expect(result.status).toBe('UNKNOWN');
    expect(result.terminationReason).toBe('depth-limit');
  });

  it('解答手順の再適用で勝利する', () => {
    const state = createGameState(createBoard([1, 1, 2, 2]), 0);
    const result = solve(state, noTime);
    expect(result.status).toBe('SOLVED');
    expect(applySolution(state, result.solution).status).toBe('WON');
  });
});

describe('基準BFSと実用DFSの整合', () => {
  it.each([
    [[5, 5], 0],
    [[1, 2], 0],
    [[1, 1, 2, 2], 0],
    [[1, 2, 3, 4, 5, 6, 7, 8, 9], 1],
  ] as const)('小盤面 %j で可解性が一致する', (cells, additions) => {
    const state = createGameState(createBoard(cells), additions);
    const bfs = solveWithBfs(state, { ...noTime, maxDepth: 20 });
    const dfs = solveWithDfs(state, { ...noTime, maxDepth: 20 });
    expect(dfs.status).toBe(bfs.status);
  });

  it('BFSは単純盤面の最短性を証明する', () => {
    const state = createGameState(createBoard([1, 1, 2, 2]), 0);
    const result = solveWithBfs(state, noTime);
    expect(result.status).toBe('SOLVED');
    expect(result.provenOptimal).toBe(true);
    expect(result.solution).toHaveLength(2);
  });
});

describe('状態キー', () => {
  it('盤面、論理長、追加残数、ルール版を含む', () => {
    const oneAddition = createGameState(createBoard([1, 2]), 1);
    const twoAdditions = createGameState(createBoard([1, 2]), 2);
    expect(createStateKey(oneAddition)).not.toBe(createStateKey(twoAdditions));
    expect(createStateKey(oneAddition)).toContain(oneAddition.ruleVersion);
    expect(createStateKey(oneAddition)).toContain(`|${oneAddition.board.logicalLength}|`);
    expect(createStateKey(oneAddition)).toContain(oneAddition.board.cells.join(','));
  });
});
