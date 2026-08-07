import {
  canAddNumbers,
  createBoard,
  createGameState,
  getLegalPairMoves,
  RULE_VERSION,
  type Cell,
  type GameMove,
  type GameState,
} from '../core';
import { hashBoard } from '../puzzles';
import type { HumanStrategyId, StrategyTrialMetrics } from '../puzzles/types';
import {
  applySearchMove,
  countSolutionAdditions,
  solveWithDfs,
  type SolverStatus,
} from '../solver';
import { simulateHumanStrategy } from './humanPlayers';
import { evaluationCacheKey, type MasterSearchStore } from './masterSearchStore';

export const STAGE_1_PLAN: readonly [HumanStrategyId, number][] = [
  ['random', 20],
  ['proximity', 20],
  ['row-clear', 20],
];

export const STAGE_2_PLAN: readonly [HumanStrategyId, number][] = [
  ['proximity', 50],
  ['row-clear', 50],
  ['reserve-add', 30],
  ['early-add', 30],
  ['lookahead-2', 24],
];

export interface EvolutionMetrics {
  readonly clearRates: Readonly<Partial<Record<HumanStrategyId, number>>>;
  readonly successfulAdditionsMean?: number;
  readonly successfulAdditionsMedian?: number;
  readonly nearMissAmongFailures?: number;
  readonly trials: number;
}

export interface CandidateDiversity {
  readonly boardHash: string;
  readonly hammingToParent: number;
  readonly minimumHammingToBeam?: number;
  readonly canonicalDigitPattern: string;
  readonly initialLegalPairStructure: string;
  readonly solutionPrefix: string;
}

