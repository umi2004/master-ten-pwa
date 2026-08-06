import { countAlive, type GameMove, type GameState } from '../core';
import {
  applySearchMove,
  createStateKey,
  getSearchMoves,
  type FirstMoveAnalysis,
  type LexicographicObjective,
  type MultiObjectiveSolverResult,
  type PostHocMoveClassification,
} from '../solver';
import { isNearMissState } from './failureAnalysis';

export interface MoveClassificationRatios {
  readonly optimalSafeMoveRatio: number;
  readonly recoverableMoveRatio: number;
  readonly losingMoveRatio: number;
  readonly unknownMoveRatio: number;
}

export interface CriticalDecisionAudit extends MoveClassificationRatios {
  readonly legalTransitionCount: number;
  readonly optimalMoveCount: number;
  readonly decoyMoveCount: number;
  readonly isCriticalDecision: boolean;
  readonly isStrongCriticalDecision: boolean;
}

export interface TrapDepthAudit {
  readonly trapMoveCount: number;
  readonly immediateTrapCount: number;
  readonly delayedTrapCount: number;
  readonly trapDepthMinimum: number | null;
  readonly trapDepthMaximum: number | null;
  readonly trapDepthDistribution: Readonly<Record<string, number>>;
  readonly nearMissRouteCount: number;
}

export interface RecoveryCapacityV4 {
  readonly recoveryToAnySolutionRate: number;
  readonly recoveryToOptimalSolutionRate: number;
  readonly recoveryToNearOptimalSolutionRate: number;
  readonly recoveryToNearMissRate: number;
  readonly unrecoverableRate: number;
}

export type AdditionTimingClassification =
  | 'beneficialAdditionTiming'
  | 'harmfulEarlyAddition'
  | 'harmfulLateAddition'
  | 'neutralAdditionTiming'
  | 'unknownAdditionTiming';

