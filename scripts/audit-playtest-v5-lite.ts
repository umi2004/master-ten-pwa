import { createGameState, type GameMove, type GameState } from '../src/core';
import { PUZZLES } from '../src/puzzles';
import { applySearchMove, solveWithDfs } from '../src/solver';

const puzzle = PUZZLES[0];
if (!puzzle) throw new Error('V5-Lite候補がありません。');

function encode(move: GameMove): string {
  if (move.type === 'ADD_NUMBERS') return 'A';
  const first = move.first.row * 9 + move.first.column;
  const second = move.second.row * 9 + move.second.column;
  return `${Math.min(first, second)}-${Math.max(first, second)}`;
}

for (const cap of [0, 1, 2, 3, 4]) {
  const result = solveWithDfs(createGameState(puzzle.initialBoard, cap), {
    timeLimitMs: 10_000,
    nodeLimit: 500_000,
    maxDepth: 300,
  });
  console.log(JSON.stringify({
    cap,
    status: result.status,
    nodes: result.nodesExpanded,
    elapsedMs: result.elapsedMs,
    reason: result.terminationReason,
    solutionLength: result.solution.length,
    solutionKeys: result.status === 'SOLVED'
      ? result.solution.reduce<{ readonly state: GameState; readonly keys: string[] }>((entry, move) => ({
          state: applySearchMove(entry.state, move),
          keys: [...entry.keys, encode(move)],
        }), { state: createGameState(puzzle.initialBoard, cap), keys: [] }).keys
      : [],
  }));
}

console.log(JSON.stringify({
  recommendedMoves: puzzle.recommendedHumanSolution.length,
  minimumAdditions: puzzle.minimumAdditions,
  minimumAdditionsProven: puzzle.minimumAdditionsProven,
  maximumRows: puzzle.maximumRowsDuringSolution,
  metrics: puzzle.humanStrategyMetrics.map((metric) => ({
    strategy: metric.strategy,
    trials: metric.trials,
    clearRate: metric.clearRate,
    nearMissRate: metric.nearMissRate,
    nearMissRoutes: metric.nearMissRouteCount,
    meanResidual: metric.meanResidualAliveOnFailure,
    medianResidual: metric.medianResidualAliveOnFailure,
  })),
}));
