import type { GameMove } from '../core';
import { countSolutionAdditions } from './searchState';
import type {
  SolverResult,
  SolverStatus,
  TerminationReason,
} from './types';

interface ResultInput {
  readonly status: SolverStatus;
  readonly solution?: readonly GameMove[];
  readonly nodesExpanded: number;
  readonly maxDepth: number;
  readonly elapsedMs: number;
  readonly terminationReason: TerminationReason;
  readonly provenOptimal?: boolean;
}

export function createSolverResult(input: ResultInput): SolverResult {
  const solution = input.solution ?? [];
  return {
    status: input.status,
    solution,
    nodesExpanded: input.nodesExpanded,
    maxDepth: input.maxDepth,
    elapsedMs: Math.max(0, input.elapsedMs),
    terminationReason: input.terminationReason,
    provenOptimal: input.provenOptimal ?? false,
    minimumAdditionsProven:
      input.status === 'SOLVED' && countSolutionAdditions(solution) === 0,
  };
}