export interface AdditionTimingOutcome {
  readonly label: 'add-now' | 'add-after-one' | 'add-after-two' | 'do-not-add';
  readonly result: MultiObjectiveSolverResult;
  readonly nearMissRate?: number;
  readonly criticalDecisionCount?: number;
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function summarizeMoveClassifications(
  analyses: readonly FirstMoveAnalysis[],
): MoveClassificationRatios {
  const total = analyses.length;
  const ratio = (classification: PostHocMoveClassification): number => total === 0
    ? 0
    : round(analyses.filter((analysis) => analysis.classification === classification).length / total);
  return {
    optimalSafeMoveRatio: ratio('OPTIMAL_SAFE'),
    recoverableMoveRatio: ratio('RECOVERABLE'),
    losingMoveRatio: ratio('LOSING'),
    unknownMoveRatio: ratio('UNKNOWN'),
  };
}

export function auditCriticalDecision(
  analyses: readonly FirstMoveAnalysis[],
): CriticalDecisionAudit {
  const ratios = summarizeMoveClassifications(analyses);
  const optimalMoveCount = analyses.filter((analysis) => analysis.classification === 'OPTIMAL_SAFE').length;
  const losingCount = analyses.filter((analysis) => analysis.classification === 'LOSING').length;
  const recoverableCount = analyses.filter((analysis) => analysis.classification === 'RECOVERABLE').length;
  const decoyMoveCount = losingCount + recoverableCount;
  const unknownDoesNotObstruct = ratios.unknownMoveRatio <= 0.1;
  return {
    ...ratios,
    legalTransitionCount: analyses.length,
    optimalMoveCount,
    decoyMoveCount,
    isCriticalDecision: analyses.length >= 3
      && ratios.optimalSafeMoveRatio <= 0.35
      && decoyMoveCount >= 1
      && unknownDoesNotObstruct,
    isStrongCriticalDecision: analyses.length >= 4
      && ratios.optimalSafeMoveRatio <= 0.25
      && optimalMoveCount === 1
      && decoyMoveCount >= 2
      && ratios.unknownMoveRatio === 0,
  };
}

function shortestTerminalFailureDepth(initial: GameState, maximumDepth: number): {
  readonly depth: number | null;
  readonly nearMiss: boolean;
} {
  if (initial.status === 'LOST') return { depth: 0, nearMiss: isNearMissState(initial) };
  const queue: Array<{ readonly state: GameState; readonly depth: number }> = [{ state: initial, depth: 0 }];
  const visited = new Set([createStateKey(initial)]);
  let cursor = 0;
  while (cursor < queue.length) {
    const entry = queue[cursor];
    cursor += 1;
    if (!entry || entry.depth >= maximumDepth) continue;
    for (const move of getSearchMoves(entry.state)) {
      const child = applySearchMove(entry.state, move);
      const depth = entry.depth + 1;
      if (child.status === 'LOST') return { depth, nearMiss: isNearMissState(child) };
      const key = createStateKey(child);
      if (!visited.has(key)) {
        visited.add(key);
        queue.push({ state: child, depth });
      }
    }
  }
  return { depth: null, nearMiss: false };
}

export function auditTrapDepths(
  state: GameState,
  analyses: readonly FirstMoveAnalysis[],
  maximumDepth = 6,
): TrapDepthAudit {
  const losing = analyses.filter((analysis) => analysis.classification === 'LOSING');
  const distribution: Record<string, number> = {};
  const depths: number[] = [];
  let nearMissRouteCount = 0;
  for (const analysis of losing) {
    const child = applySearchMove(state, analysis.move);
    const terminal = shortestTerminalFailureDepth(child, maximumDepth);
    if (terminal.depth === null) continue;
    const trapDepth = terminal.depth + 1;
    depths.push(trapDepth);
    distribution[String(trapDepth)] = (distribution[String(trapDepth)] ?? 0) + 1;
    if (terminal.nearMiss) nearMissRouteCount += 1;
  }
  return {
    trapMoveCount: losing.length,
    immediateTrapCount: depths.filter((depth) => depth <= 1).length,
    delayedTrapCount: depths.filter((depth) => depth >= 2 && depth <= maximumDepth).length,
    trapDepthMinimum: depths.length === 0 ? null : Math.min(...depths),
    trapDepthMaximum: depths.length === 0 ? null : Math.max(...depths),
    trapDepthDistribution: distribution,
    nearMissRouteCount,
  };
}

function nearOptimal(
  objective: LexicographicObjective | undefined,
  baseline: LexicographicObjective,
): boolean {
  if (!objective || objective.additions !== baseline.additions) return false;
  return objective.moves <= Math.ceil(baseline.moves * 1.15)
    && objective.maximumRows <= baseline.maximumRows + 2;
}

export function calculateRecoveryCapacity(
  result: MultiObjectiveSolverResult,
  trapAudit?: TrapDepthAudit,
): RecoveryCapacityV4 {
  const nonOptimal = result.firstMoveAnalyses.filter(
    (analysis) => analysis.classification !== 'OPTIMAL_SAFE' && analysis.classification !== 'UNKNOWN',
  );
  if (nonOptimal.length === 0) {
    return {
      recoveryToAnySolutionRate: 0,
      recoveryToOptimalSolutionRate: 0,
      recoveryToNearOptimalSolutionRate: 0,
      recoveryToNearMissRate: 0,
      unrecoverableRate: 0,
    };
  }
  const baseline: LexicographicObjective | undefined = result.minimumAdditions === null
    || result.minimumMovesAtMinimumAdditions === null
    || result.minimumMaximumRows === null
    ? undefined
    : {
        additions: result.minimumAdditions,
        moves: result.minimumMovesAtMinimumAdditions,
        maximumRows: result.minimumMaximumRows,
      };
  const recoverable = nonOptimal.filter((analysis) => analysis.classification === 'RECOVERABLE');
  const optimalRecovery = baseline
    ? recoverable.filter((analysis) => analysis.objective
      && analysis.objective.additions === baseline.additions
      && analysis.objective.moves === baseline.moves
      && analysis.objective.maximumRows === baseline.maximumRows)
    : [];
  const nearOptimalRecovery = baseline
    ? recoverable.filter((analysis) => nearOptimal(analysis.objective, baseline))
    : [];
  const denominator = nonOptimal.length;
  return {
    recoveryToAnySolutionRate: round(recoverable.length / denominator),
    recoveryToOptimalSolutionRate: round(optimalRecovery.length / denominator),
    recoveryToNearOptimalSolutionRate: round(nearOptimalRecovery.length / denominator),
    recoveryToNearMissRate: round((trapAudit?.nearMissRouteCount ?? 0) / denominator),
    unrecoverableRate: round(nonOptimal.filter((analysis) => analysis.classification === 'LOSING').length / denominator),
  };
}

function objectiveOf(result: MultiObjectiveSolverResult): LexicographicObjective | undefined {
  if (
    result.minimumAdditions === null
    || result.minimumMovesAtMinimumAdditions === null
    || result.minimumMaximumRows === null
  ) return undefined;
  return {
    additions: result.minimumAdditions,
    moves: result.minimumMovesAtMinimumAdditions,
    maximumRows: result.minimumMaximumRows,
  };
}

export function isMeaningfulAdditionTimingDifference(
  baseline: AdditionTimingOutcome,
  comparison: AdditionTimingOutcome,
  moveIncreaseThreshold = 0.15,
  rowIncreaseThreshold = 2,
): boolean | undefined {
  if (baseline.result.status === 'UNKNOWN' || comparison.result.status === 'UNKNOWN') return undefined;
  if (baseline.result.status !== comparison.result.status) return true;
  const first = objectiveOf(baseline.result);
  const second = objectiveOf(comparison.result);
  if (!first || !second) return false;
  if (first.additions !== second.additions) return true;
  if (second.moves > Math.ceil(first.moves * (1 + moveIncreaseThreshold))) return true;
  if (second.maximumRows >= first.maximumRows + rowIncreaseThreshold) return true;
  const firstOptimal = baseline.result.optimalFirstMoves.map((move) => JSON.stringify(move)).sort().join('|');
  const secondOptimal = comparison.result.optimalFirstMoves.map((move) => JSON.stringify(move)).sort().join('|');
  if (firstOptimal !== secondOptimal) return true;
  if ((comparison.nearMissRate ?? 0) > (baseline.nearMissRate ?? 0) + 0.1) return true;
  return comparison.criticalDecisionCount !== undefined
    && baseline.criticalDecisionCount !== undefined
    && comparison.criticalDecisionCount !== baseline.criticalDecisionCount;
}

export function classifyAdditionTiming(
  baseline: AdditionTimingOutcome,
  comparison: AdditionTimingOutcome,
): AdditionTimingClassification {
  const meaningful = isMeaningfulAdditionTimingDifference(baseline, comparison);
  if (meaningful === undefined) return 'unknownAdditionTiming';
  if (!meaningful) return 'neutralAdditionTiming';
  if (comparison.result.status !== 'SOLVED' && baseline.result.status === 'SOLVED') {
    return comparison.label === 'add-now' ? 'harmfulEarlyAddition' : 'harmfulLateAddition';
  }
  const first = objectiveOf(baseline.result);
  const second = objectiveOf(comparison.result);
  if (first && second && (
    second.additions < first.additions
    || second.moves < first.moves
    || second.maximumRows < first.maximumRows
  )) return 'beneficialAdditionTiming';
  return comparison.label === 'add-now' ? 'harmfulEarlyAddition' : 'harmfulLateAddition';
}

export function moveKey(move: GameMove): string {
  if (move.type === 'ADD_NUMBERS') return 'A';
  const first = move.first.row * 9 + move.first.column;
  const second = move.second.row * 9 + move.second.column;
  return `${Math.min(first, second)}-${Math.max(first, second)}`;
}

export function residualAlive(state: GameState): number {
  return countAlive(state.board);
}
