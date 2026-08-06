import { performance } from 'node:perf_hooks';

import {
  applyGameMove,
  createBoard,
  createGameState,
  getLegalPairMoves,
  type GameMove,
  type GameState,
} from '../src/core';
import { createPrng, simulateHumanStrategy } from '../src/generator';
import { HintEngine } from '../src/hints';
import type { HumanStrategyId } from '../src/puzzles/types';
import { solveWithDfs } from '../src/solver';

const iterations = Number(
  process.argv.find((argument) => argument.startsWith('--iterations='))?.split('=')[1] ?? 60,
);
const startIteration = Number(
  process.argv.find((argument) => argument.startsWith('--start='))?.split('=')[1] ?? 0,
);
const requestedAlive = Number(
  process.argv.find((argument) => argument.startsWith('--alive='))?.split('=')[1] ?? 54,
);
if (![54, 63, 72].includes(requestedAlive)) throw new RangeError('--alive must be 54, 63, or 72');

const classDigits = [[1, 9], [2, 8], [3, 7], [4, 6], [5]] as const;
const screeningTrials: Readonly<Record<HumanStrategyId, number>> = {
  random: 128,
  proximity: 64,
  'same-value': 64,
  'sum-ten': 64,
  'row-clear': 64,
  'reserve-add': 64,
  'early-add': 64,
  'lookahead-2': 24,
  'lookahead-3': 0,
  'lookahead-4': 0,
};
const screeningStrategies = (Object.keys(screeningTrials) as HumanStrategyId[])
  .filter((strategy) => screeningTrials[strategy] > 0);

function moveKey(move: GameMove): string {
  if (move.type === 'ADD_NUMBERS') return 'A';
  const first = move.first.row * 9 + move.first.column;
  const second = move.second.row * 9 + move.second.column;
  return `${Math.min(first, second)}-${Math.max(first, second)}`;
}

function replay(initialState: GameState, solution: readonly GameMove[]): boolean {
  try {
    let state = initialState;
    for (const move of solution) state = applyGameMove(state, move);
    return state.status === 'WON';
  } catch {
    return false;
  }
}

function createConstrainedCells(seed: string, alive: number): readonly number[] {
  const prng = createPrng(seed);
  const coefficients = [[1, 3], [2, 1], [3, 4], [4, 2]] as const;
  const [rowCoefficient, columnCoefficient] = coefficients[prng.integer(coefficients.length)] ?? [1, 3];
  const offset = prng.integer(5);
  const classes = Array.from({ length: alive }, (_, index) => {
    const row = Math.floor(index / 9);
    const column = index % 9;
    return (row * rowCoefficient + column * columnCoefficient + offset) % 5;
  });

  // Plant a small number of competing visible pairs, then break periodicity in
  // positions away from those endpoints. The solver, not this construction,
  // decides whether the resulting board is actually solvable.
  const plantedPairs = 2 + prng.integer(5);
  const protectedIndexes = new Set<number>();
  for (let pair = 0; pair < plantedPairs; pair += 1) {
    const first = prng.integer(alive - 1);
    const candidates = [first + 1, first + 9, first + 10]
      .filter((index) => index < alive && Math.abs((index % 9) - (first % 9)) <= 1);
    const second = candidates[prng.integer(candidates.length)];
    if (second === undefined) continue;
    classes[second] = classes[first] ?? 0;
    protectedIndexes.add(first);
    protectedIndexes.add(second);
  }
  const perturbations = 6 + prng.integer(Math.max(2, Math.floor(alive / 8)));
  for (let mutation = 0; mutation < perturbations; mutation += 1) {
    const index = prng.integer(alive);
    if (protectedIndexes.has(index)) continue;
    classes[index] = prng.integer(5);
  }

  return classes.map((matchClass) => {
    const digits = classDigits[matchClass ?? 0] ?? classDigits[0];
    return digits[prng.integer(digits.length)] ?? digits[0];
  });
}

