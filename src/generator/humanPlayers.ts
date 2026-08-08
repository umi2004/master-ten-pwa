import {
  boardRows,
  countAlive,
  getLegalPairMoves,
  positionToIndex,
  type GameMove,
  type GameState,
} from '../core';
import type { HumanStrategyId, StrategyTrialMetrics } from '../puzzles/types';
import { applySearchMove, createStateKey, getSearchMoves } from '../solver/searchState';
import { createPrng, type Prng } from './prng';
import { classifyHumanFailure } from './failureAnalysis';

export const SIMPLE_STRATEGIES: readonly HumanStrategyId[] = [
  'random',
  'proximity',
  'same-value',
  'sum-ten',
  'row-clear',
  'reserve-add',
  'early-add',
  'lookahead-2',
  'lookahead-3',
  'lookahead-4',
];

export const HUMAN_BENCHMARK_TRIALS: Readonly<Record<HumanStrategyId, number>> = {
  random: 2_000,
  proximity: 1_000,
  'same-value': 1_000,
  'sum-ten': 1_000,
  'row-clear': 1_000,
  'reserve-add': 1_000,
  'early-add': 1_000,
  'lookahead-2': 200,
  'lookahead-3': 200,
  'lookahead-4': 200,
};

export interface HumanPlayerAuditDefinition {
  readonly strategy: HumanStrategyId;
  readonly inputs: readonly string[];
  readonly depth: number;
  readonly evaluation: string;
  readonly tieBreak: string;
  readonly usesCompleteSolver: false;
}

export interface HumanTraceStep {
  readonly strategy: HumanStrategyId;
  readonly trial: number;
  readonly ply: number;
  readonly stateKey: string;
  readonly legalTransitionCount: number;
  readonly legalMoves: readonly GameMove[];
  readonly selectedMove: GameMove;
  readonly additionsRemaining: number;
  readonly additionsUsed: number;
}

export interface SuccessfulHumanTrace {
  readonly strategy: HumanStrategyId;
  readonly trial: number;
  readonly steps: readonly HumanTraceStep[];
}

export interface HumanSimulationAnalysisOptions {
  readonly analysis: true;
  readonly maxSuccessfulTraces?: number;
  readonly successfulAdditionsFilter?: number;
}

export interface HumanStrategyAnalysisResult {
  readonly metrics: StrategyTrialMetrics;
  readonly successfulTraces: readonly SuccessfulHumanTrace[];
}

const COMMON_INPUTS = [
  'current board',
  'additions remaining and used',
  'current legal pair and add moves',
] as const;

export const HUMAN_PLAYER_AUDIT: readonly HumanPlayerAuditDefinition[] = SIMPLE_STRATEGIES.map(
  (strategy) => {
    const depth = strategy.startsWith('lookahead-') ? Number(strategy.at(-1)) : 1;
    const evaluation = strategy === 'random'
      ? 'uniform random legal action'
      : strategy === 'proximity'
        ? 'Chebyshev distance, then equal-digit bonus'
        : strategy === 'same-value'
          ? 'equal-digit bonus, then Chebyshev distance'
        : strategy === 'sum-ten'
          ? 'sum-to-ten bonus, then Chebyshev distance'
          : strategy === 'row-clear'
            ? 'alive cells in rows touched by the pair'
            : strategy === 'reserve-add'
              ? 'random pair until no pair remains'
              : strategy === 'early-add'
                ? 'add twice early, then random pairs'
                : 'bounded local static score at the requested ply depth';
    return {
      strategy,
      inputs: COMMON_INPUTS,
      depth,
      evaluation,
      tieBreak: 'fixed per-trial PRNG seed',
      usesCompleteSolver: false,
    };
  },
);

function pairIndexes(state: GameState, move: GameMove): readonly [number, number] | undefined {
  if (move.type === 'ADD_NUMBERS') return undefined;
  return [
    positionToIndex(state.board, move.first),
    positionToIndex(state.board, move.second),
  ];
}

function distance(state: GameState, move: GameMove): number {
  const indexes = pairIndexes(state, move);
  if (!indexes) return Number.POSITIVE_INFINITY;
  const [first, second] = indexes;
  const rowDistance = Math.abs(Math.floor(first / 9) - Math.floor(second / 9));
  const columnDistance = Math.abs((first % 9) - (second % 9));
  return Math.max(rowDistance, columnDistance);
}

