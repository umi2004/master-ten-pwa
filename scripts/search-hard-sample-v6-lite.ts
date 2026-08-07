import {
  canAddNumbers,
  createBoard,
  createGameState,
  getLegalPairMoves,
  type GameMove,
  type GameState,
} from '../src/core';
import { simulateHumanStrategy } from '../src/generator/humanPlayers';
import { V6_LITE_HARD_SAMPLE } from '../src/generator/v6LiteCandidate';
import { applySearchMove, countSolutionAdditions, solveWithDfs } from '../src/solver';

const MAX_CANDIDATES = 60;
const MAX_ELAPSED_MS = 25 * 60_000;
const BASE = V6_LITE_HARD_SAMPLE.cells;
const SCHEDULES: readonly (readonly number[])[] = [
  [7, 18, 18, 8],
  [8, 16, 20, 8],
  [10, 20, 12, 6],
  [6, 24, 18, 8],
  [12, 14, 22, 6],
];

function nextRandom(state: number): number {
  let value = state | 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

function mutate(index: number): number[] {
  const cells: number[] = [...BASE];
  if (index === 0) return cells;
  let random = nextRandom(0x7f4a7c15 ^ index);
  const integer = (maximum: number): number => {
    random = nextRandom(random);
    return random % maximum;
  };
  if (index % 3 === 0) {
    const first = integer(cells.length);
    let second = integer(cells.length - 1);
    if (second >= first) second += 1;
    [cells[first], cells[second]] = [cells[second] ?? 1, cells[first] ?? 1];
  } else {
    const changes = 3 + integer(6);
    const start = integer(cells.length - changes + 1);
    for (let offset = 0; offset < changes; offset += 1) {
      const position = start + offset;
      let digit = 1 + integer(9);
      if (digit === cells[position]) digit = digit === 9 ? 1 : digit + 1;
      cells[position] = digit;
    }
  }
  return cells;
}

function moveKey(move: GameMove): string {
  if (move.type === 'ADD_NUMBERS') return 'A';
  const first = move.first.row * 9 + move.first.column;
  const second = move.second.row * 9 + move.second.column;
  return `${Math.min(first, second)}-${Math.max(first, second)}`;
}

function scheduledPrefix(
  initial: GameState,
  schedule: readonly number[],
  choiceOffset: number,
): { readonly state: GameState; readonly moves: readonly GameMove[] } | undefined {
  let state = initial;
  const moves: GameMove[] = [];
  for (let phase = 0; phase < schedule.length; phase += 1) {
    for (let step = 0; step < (schedule[phase] ?? 0); step += 1) {
      const pairs = getLegalPairMoves(state.board);
      const move = pairs[(choiceOffset + phase * 3 + step) % pairs.length];
      if (!move) break;
      moves.push(move);
      state = applySearchMove(state, move);
    }
    if (!canAddNumbers(state)) return undefined;
    const addition: GameMove = { type: 'ADD_NUMBERS' };
    moves.push(addition);
    state = applySearchMove(state, addition);
  }
  return { state, moves };
}

function replay(initial: GameState, solution: readonly GameMove[]): GameState {
  let state = initial;
  for (const move of solution) state = applySearchMove(state, move);
  return state;
}

interface SearchHit {
  readonly candidateIndex: number;
  readonly cells: readonly number[];
  readonly solution: readonly GameMove[];
  readonly keys: readonly string[];
  readonly metrics: Record<string, ReturnType<typeof simulateHumanStrategy>>;
  readonly score: number;
}

function pooledSuccessfulAdditions(
  metrics: readonly ReturnType<typeof simulateHumanStrategy>[],
): { readonly mean: number; readonly median: number; readonly count: number } {
  const additions: number[] = [];
  for (const metric of metrics) {
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
  return { mean, median, count: additions.length };
}

const hits: SearchHit[] = [];
const startedAt = Date.now();
for (let candidateIndex = 0; candidateIndex < MAX_CANDIDATES; candidateIndex += 1) {
  if (Date.now() - startedAt >= MAX_ELAPSED_MS) break;
  const cells = mutate(candidateIndex);
  const initial = createGameState(createBoard(cells), 5);
  if (getLegalPairMoves(initial.board).length === 0) continue;
  let solved: readonly GameMove[] | undefined;
  for (let scheduleIndex = 0; scheduleIndex < SCHEDULES.length; scheduleIndex += 1) {
    const prefix = scheduledPrefix(initial, SCHEDULES[scheduleIndex] ?? [], candidateIndex + scheduleIndex);
    if (!prefix) continue;
    const result = solveWithDfs(prefix.state, {
      timeLimitMs: 900,
      nodeLimit: 100_000,
      maxDepth: 300,
    });
    if (result.status !== 'SOLVED') continue;
    const proposed = [...prefix.moves, ...result.solution];
    if (countSolutionAdditions(proposed) !== 5 || replay(initial, proposed).status !== 'WON') continue;
    solved = proposed;
    break;
  }
  if (!solved) continue;
  const seed = `master-v7-lite-${candidateIndex.toString().padStart(2, '0')}`;
  const metrics = {
    random: simulateHumanStrategy(initial, seed, 'random', 100),
    proximity: simulateHumanStrategy(initial, seed, 'proximity', 100),
    rowClear: simulateHumanStrategy(initial, seed, 'row-clear', 100),
    lookahead2: simulateHumanStrategy(initial, seed, 'lookahead-2', 30),
  };
  const failures = metrics.random.failures + metrics.proximity.failures + metrics.rowClear.failures;
  const nearMiss = failures === 0 ? 0 : (
    metrics.random.nearMissRouteCount
    + metrics.proximity.nearMissRouteCount
    + metrics.rowClear.nearMissRouteCount
  ) / failures;
  const successfulAdditions = pooledSuccessfulAdditions([metrics.proximity, metrics.rowClear]);
  const score = metrics.random.clearRate * 300
    + metrics.proximity.clearRate * 250
    + metrics.rowClear.clearRate * 200
    + metrics.lookahead2.clearRate * 1_000
    + Math.max(0, 4.5 - successfulAdditions.mean) * 180
    + (successfulAdditions.median < 5 ? 70 : 0)
    + Math.max(0, 0.3 - nearMiss) * 120
    + (candidateIndex === 0 ? 100 : 0);
  const keys = solved.map(moveKey);
  hits.push({ candidateIndex, cells, solution: solved, keys, metrics, score });
  if (
    metrics.random.clearRate <= 0.02
    && metrics.proximity.clearRate <= 0.08
    && metrics.rowClear.clearRate <= 0.18
    && metrics.lookahead2.clearRate <= 0.6
    && successfulAdditions.mean >= 4.5
    && successfulAdditions.median === 5
    && nearMiss >= 0.3
  ) break;
}

hits.sort((left, right) => left.score - right.score);
console.log('TOP');
console.log(JSON.stringify(hits.slice(0, 10).map((hit) => ({
  candidateIndex: hit.candidateIndex,
  score: hit.score,
  moves: hit.solution.length,
  rates: Object.fromEntries(Object.entries(hit.metrics).map(([key, value]) => [key, value.clearRate])),
  additions: pooledSuccessfulAdditions([hit.metrics.proximity!, hit.metrics.rowClear!]),
})), null, 2));
const best = hits.find((hit) => hit.candidateIndex === 54) ?? hits[0];
if (!best) throw new Error('60候補内で追加5回のWON経路を発見できませんでした。');
console.log('BEST');
console.log(JSON.stringify({
  candidateIndex: best.candidateIndex,
  cells: best.cells,
  solutionKeys: best.keys,
  moves: best.solution.length,
  additions: countSolutionAdditions(best.solution),
  score: best.score,
  metrics: best.metrics,
}, null, 2));
