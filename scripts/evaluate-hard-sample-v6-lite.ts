import { createBoard, createGameState, type GameMove } from '../src/core';
import { simulateHumanStrategy } from '../src/generator/humanPlayers';
import { generateCandidate } from '../src/generator/templates';
import { applySearchMove, solveWithDfs } from '../src/solver';

function moveKey(move: GameMove): string {
  if (move.type === 'ADD_NUMBERS') return 'A';
  const first = move.first.row * 9 + move.first.column;
  const second = move.second.row * 9 + move.second.column;
  return `${Math.min(first, second)}-${Math.max(first, second)}`;
}

const candidate = generateCandidate(0);
const initial = createGameState(createBoard(candidate.cells), 5);
let replay = initial;
for (const move of candidate.recommendedHumanSolution) replay = applySearchMove(replay, move);

const capResults = [];
for (let cap = 0; cap <= 3; cap += 1) {
  const result = solveWithDfs(createGameState(createBoard(candidate.cells), cap), {
    timeLimitMs: 5_000,
    nodeLimit: 500_000,
    maxDepth: 300,
  });
  capResults.push({
    cap,
    status: result.status,
    nodesExpanded: result.nodesExpanded,
    elapsedMs: result.elapsedMs,
    terminationReason: result.terminationReason,
    solutionKeys: result.status === 'SOLVED' ? result.solution.map(moveKey) : [],
  });
  if (result.status === 'SOLVED') break;
}

const plan = {
  random: 300,
  proximity: 200,
  'row-clear': 200,
  'reserve-add': 200,
  'early-add': 200,
  'lookahead-2': 100,
} as const;
const metrics = Object.entries(plan).map(([strategy, trials]) => simulateHumanStrategy(
  initial,
  candidate.seed,
  strategy as keyof typeof plan,
  trials,
));
const simple = metrics.filter((metric) => [
  'proximity', 'row-clear', 'reserve-add', 'early-add',
].includes(metric.strategy));
const additions: number[] = [];
for (const metric of simple) {
  for (const [value, count] of Object.entries(metric.successfulAdditionsDistribution)) {
    additions.push(...Array.from({ length: count }, () => Number(value)));
  }
}
additions.sort((a, b) => a - b);
const mean = additions.length === 0
  ? 0
  : additions.reduce((sum, value) => sum + value, 0) / additions.length;
const median = additions.length === 0
  ? 0
  : additions.length % 2 === 1
    ? additions[Math.floor(additions.length / 2)] ?? 0
    : ((additions[additions.length / 2 - 1] ?? 0) + (additions[additions.length / 2] ?? 0)) / 2;
const totalFailures = metrics.reduce((sum, metric) => sum + metric.failures, 0);
const totalNearMisses = metrics.reduce((sum, metric) => sum + metric.nearMissRouteCount, 0);

console.log(JSON.stringify({
  seed: candidate.seed,
  replayStatus: replay.status,
  recommendedMoves: candidate.recommendedHumanSolution.length,
  recommendedAdditions: replay.additionsUsed,
  capResults,
  metrics,
  pooledSimpleSuccessfulAdditions: { trials: additions.length, mean, median },
  nearMissAmongFailures: totalFailures === 0 ? 0 : totalNearMisses / totalFailures,
}, null, 2));
