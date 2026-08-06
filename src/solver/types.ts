import type { GameMove } from '../core';

export type SolverStatus = 'SOLVED' | 'UNSOLVABLE' | 'UNKNOWN';

export type TerminationReason =
  | 'solved'
  | 'exhausted'
  | 'node-limit'
  | 'time-limit'
  | 'depth-limit';

export interface SolverLimits {
  readonly nodeLimit?: number;
  readonly timeLimitMs?: number;
  readonly maxDepth?: number;
  readonly now?: () => number;
}

export interface SolverResult {
  readonly status: SolverStatus;
  readonly solution: readonly GameMove[];
  readonly nodesExpanded: number;
  readonly maxDepth: number;
  readonly elapsedMs: number;
  readonly terminationReason: TerminationReason;
  readonly provenOptimal: boolean;
  readonly minimumAdditionsProven: boolean;
}

export interface Solver {
  solve(limits?: SolverLimits): SolverResult;
}

export type PostHocMoveClassification =
  | 'OPTIMAL_SAFE'
  | 'RECOVERABLE'
  | 'LOSING'
  | 'UNKNOWN';

export interface LexicographicObjective {
  readonly additions: number;
  readonly moves: number;
  readonly maximumRows: number;
}

export interface AdditionCapProof {
  readonly additionsAvailable: number;
  readonly status: SolverStatus;
  readonly solution: readonly GameMove[];
  readonly nodesExpanded: number;
  readonly elapsedMs: number;
  readonly terminationReason: TerminationReason;
}

export interface FirstMoveAnalysis {
  readonly move: GameMove;
  readonly classification: PostHocMoveClassification;
  readonly objective?: LexicographicObjective;
  readonly status: SolverStatus;
  readonly terminationReason: TerminationReason;
}

export interface MultiObjectiveSolverResult {
  readonly status: SolverStatus;
  readonly minimumAdditions: number | null;
  readonly minimumAdditionsProven: boolean;
  readonly minimumMovesAtMinimumAdditions: number | null;
  readonly minimumMovesProven: boolean;
  readonly minimumMaximumRows: number | null;
  readonly minimumMaximumRowsProven: boolean;
  readonly minimumAdditionSolution: readonly GameMove[];
  readonly minimumMoveSolutionAtMinimumAdditions: readonly GameMove[];
  readonly lowHeightSolution: readonly GameMove[];
  readonly recommendedHumanSolution: readonly GameMove[];
  readonly optimalFirstMoves: readonly GameMove[];
  readonly recoverableFirstMoves: readonly GameMove[];
  readonly losingFirstMoves: readonly GameMove[];
  readonly unknownFirstMoves: readonly GameMove[];
  readonly firstMoveAnalyses: readonly FirstMoveAnalysis[];
  readonly additionCapProofs: readonly AdditionCapProof[];
  readonly nodesExpanded: number;
  readonly elapsedMs: number;
  readonly terminationReason: TerminationReason;
}

export interface MinimumAdditionProofSummary {
  readonly status: SolverStatus;
  readonly minimumAdditions: number | null;
  readonly minimumAdditionsProven: boolean;
}