function rowCompletionScore(state: GameState, move: GameMove): number {
  const indexes = pairIndexes(state, move);
  if (!indexes) return -10_000;
  const affectedRows = new Set(indexes.map((index) => Math.floor(index / 9)));
  let score = 0;
  for (const row of affectedRows) {
    const alive = state.board.cells
      .slice(row * 9, Math.min(row * 9 + 9, state.board.logicalLength))
      .filter((cell) => cell !== 0).length;
    score += alive <= 2 ? 100 : 10 - alive;
  }
  return score;
}

function shuffledBest(
  moves: readonly GameMove[],
  score: (move: GameMove) => number,
  prng: Prng,
): GameMove | undefined {
  let best = Number.NEGATIVE_INFINITY;
  const choices: GameMove[] = [];
  for (const move of moves) {
    const value = score(move);
    if (value > best) {
      best = value;
      choices.length = 0;
      choices.push(move);
    } else if (value === best) {
      choices.push(move);
    }
  }
  return choices[prng.integer(choices.length)];
}

function staticStateScore(state: GameState): number {
  if (state.status === 'WON') return 1_000_000;
  const pairs = getLegalPairMoves(state.board).length;
  const alive = countAlive(state.board);
  return -alive * 20 - boardRows(state.board) * 3 + pairs * 2 + state.additionsRemaining;
}

function sampleMoves(moves: readonly GameMove[], limit: number, prng: Prng): readonly GameMove[] {
  if (moves.length <= limit) return moves;
  const indexes = new Set<number>();
  while (indexes.size < limit) indexes.add(prng.integer(moves.length));
  return [...indexes].map((index) => moves[index]).filter((move): move is GameMove => move !== undefined);
}

