import { createBoard, createGameState, getLegalPairMoves } from '../src/core';
import { simulateHumanStrategy } from '../src/generator/humanPlayers';
import type { HumanStrategyId } from '../src/puzzles/types';
import { solveWithDfs } from '../src/solver';

const core = [3, 5, 5, 4, 1, 5, 5, 2, 2, 4, 1, 3, 3, 2, 3, 4, 1, 5, 2];
const state = createGameState(createBoard(core), 5);
console.log(JSON.stringify({ alive: core.length, legalMoves: getLegalPairMoves(state.board).length }));

for (let additions = 0; additions <= 5; additions += 1) {
  const result = solveWithDfs(createGameState(createBoard(core), additions), {
    nodeLimit: 5_000_000,
    timeLimitMs: 30_000,
    maxDepth: 180,
  });
  console.log(JSON.stringify({
    additions,
    status: result.status,
    length: result.solution.length,
    used: result.solution.filter((move) => move.type === 'ADD_NUMBERS').length,
    nodes: result.nodesExpanded,
    elapsedMs: result.elapsedMs,
    reason: result.terminationReason,
  }));
}

for (const strategy of [
  'random', 'proximity', 'sum-ten', 'row-clear', 'reserve-add', 'early-add',
  'lookahead-2', 'lookahead-3', 'lookahead-4',
] as HumanStrategyId[]) {
  console.log(JSON.stringify(simulateHumanStrategy(state, 'master-v4-core', strategy, 64)));
}
