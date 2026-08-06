import {
  applyGameMove,
  boardRows,
  createGameState,
  type GameMove,
  type GameState,
} from '../core';
import { applySearchMove, createStateKey, getSearchMoves } from '../solver/searchState';
import type { SolverStatus } from '../solver/types';
import { createPrng } from './prng';

export interface SafeMoveSummary {
  readonly states: number;
  readonly legalActions: number;
  readonly solvedActions: number;
  readonly unsolvableActions: number;
  readonly unknownActions: number;
  readonly meanRatioLower: number;
  readonly meanRatioUpper: number;
  readonly minimumRatioLower: number;
  readonly minimumRatioUpper: number;
  readonly criticalDecisionCount: number;
}

export interface SurvivalBasinSummary {
  readonly depth: 1 | 2 | 3 | 4;
  readonly trials: number;
  readonly solved: number;
  readonly unsolvable: number;
  readonly unknown: number;
  readonly solvedRateLower: number;
  readonly solvedRateUpper: number;
}

export interface PostHocDifficultyAnalysis {
  readonly safeMoves: SafeMoveSummary;
  readonly survivalBasin: readonly SurvivalBasinSummary[];
  readonly trapDepth: {
    readonly divergentActions: number;
    readonly immediatelyCertifiedTraps: number;
    readonly unknownActions: number;
    readonly averageCertifiedDepth: number | null;
    readonly maximumCertifiedDepth: number | null;
  };
  readonly additionTiming: {
    readonly statesCompared: number;
    readonly sensitiveStates: number;
    readonly unknownStates: number;
  };
  readonly recovery: {
    readonly divergentActions: number;
    readonly rescuedByRemainingAdditions: number;
    readonly irrecoverableActions: number;
    readonly unknownActions: number;
    readonly capacityLower: number;
    readonly capacityUpper: number;
  };
  readonly oracle: {
    readonly nodesExpanded: number;
    readonly solvedStates: number;
    readonly unsolvableStates: number;
    readonly unknownQueries: number;
  };
}

interface OracleOptions {
  readonly nodeLimitPerQuery?: number;
  readonly timeLimitMsPerQuery?: number;
  readonly maximumDepth?: number;
  readonly maximumMemoStates?: number;
}

interface QueryLimits {
  readonly nodeLimit?: number;
  readonly timeLimitMs?: number;
}

function hasOddMatchClass(state: GameState): boolean {
  const counts = [0, 0, 0, 0, 0];
  for (const cell of state.board.cells) {
    if (cell === 0) continue;
    const matchClass = Math.min(cell, 10 - cell) - 1;
    counts[matchClass] = (counts[matchClass] ?? 0) + 1;
  }
  return counts.some((count) => count % 2 === 1);
}

class ReachabilityOracle {
  private readonly solved = new Set<string>();
  private readonly unsolvable = new Set<string>();
  private readonly nodeLimit: number;
  private readonly timeLimitMs: number;
  private readonly maximumDepth: number;
  private readonly maximumMemoStates: number;
  public nodesExpanded = 0;
  public unknownQueries = 0;

  public constructor(knownSolved: readonly GameState[], options: OracleOptions) {
    for (const state of knownSolved) this.solved.add(createStateKey(state));
    this.nodeLimit = options.nodeLimitPerQuery ?? 250_000;
    this.timeLimitMs = options.timeLimitMsPerQuery ?? 2_000;
    this.maximumDepth = options.maximumDepth ?? 260;
    this.maximumMemoStates = options.maximumMemoStates ?? 1_500_000;
  }

  public query(initialState: GameState, queryLimits: QueryLimits = {}): SolverStatus {
    const startedAt = performance.now();
    let queryNodes = 0;
    const nodeLimit = queryLimits.nodeLimit ?? this.nodeLimit;
    const timeLimitMs = queryLimits.timeLimitMs ?? this.timeLimitMs;
    const visiting = new Set<string>();

    const visit = (state: GameState, depth: number): SolverStatus => {
      const key = createStateKey(state);
      if (state.status === 'WON' || this.solved.has(key)) return 'SOLVED';
      if (state.status === 'LOST' || this.unsolvable.has(key)) return 'UNSOLVABLE';
      // A pair always removes two values from the same complement class. With no
      // additions left, odd class parity is therefore a complete impossibility certificate.
      if (state.additionsRemaining === 0 && hasOddMatchClass(state)) {
        this.unsolvable.add(key);
        return 'UNSOLVABLE';
      }
      if (
        depth >= this.maximumDepth ||
        queryNodes >= nodeLimit ||
        performance.now() - startedAt >= timeLimitMs
      ) {
        return 'UNKNOWN';
      }
      if (visiting.has(key)) return 'UNSOLVABLE';

      visiting.add(key);
      queryNodes += 1;
      this.nodesExpanded += 1;
      let hasUnknownChild = false;
      for (const move of getSearchMoves(state)) {
        const childStatus = visit(applySearchMove(state, move), depth + 1);
        if (childStatus === 'SOLVED') {
          visiting.delete(key);
          this.solved.add(key);
          return 'SOLVED';
        }
        if (childStatus === 'UNKNOWN') hasUnknownChild = true;
      }
      visiting.delete(key);
      if (hasUnknownChild) return 'UNKNOWN';
      if (this.solved.size + this.unsolvable.size < this.maximumMemoStates) {
        this.unsolvable.add(key);
      }
      return 'UNSOLVABLE';
    };

    const result = visit(initialState, 0);
    if (result === 'UNKNOWN') this.unknownQueries += 1;
    return result;
  }

