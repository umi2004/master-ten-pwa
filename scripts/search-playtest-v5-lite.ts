import {
  applyGameMove,
  canAddNumbers,
  countAlive,
  createBoard,
  createGameState,
  getLegalPairMoves,
  type GameMove,
  type GameState,
} from '../src/core';
import { simulateHumanStrategy } from '../src/generator/humanPlayers';
import { applySearchMove, countSolutionAdditions, solveWithDfs } from '../src/solver';

const BASE: readonly number[] = [
  9, 2, 7, 4, 5, 1, 8, 3, 6, 4, 5, 1, 8, 3, 6, 5, 9, 2,
  9, 2, 7, 4, 5, 1, 8, 3, 6, 4, 5, 1, 8, 3, 6, 5, 9, 2,
  8, 3, 6, 5, 9, 2,
];

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
  const cells = [...BASE];
  if (index === 0) return cells;
  let random = nextRandom(0x51f15e ^ index);
  const integer = (maximum: number): number => {
    random = nextRandom(random);
    return random % maximum;
  };
  if (index % 2 === 1) {
    const first = integer(cells.length);
    let second = integer(cells.length - 1);
    if (second >= first) second += 1;
    [cells[first], cells[second]] = [cells[second] ?? 1, cells[first] ?? 1];
  } else {
    const changes = 3 + integer(4);
    for (let change = 0; change < changes; change += 1) {
      const position = integer(cells.length);
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
    const pairCount = schedule[phase] ?? 0;
    for (let step = 0; step < pairCount; step += 1) {
      const pairs = getLegalPairMoves(state.board);
      if (pairs.length === 0) break;
      const move = pairs[(choiceOffset + phase * 3 + step) % pairs.length];
      if (!move) break;
      moves.push(move);
      state = applySearchMove(state, move);
    }
    if (!canAddNumbers(state)) return undefined;
    const addition: GameMove = { type: 'ADD_NUMBERS' };
    moves.push(addition);
    state = applyGameMove({ ...state, history: [] }, addition);
  }
  return { state, moves };
}

function replay(initial: GameState, solution: readonly GameMove[]): GameState {
  let state = initial;
  for (const move of solution) state = applyGameMove({ ...state, history: [] }, move);
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

const hits: SearchHit[] = [];
const startedAt = Date.now();
for (let candidateIndex = 0; candidateIndex < 100; candidateIndex += 1) {
  if (Date.now() - startedAt >= 30 * 60_000) break;
  const cells = mutate(candidateIndex);
  const initial = createGameState(createBoard(cells), 5);
  if (getLegalPairMoves(initial.board).length === 0) continue;
  let solved: readonly GameMove[] | undefined;
  for (let scheduleIndex = 0; scheduleIndex < SCHEDULES.length; scheduleIndex += 1) {
    const prefix = scheduledPrefix(initial, SCHEDULES[scheduleIndex] ?? [], candidateIndex + scheduleIndex);
    if (!prefix) continue;
    const result = solveWithDfs(prefix.state, {
      timeLimitMs: 1_900,
      nodeLimit: 180_000,
      maxDepth: 300,
    });
    if (result.status !== 'SOLVED') continue;
    const proposed = [...prefix.moves, ...result.solution];
    const additions = countSolutionAdditions(proposed);
    if (additions < 4 || additions > 5 || replay(initial, proposed).status !== 'WON') continue;
    solved = proposed;
    break;
  }
  if (!solved) continue;
  const seed = `master-v5-lite-${candidateIndex.toString().padStart(2, '0')}`;
  const metrics = {
    random: simulateHumanStrategy(initial, seed, 'random', 200),
    proximity: simulateHumanStrategy(initial, seed, 'proximity', 100),
    rowClear: simulateHumanStrategy(initial, seed, 'row-clear', 100),
    lookahead2: simulateHumanStrategy(initial, seed, 'lookahead-2', 30),
  };
  const score = metrics.random.clearRate * 100
    + metrics.proximity.clearRate * 35
    + metrics.rowClear.clearRate * 25
    + metrics.lookahead2.clearRate * 15
    - (metrics.random.nearMissRate + metrics.proximity.nearMissRate + metrics.rowClear.nearMissRate) * 3;
  const keys: string[] = [];
  let state = initial;
  for (const move of solved) {
    keys.push(moveKey(move));
    state = applySearchMove(state, move);
  }
  hits.push({ candidateIndex, cells, solution: solved, keys, metrics, score });
  console.log(JSON.stringify({
    candidateIndex,
    alive: countAlive(initial.board),
    legalPairs: getLegalPairMoves(initial.board).length,
    moves: solved.length,
    additions: countSolutionAdditions(solved),
    score,
    rates: Object.fromEntries(Object.entries(metrics).map(([key, value]) => [key, value.clearRate])),
  }));
  if (
    metrics.random.clearRate <= 0.01
    && metrics.proximity.clearRate <= 0.1
    && metrics.rowClear.clearRate <= 0.2
    && metrics.lookahead2.clearRate <= 0.5
  ) break;
}

hits.sort((left, right) => left.score - right.score);
const best = hits[0];
if (!best) throw new Error('100候補内で追加4～5回のWON経路を発見できませんでした。');
console.log('BEST');
console.log(JSON.stringify({
  candidateIndex: best.candidateIndex,
  cells: best.cells,
  solutionKeys: best.keys,
  moves: best.solution.length,
  additions: countSolutionAdditions(best.solution),
  metrics: best.metrics,
}, null, 2));