function lookaheadScore(
  state: GameState,
  move: GameMove,
  depth: number,
  prng: Prng,
): number {
  const child = applySearchMove(state, move);
  if (depth <= 1 || child.status !== 'PLAYING') return staticStateScore(child);
  const moves = getSearchMoves(child);
  if (moves.length === 0) return staticStateScore(child);
  const ranked = sampleMoves(moves, 6, prng)
    .map((candidate) => ({
      candidate,
      score: staticStateScore(applySearchMove(child, candidate)) + prng.integer(3),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
  let best = Number.NEGATIVE_INFINITY;
  for (const entry of ranked) {
    best = Math.max(best, lookaheadScore(child, entry.candidate, depth - 1, prng));
  }
  return best;
}

function wilson95(clears: number, trials: number): { readonly lower: number; readonly upper: number } {
  const z = 1.959963984540054;
  const zSquared = z * z;
  const probability = clears / trials;
  const denominator = 1 + zSquared / trials;
  const center = (probability + zSquared / (2 * trials)) / denominator;
  const margin = z * Math.sqrt(
    (probability * (1 - probability) + zSquared / (4 * trials)) / trials,
  ) / denominator;
  return {
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
  };
}

export function humanTrialSeed(
  puzzleSeed: string,
  strategy: HumanStrategyId,
  trial: number,
): string {
  return `${puzzleSeed}|human-v3|${strategy}|${trial.toString().padStart(4, '0')}`;
}

function chooseMove(state: GameState, strategy: HumanStrategyId, prng: Prng): GameMove | undefined {
  const searchMoves = getSearchMoves(state);
  if (searchMoves.length === 0) return undefined;
  const pairs = searchMoves.filter((move) => move.type === 'PAIR');
  const add = searchMoves.find((move) => move.type === 'ADD_NUMBERS');

  if (strategy === 'random') return searchMoves[prng.integer(searchMoves.length)];
  if (strategy === 'early-add' && add && state.additionsUsed < 2) return add;
  if (pairs.length === 0) return add;
  if (strategy === 'reserve-add' || strategy === 'early-add') {
    return pairs[prng.integer(pairs.length)];
  }
  if (strategy === 'proximity') {
    return shuffledBest(pairs, (move) => {
      const indexes = pairIndexes(state, move);
      if (!indexes) return -10_000;
      const [first, second] = indexes;
      const same = state.board.cells[first] === state.board.cells[second];
      return -distance(state, move) * 10 + (same ? 1 : 0);
    }, prng);
  }
  if (strategy === 'same-value') {
    return shuffledBest(pairs, (move) => {
      const indexes = pairIndexes(state, move);
      if (!indexes) return -10_000;
      const [first, second] = indexes;
      const same = state.board.cells[first] === state.board.cells[second];
      return (same ? 100 : 0) - distance(state, move);
    }, prng);
  }
  if (strategy === 'sum-ten') {
    return shuffledBest(pairs, (move) => {
      const indexes = pairIndexes(state, move);
      if (!indexes) return -10_000;
      const [first, second] = indexes;
      const sumTen = (state.board.cells[first] ?? 0) + (state.board.cells[second] ?? 0) === 10;
      return (sumTen ? 100 : 0) - distance(state, move);
    }, prng);
  }
  if (strategy === 'row-clear') {
    return shuffledBest(pairs, (move) => rowCompletionScore(state, move), prng);
  }

  const depth = Number(strategy.at(-1));
  const visibleMoves = sampleMoves(searchMoves, 8, prng)
    .map((move) => ({ move, score: staticStateScore(applySearchMove(state, move)) + prng.integer(3) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((entry) => entry.move);
  const ranked = visibleMoves.map((move) => ({
    move,
    score: lookaheadScore(state, move, depth, prng),
  }));
  const best = Math.max(...ranked.map((entry) => entry.score));
  const choices = ranked.filter((entry) => entry.score === best);
  return choices[prng.integer(choices.length)]?.move;
}

export function simulateHumanStrategy(
  initialState: GameState,
  seed: string,
  strategy: HumanStrategyId,
  trials: number,
  maxSteps: number,
  options: HumanSimulationAnalysisOptions,
): HumanStrategyAnalysisResult;
export function simulateHumanStrategy(
  initialState: GameState,
  seed: string,
  strategy: HumanStrategyId,
  trials: number,
  maxSteps?: number,
  options?: undefined,
): StrategyTrialMetrics;
export function simulateHumanStrategy(
  initialState: GameState,
  seed: string,
  strategy: HumanStrategyId,
  trials: number,
  maxSteps = 300,
  options?: HumanSimulationAnalysisOptions,
): StrategyTrialMetrics | HumanStrategyAnalysisResult {
  let cleared = 0;
  let totalMoves = 0;
  let totalAdditions = 0;
  let totalMaximumRows = 0;
  const successfulAdditions: number[] = [];
  const failureCounts: Record<string, number> = {
    EARLY_COLLAPSE: 0,
    LATE_NEAR_MISS: 0,
    LATE_LARGE_REMAINDER: 0,
    HEIGHT_OVERFLOW: 0,
    UNKNOWN: 0,
  };
  const residualAlive: number[] = [];
  const residualHistogram: Record<string, number> = {};
  const remainingAdditionsHistogram: Record<string, number> = {};
  const successfulAdditionsHistogram: Record<string, number> = {};
  const successfulTraces: SuccessfulHumanTrace[] = [];
  const traceLimit = Math.min(3, Math.max(0, options?.maxSuccessfulTraces ?? 1));
  for (let trial = 0; trial < trials; trial += 1) {
    const prng = createPrng(humanTrialSeed(seed, strategy, trial));
    let state = initialState;
    let maximumRows = boardRows(state.board);
    let steps = 0;
    const trialTrace: HumanTraceStep[] | undefined = options ? [] : undefined;
    for (; steps < maxSteps && state.status === 'PLAYING'; steps += 1) {
      const legalMoves = trialTrace ? getSearchMoves(state) : undefined;
      const move = chooseMove(state, strategy, prng);
      if (!move) break;
      if (trialTrace && legalMoves) {
        trialTrace.push({
          strategy,
          trial,
          ply: steps,
          stateKey: createStateKey(state),
          legalTransitionCount: legalMoves.length,
          legalMoves,
          selectedMove: move,
          additionsRemaining: state.additionsRemaining,
          additionsUsed: state.additionsUsed,
        });
      }
      state = applySearchMove(state, move);
      maximumRows = Math.max(maximumRows, boardRows(state.board));
    }
    if (state.status === 'WON') {
      cleared += 1;
      successfulAdditions.push(state.additionsUsed);
      const additions = String(state.additionsUsed);
      successfulAdditionsHistogram[additions] = (successfulAdditionsHistogram[additions] ?? 0) + 1;
      if (
        trialTrace
        && successfulTraces.length < traceLimit
        && (
          options?.successfulAdditionsFilter === undefined
          || state.additionsUsed === options.successfulAdditionsFilter
        )
      ) {
        successfulTraces.push({ strategy, trial, steps: trialTrace });
      }
    } else {
      const failure = classifyHumanFailure(state, steps >= maxSteps);
      failureCounts[failure] = (failureCounts[failure] ?? 0) + 1;
      const alive = countAlive(state.board);
      residualAlive.push(alive);
      residualHistogram[String(alive)] = (residualHistogram[String(alive)] ?? 0) + 1;
      const additions = String(state.additionsRemaining);
      remainingAdditionsHistogram[additions] = (remainingAdditionsHistogram[additions] ?? 0) + 1;
    }
    totalMoves += state.moveCount;
    totalAdditions += state.additionsUsed;
    totalMaximumRows += maximumRows;
  }
  const round = (value: number): number => Math.round(value * 10_000) / 10_000;
  const interval = wilson95(cleared, trials);
  const failures = trials - cleared;
  const sortedResidual = [...residualAlive].sort((a, b) => a - b);
  const medianResidual = sortedResidual.length === 0
    ? 0
    : sortedResidual.length % 2 === 1
      ? sortedResidual[Math.floor(sortedResidual.length / 2)] ?? 0
      : ((sortedResidual[sortedResidual.length / 2 - 1] ?? 0)
        + (sortedResidual[sortedResidual.length / 2] ?? 0)) / 2;
  const meanResidual = failures === 0
    ? 0
    : residualAlive.reduce((sum, alive) => sum + alive, 0) / failures;
  const sortedSuccessfulAdditions = [...successfulAdditions].sort((a, b) => a - b);
  const medianSuccessfulAdditions = sortedSuccessfulAdditions.length === 0
    ? 0
    : sortedSuccessfulAdditions.length % 2 === 1
      ? sortedSuccessfulAdditions[Math.floor(sortedSuccessfulAdditions.length / 2)] ?? 0
      : ((sortedSuccessfulAdditions[sortedSuccessfulAdditions.length / 2 - 1] ?? 0)
        + (sortedSuccessfulAdditions[sortedSuccessfulAdditions.length / 2] ?? 0)) / 2;
  const meanSuccessfulAdditions = cleared === 0
    ? 0
    : successfulAdditions.reduce((sum, additions) => sum + additions, 0) / cleared;
  const metrics: StrategyTrialMetrics = {
    strategy,
    trials,
    clears: cleared,
    clearRate: round(cleared / trials),
    clearRate95: {
      lower: round(interval.lower),
      upper: round(interval.upper),
    },
    averageMoves: round(totalMoves / trials),
    averageAdditions: round(totalAdditions / trials),
    averageAdditionsOnSuccess: round(meanSuccessfulAdditions),
    medianAdditionsOnSuccess: round(medianSuccessfulAdditions),
    successfulAdditionsDistribution: successfulAdditionsHistogram,
    averageMaximumRows: round(totalMaximumRows / trials),
    failures,
    earlyCollapseRate: round((failureCounts.EARLY_COLLAPSE ?? 0) / trials),
    lateNearMissRate: round((failureCounts.LATE_NEAR_MISS ?? 0) / trials),
    lateLargeRemainderRate: round((failureCounts.LATE_LARGE_REMAINDER ?? 0) / trials),
    heightOverflowRate: round((failureCounts.HEIGHT_OVERFLOW ?? 0) / trials),
    unknownFailureRate: round((failureCounts.UNKNOWN ?? 0) / trials),
    nearMissRouteCount: failureCounts.LATE_NEAR_MISS ?? 0,
    nearMissRate: round((failureCounts.LATE_NEAR_MISS ?? 0) / trials),
    failureResidualAliveCount: round(meanResidual),
    meanResidualAliveOnFailure: round(meanResidual),
    medianResidualAliveOnFailure: round(medianResidual),
    failureResidualAliveDistribution: residualHistogram,
    residualAliveHistogram: residualHistogram,
    failureRemainingAdditionsDistribution: remainingAdditionsHistogram,
  };
  return options ? { metrics, successfulTraces } : metrics;
}

export function simulateHumanStrategies(
  initialState: GameState,
  seed: string,
): readonly StrategyTrialMetrics[] {
  return SIMPLE_STRATEGIES.map((strategy) => {
    return simulateHumanStrategy(initialState, seed, strategy, HUMAN_BENCHMARK_TRIALS[strategy]);
  });
}