  public statistics(): PostHocDifficultyAnalysis['oracle'] {
    return {
      nodesExpanded: this.nodesExpanded,
      solvedStates: this.solved.size,
      unsolvableStates: this.unsolvable.size,
      unknownQueries: this.unknownQueries,
    };
  }
}

function key(move: GameMove): string {
  if (move.type === 'ADD_NUMBERS') return 'A';
  const first = move.first.row * 9 + move.first.column;
  const second = move.second.row * 9 + move.second.column;
  return `${Math.min(first, second)}-${Math.max(first, second)}`;
}

function replayStates(initialState: GameState, solution: readonly GameMove[]): readonly GameState[] {
  const states = [initialState];
  let state = initialState;
  for (const move of solution) {
    state = applyGameMove({ ...state, history: [] }, move);
    states.push({ ...state, history: [] });
  }
  if (state.status !== 'WON') throw new Error('Post-hoc analysis requires a replayable solved path.');
  return states;
}

function withAdditionBudget(state: GameState, additionsRemaining: number): GameState {
  const fresh = createGameState(state.board, additionsRemaining);
  return {
    ...fresh,
    additionsUsed: state.additionsUsed,
    moveCount: state.moveCount,
  };
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function timingVariant(
  state: GameState,
  solution: readonly GameMove[],
  startIndex: number,
  pairCount: number,
): GameState | undefined {
  let next = state;
  let pairsApplied = 0;
  for (let index = startIndex; index < solution.length && pairsApplied < pairCount; index += 1) {
    const move = solution[index];
    if (!move || move.type === 'ADD_NUMBERS') continue;
    if (!getSearchMoves(next).some((candidate) => key(candidate) === key(move))) return undefined;
    next = applySearchMove(next, move);
    pairsApplied += 1;
  }
  if (pairsApplied !== pairCount) return undefined;
  const add = getSearchMoves(next).find((move) => move.type === 'ADD_NUMBERS');
  return add ? applySearchMove(next, add) : undefined;
}

function minimumAdditionOutcome(
  state: GameState,
  alreadyForcedAdditions: number,
  oracle: ReachabilityOracle,
): string {
  let lowerBudgetUnknown = false;
  for (let budget = 0; budget <= state.additionsRemaining; budget += 1) {
    const status = oracle.query(withAdditionBudget(state, budget), {
      nodeLimit: 50_000,
      timeLimitMs: 500,
    });
    if (status === 'SOLVED') {
      return lowerBudgetUnknown
        ? 'UNKNOWN'
        : `SOLVED:${alreadyForcedAdditions + budget}`;
    }
    if (status === 'UNKNOWN') lowerBudgetUnknown = true;
  }
  return lowerBudgetUnknown ? 'UNKNOWN' : 'UNSOLVABLE';
}

export function analyzePostHocDifficulty(
  initialState: GameState,
  solution: readonly GameMove[],
  seed: string,
  options: OracleOptions = {},
): PostHocDifficultyAnalysis {
  const replayed = replayStates(initialState, solution);
  const pathStates = replayed.slice(0, -1);
  const oracle = new ReachabilityOracle(replayed, options);

  let legalActions = 0;
  let solvedActions = 0;
  let unsolvableActions = 0;
  let unknownActions = 0;
  let ratioLowerTotal = 0;
  let ratioUpperTotal = 0;
  let minimumRatioLower = 1;
  let minimumRatioUpper = 1;
  let criticalDecisionCount = 0;
  let divergentActions = 0;
  let certifiedTraps = 0;
  let trapUnknown = 0;
  let rescued = 0;
  let irrecoverable = 0;
  let recoveryUnknown = 0;

  for (const [index, state] of pathStates.entries()) {
    const moves = getSearchMoves(state);
    let stateSolved = 0;
    let stateUnknown = 0;
    const pathMoveKey = solution[index] ? key(solution[index]) : '';
    for (const move of moves) {
      const child = applySearchMove(state, move);
      const status = oracle.query(child);
      legalActions += 1;
      if (status === 'SOLVED') {
        solvedActions += 1;
        stateSolved += 1;
      } else if (status === 'UNSOLVABLE') {
        unsolvableActions += 1;
      } else {
        unknownActions += 1;
        stateUnknown += 1;
      }

      if (key(move) === pathMoveKey) continue;
      divergentActions += 1;
      if (status === 'UNSOLVABLE') {
        certifiedTraps += 1;
        irrecoverable += 1;
        continue;
      }
      if (status === 'UNKNOWN') {
        trapUnknown += 1;
        recoveryUnknown += 1;
        continue;
      }
      const withoutAdditions = oracle.query(withAdditionBudget(child, 0), {
        nodeLimit: 50_000,
        timeLimitMs: 500,
      });
      if (withoutAdditions === 'UNSOLVABLE') rescued += 1;
      else if (withoutAdditions === 'UNKNOWN') recoveryUnknown += 1;

    }
    const lower = moves.length === 0 ? 0 : stateSolved / moves.length;
    const upper = moves.length === 0 ? 0 : (stateSolved + stateUnknown) / moves.length;
    ratioLowerTotal += lower;
    ratioUpperTotal += upper;
    minimumRatioLower = Math.min(minimumRatioLower, lower);
    minimumRatioUpper = Math.min(minimumRatioUpper, upper);
    if (moves.length >= 2 && stateUnknown === 0 && lower <= 0.25) criticalDecisionCount += 1;
  }

  const survivalBasin: SurvivalBasinSummary[] = [];
  for (const depth of [1, 2, 3, 4] as const) {
    const trials = 2_000;
    const prng = createPrng(`${seed}|post-hoc-v3|survival|${depth}`);
    let solved = 0;
    let unsolvable = 0;
    let unknown = 0;
    for (let trial = 0; trial < trials; trial += 1) {
      let state = initialState;
      for (let ply = 0; ply < depth && state.status === 'PLAYING'; ply += 1) {
        const moves = getSearchMoves(state);
        const move = moves[prng.integer(moves.length)];
        if (!move) break;
        state = applySearchMove(state, move);
      }
      const status = oracle.query(state);
      if (status === 'SOLVED') solved += 1;
      else if (status === 'UNSOLVABLE') unsolvable += 1;
      else unknown += 1;
    }
    survivalBasin.push({
      depth,
      trials,
      solved,
      unsolvable,
      unknown,
      solvedRateLower: round(solved / trials),
      solvedRateUpper: round((solved + unknown) / trials),
    });
  }

  let timingStates = 0;
  let sensitiveStates = 0;
  let timingUnknown = 0;
  for (const [index, state] of pathStates.entries()) {
    const variants = [
      { state: timingVariant(state, solution, index, 0), forcedAdditions: 1 },
      { state: timingVariant(state, solution, index, 1), forcedAdditions: 1 },
      { state: timingVariant(state, solution, index, 2), forcedAdditions: 1 },
      { state: withAdditionBudget(state, 0), forcedAdditions: 0 },
    ].filter((variant): variant is { readonly state: GameState; readonly forcedAdditions: number } =>
      variant.state !== undefined,
    );
    if (variants.length < 2) continue;
    timingStates += 1;
    const outcomes = variants.map((variant) =>
      minimumAdditionOutcome(variant.state, variant.forcedAdditions, oracle),
    );
    if (outcomes.includes('UNKNOWN')) timingUnknown += 1;
    if (new Set(outcomes).size > 1) sensitiveStates += 1;
  }

  const recoveryKnown = divergentActions - recoveryUnknown;
  return {
    safeMoves: {
      states: pathStates.length,
      legalActions,
      solvedActions,
      unsolvableActions,
      unknownActions,
      meanRatioLower: round(ratioLowerTotal / pathStates.length),
      meanRatioUpper: round(ratioUpperTotal / pathStates.length),
      minimumRatioLower: round(minimumRatioLower),
      minimumRatioUpper: round(minimumRatioUpper),
      criticalDecisionCount,
    },
    survivalBasin,
    trapDepth: {
      divergentActions,
      immediatelyCertifiedTraps: certifiedTraps,
      unknownActions: trapUnknown,
      averageCertifiedDepth: certifiedTraps === 0 ? null : 0,
      maximumCertifiedDepth: certifiedTraps === 0 ? null : 0,
    },
    additionTiming: {
      statesCompared: timingStates,
      sensitiveStates,
      unknownStates: timingUnknown,
    },
    recovery: {
      divergentActions,
      rescuedByRemainingAdditions: rescued,
      irrecoverableActions: irrecoverable,
      unknownActions: recoveryUnknown,
      capacityLower: recoveryKnown === 0 ? 0 : round(rescued / divergentActions),
      capacityUpper: round((rescued + recoveryUnknown) / Math.max(1, divergentActions)),
    },
    oracle: oracle.statistics(),
  };
}

export function solutionMaximumRows(initialState: GameState, solution: readonly GameMove[]): number {
  return Math.max(...replayStates(initialState, solution).map((state) => boardRows(state.board)));
}