export interface EvolutionCandidate {
  readonly candidateId: string;
  readonly parentId: string;
  readonly generation: number;
  readonly initialCells: readonly Cell[];
  readonly changedInitialIndexes: readonly number[];
  readonly mutationType: string;
  readonly solutionStatus: SolverStatus;
  readonly solution: readonly GameMove[];
  readonly recommendedAdditions?: number;
  readonly metrics?: EvolutionMetrics;
  readonly fitness: number;
  readonly beforeFitness?: number;
  readonly diversity: CandidateDiversity;
  readonly timestamp: string;
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function summarizeEvolutionMetrics(
  metrics: readonly StrategyTrialMetrics[],
): EvolutionMetrics {
  const additions: number[] = [];
  let failures = 0;
  let nearMisses = 0;
  for (const metric of metrics) {
    for (const [value, count] of Object.entries(metric.successfulAdditionsDistribution)) {
      additions.push(...Array.from({ length: count }, () => Number(value)));
    }
    failures += metric.failures;
    nearMisses += metric.nearMissRouteCount;
  }
  additions.sort((first, second) => first - second);
  const mean = additions.length === 0
    ? undefined
    : round(additions.reduce((sum, value) => sum + value, 0) / additions.length);
  const median = additions.length === 0
    ? undefined
    : additions.length % 2 === 1
      ? additions[Math.floor(additions.length / 2)]
      : round(((additions[additions.length / 2 - 1] ?? 0) + (additions[additions.length / 2] ?? 0)) / 2);
  return {
    clearRates: Object.fromEntries(metrics.map((metric) => [metric.strategy, metric.clearRate])),
    ...(mean === undefined ? {} : { successfulAdditionsMean: mean }),
    ...(median === undefined ? {} : { successfulAdditionsMedian: median }),
    ...(failures === 0 ? {} : { nearMissAmongFailures: round(nearMisses / failures) }),
    trials: metrics.reduce((sum, metric) => sum + metric.trials, 0),
  };
}

export function evaluateEvolutionPlan(
  state: GameState,
  seed: string,
  plan: readonly (readonly [HumanStrategyId, number])[],
  store?: MasterSearchStore,
): EvolutionMetrics {
  const boardHash = hashBoard(state.board);
  const metrics = plan.map(([strategy, trials]) => {
    const compute = (): StrategyTrialMetrics => simulateHumanStrategy(state, seed, strategy, trials);
    return store
      ? store.getOrComputeEvaluation(evaluationCacheKey(boardHash, strategy, trials, seed), compute).value
      : compute();
  });
  return summarizeEvolutionMetrics(metrics);
}

export function calculateMasterFitness(metrics: EvolutionMetrics): number {
  const rate = (strategy: HumanStrategyId, fallback: number): number => metrics.clearRates[strategy] ?? fallback;
  const additionScore = metrics.successfulAdditionsMean === undefined
    ? 5
    : Math.max(0, 5 - Math.abs(5 - metrics.successfulAdditionsMean) * 2);
  return round(
    (1 - rate('lookahead-2', rate('random', 1))) * 40
    + (1 - rate('row-clear', 1)) * 25
    + (1 - rate('proximity', 1)) * 20
    + (metrics.nearMissAmongFailures ?? 0.3) * 10
    + additionScore,
  );
}

export function isMasterCandidate(metrics: EvolutionMetrics): boolean {
  return (metrics.clearRates['lookahead-2'] ?? 1) <= 0.5
    && (metrics.clearRates['row-clear'] ?? 1) <= 0.2
    && (metrics.clearRates.proximity ?? 1) <= 0.08
    && metrics.successfulAdditionsMedian === 5
    && (metrics.successfulAdditionsMean ?? 0) >= 4.5
    && (metrics.nearMissAmongFailures ?? 0) >= 0.3;
}

export function hammingDistance(first: readonly number[], second: readonly number[]): number {
  const length = Math.max(first.length, second.length);
  let distance = 0;
  for (let index = 0; index < length; index += 1) {
    if (first[index] !== second[index]) distance += 1;
  }
  return distance;
}

export function canonicalDigitPattern(cells: readonly number[]): string {
  const mapping = new Map<number, number>();
  let next = 1;
  return cells.map((cell) => {
    if (!mapping.has(cell)) mapping.set(cell, next++);
    return mapping.get(cell);
  }).join('');
}

function moveKey(move: GameMove): string {
  if (move.type === 'ADD_NUMBERS') return 'A';
  const first = move.first.row * 9 + move.first.column;
  const second = move.second.row * 9 + move.second.column;
  return `${Math.min(first, second)}-${Math.max(first, second)}`;
}

export function measureDiversity(
  cells: readonly Cell[],
  solution: readonly GameMove[],
  parentCells: readonly Cell[],
  beamCells: readonly (readonly Cell[])[] = [],
): CandidateDiversity {
  const board = createBoard(cells);
  const pairStructure = getLegalPairMoves(board).map(moveKey).sort().join(',');
  const distances = beamCells.map((candidate) => hammingDistance(cells, candidate));
  return {
    boardHash: hashBoard(board),
    hammingToParent: hammingDistance(cells, parentCells),
    ...(distances.length === 0 ? {} : { minimumHammingToBeam: Math.min(...distances) }),
    canonicalDigitPattern: canonicalDigitPattern(cells),
    initialLegalPairStructure: pairStructure,
    solutionPrefix: solution.slice(0, 12).map(moveKey).join(','),
  };
}

export function selectDiverseBeam(
  candidates: readonly EvolutionCandidate[],
  limit: number,
): readonly EvolutionCandidate[] {
  const unique = new Map<string, EvolutionCandidate>();
  for (const candidate of candidates) {
    const previous = unique.get(candidate.diversity.boardHash);
    if (!previous || candidate.fitness > previous.fitness) unique.set(candidate.diversity.boardHash, candidate);
  }
  const remaining = [...unique.values()];
  const selected: EvolutionCandidate[] = [];
  while (selected.length < limit && remaining.length > 0) {
    remaining.sort((first, second) => {
      const diversityBonus = (candidate: EvolutionCandidate): number => selected.length === 0
        ? 0
        : Math.min(...selected.map((entry) => hammingDistance(candidate.initialCells, entry.initialCells))) * 0.25;
      return (second.fitness + diversityBonus(second)) - (first.fitness + diversityBonus(first));
    });
    const next = remaining.shift();
    if (next) selected.push(next);
  }
  return selected;
}

function replay(initial: GameState, solution: readonly GameMove[]): GameState | undefined {
  try {
    let state = initial;
    for (const move of solution) state = applySearchMove(state, move);
    return state;
  } catch {
    return undefined;
  }
}

function scheduledPrefix(
  initial: GameState,
  schedule: readonly number[],
  offset: number,
): { readonly state: GameState; readonly moves: readonly GameMove[] } | undefined {
  let state = initial;
  const moves: GameMove[] = [];
  for (let phase = 0; phase < schedule.length; phase += 1) {
    for (let step = 0; step < (schedule[phase] ?? 0); step += 1) {
      const pairs = getLegalPairMoves(state.board);
      const move = pairs[(offset + phase * 5 + step * 3) % pairs.length];
      if (!move) break;
      moves.push(move);
      state = applySearchMove(state, move);
    }
    if (!canAddNumbers(state)) return undefined;
    const add: GameMove = { type: 'ADD_NUMBERS' };
    moves.push(add);
    state = applySearchMove(state, add);
  }
  return { state, moves };
}

export function repairCandidateSolution(
  initialCells: readonly Cell[],
  originalSolution: readonly GameMove[],
  seedOffset: number,
  limits: { readonly timeLimitMs?: number; readonly nodeLimit?: number } = {},
): { readonly status: SolverStatus; readonly solution: readonly GameMove[] } {
  const initial = createGameState(createBoard(initialCells), 5);
  const originalEnd = replay(initial, originalSolution);
  if (originalEnd?.status === 'WON' && countSolutionAdditions(originalSolution) === 5) {
    return { status: 'SOLVED', solution: originalSolution };
  }
  const schedules = [[7, 18, 18, 8], [10, 20, 12, 6], [6, 24, 18, 8]] as const;
  for (let index = 0; index < schedules.length; index += 1) {
    const prefix = scheduledPrefix(initial, schedules[index] ?? [], seedOffset + index * 7);
    if (!prefix) continue;
    const result = solveWithDfs(prefix.state, {
      timeLimitMs: limits.timeLimitMs ?? 300,
      nodeLimit: limits.nodeLimit ?? 50_000,
      maxDepth: 300,
    });
    if (result.status !== 'SOLVED') continue;
    const solution = [...prefix.moves, ...result.solution];
    if (countSolutionAdditions(solution) !== 5 || replay(initial, solution)?.status !== 'WON') continue;
    return { status: 'SOLVED', solution };
  }
  // The bounded schedules cover only selected subtrees, so failure to find a
  // route is UNKNOWN rather than a proof that the full initial state is unsolvable.
  return { status: 'UNKNOWN', solution: [] };
}

export function masterSearchVersion(): string {
  return `master-evolution-v1|${RULE_VERSION}`;
}
