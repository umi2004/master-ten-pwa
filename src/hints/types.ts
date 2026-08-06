import type { GameMove, GameState } from '../core';
import type { SolverLimits, SolverResult, SolverStatus } from '../solver';

export type HintSolver = (
  state: GameState,
  limits?: SolverLimits,
) => SolverResult;

export interface SafeHintResult {
  readonly status: 'SAFE_MOVE';
  readonly move: GameMove;
  readonly message: string;
  readonly source: 'cache' | 'search';
  readonly solutionLength: number;
}

export interface UnavailableHintResult {
  readonly status: 'UNAVAILABLE';
  readonly message: string;
  readonly source: 'none';
  readonly solverStatus: SolverStatus;
}

export type HintResult = SafeHintResult | UnavailableHintResult;

export interface HintRequestResult {
  readonly state: GameState;
  readonly hint: HintResult;
}
