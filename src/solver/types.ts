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