function auditMinimumAdditions(cells: readonly number[]): {
  readonly minimum: number | null;
  readonly statuses: readonly string[];
} {
  const statuses: string[] = [];
  for (let additions = 0; additions <= 5; additions += 1) {
    const result = solveWithDfs(createGameState(createBoard(cells), additions), {
      nodeLimit: 300_000,
      timeLimitMs: 1_500,
      maxDepth: 180,
    });
    statuses.push(result.status);
    if (result.status === 'SOLVED') return { minimum: additions, statuses };
    if (result.status === 'UNKNOWN') return { minimum: null, statuses };
  }
  return { minimum: null, statuses };
}

interface ScreenedCandidate {
  readonly seed: string;
  readonly cells: readonly number[];
  readonly initialMoves: number;
  readonly solution: readonly GameMove[];
  readonly additions: number;
  readonly minimumAdditions: number | null;
  readonly minimumStatuses: readonly string[];
  readonly replayed: boolean;
  readonly hintsVerified: boolean;
  readonly rates: Readonly<Record<string, number>>;
  readonly score: number;
}

const startedAt = performance.now();
const solved: ScreenedCandidate[] = [];
const statusCounts = { SOLVED: 0, UNSOLVABLE: 0, UNKNOWN: 0 };
for (let offset = 0; offset < iterations; offset += 1) {
  const iteration = startIteration + offset;
  const seed = `master-v3-constrained-${requestedAlive}-${iteration.toString().padStart(4, '0')}`;
  const cells = createConstrainedCells(seed, requestedAlive);
  const initialState = createGameState(createBoard(cells), 5);
  const initialMoves = getLegalPairMoves(initialState.board).length;
  if (initialMoves < 2 || initialMoves > 24) continue;
  const result = solveWithDfs(initialState, {
    nodeLimit: 750_000,
    timeLimitMs: 4_000,
    maxDepth: 200,
  });
  statusCounts[result.status] += 1;
  if (result.status !== 'SOLVED') continue;

  const replayed = replay(initialState, result.solution);
  const hintsVerified = replayed && new HintEngine().prime(initialState, result.solution);
  if (!replayed || !hintsVerified) continue;
  const human = screeningStrategies.map((strategy) => simulateHumanStrategy(
    initialState,
    seed,
    strategy,
    screeningTrials[strategy],
  ));
  const rates = Object.fromEntries(human.map((metric) => [metric.strategy, metric.clearRate]));
  const minimum = auditMinimumAdditions(cells);
  const additions = result.solution.filter((move) => move.type === 'ADD_NUMBERS').length;
  const simpleMaximum = Math.max(
    rates.proximity ?? 1,
    rates['sum-ten'] ?? 1,
    rates['row-clear'] ?? 1,
  );
  const score =
    (rates.random ?? 1) * 100 +
    simpleMaximum * 80 +
    (rates['lookahead-2'] ?? 1) * 60 +
    Math.max(0, 35 - result.solution.length) * 2 +
    initialMoves * 0.25;
  const candidate: ScreenedCandidate = {
    seed,
    cells,
    initialMoves,
    solution: result.solution,
    additions,
    minimumAdditions: minimum.minimum,
    minimumStatuses: minimum.statuses,
    replayed,
    hintsVerified,
    rates,
    score,
  };
  solved.push(candidate);
  console.log(`SOLVED ${JSON.stringify({
    iteration,
    initialMoves,
    length: result.solution.length,
    additions,
    minimumAdditions: minimum.minimum,
    rates,
    score,
  })}`);
}

const best = solved.sort((first, second) => first.score - second.score).slice(0, 5);
console.log(`SEARCH_SUMMARY ${JSON.stringify({
  alive: requestedAlive,
  iterations,
  startIteration,
  elapsedMs: Math.round(performance.now() - startedAt),
  statusCounts,
  solvedCount: solved.length,
})}`);
for (const candidate of best) {
  console.log(`BEST ${JSON.stringify({
    ...candidate,
    solution: candidate.solution.map(moveKey),
  })}`);
}
