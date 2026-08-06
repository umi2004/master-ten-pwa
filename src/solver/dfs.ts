import type { GameMove, GameState } from '../core';
import { resolveLimits } from './limits';
import { createSolverResult } from './result';
import {
  applySearchMove,
  createStateKey,
  getSearchMoves,
} from './searchState';
import type {
  SolverLimits,
  SolverResult,
  TerminationReason,
} from './types';

type VisitResult =
  | { readonly status: 'SOLVED'; readonly solution: readonly GameMove[] }
  | { readonly status: 'UNSOLVABLE' }
  | { readonly status: 'UNKNOWN' };

export function solveWithDfs(
  initialState: GameState,
  requestedLimits: SolverLimits = {},
): SolverResult {
  const limits = resolveLimits(requestedLimits);
  const startedAt = limits.now();
  const elapsed = (): number => limits.now() - startedAt;
  const failedStates = new Set<string>();
  const pathStates = new Set<string>();
  let nodesExpanded = 0;
  let maximumDepth = 0;
  let limitReason: TerminationReason | undefined;

  const visit = (state: GameState, depth: number): VisitResult => {
    maximumDepth = Math.max(maximumDepth, depth);
    if (state.status === 'WON') {
      return { status: 'SOLVED', solution: [] };
    }
    if (state.status === 'LOST') {
      return { status: 'UNSOLVABLE' };
    }
    if (elapsed() >= limits.timeLimitMs) {
      limitReason = 'time-limit';
      return { status: 'UNKNOWN' };
    }
    if (depth >= limits.maxDepth) {
      limitReason ??= 'depth-limit';
      return { status: 'UNKNOWN' };
    }
    if (nodesExpanded >= limits.nodeLimit) {
      limitReason = 'node-limit';
      return { status: 'UNKNOWN' };
    }

    const stateKey = createStateKey(state);
    if (failedStates.has(stateKey)) {
      return { status: 'UNSOLVABLE' };
    }

    nodesExpanded += 1;
    pathStates.add(stateKey);
    let unknownChild = false;

    for (const move of getSearchMoves(state)) {
      const child = applySearchMove(state, move);
      const childKey = createStateKey(child);
      if (pathStates.has(childKey) || failedStates.has(childKey)) {
        continue;
      }

      const result = visit(child, depth + 1);
      if (result.status === 'SOLVED') {
        pathStates.delete(stateKey);
        return { status: 'SOLVED', solution: [move, ...result.solution] };
      }
      if (result.status === 'UNKNOWN') {
        unknownChild = true;
      }
    }

    pathStates.delete(stateKey);
    if (unknownChild) {
      return { status: 'UNKNOWN' };
    }
    failedStates.add(stateKey);
    return { status: 'UNSOLVABLE' };
  };

  const result = visit(initialState, 0);
  if (result.status === 'SOLVED') {
    return createSolverResult({
      status: 'SOLVED',
      solution: result.solution,
      nodesExpanded,
      maxDepth: maximumDepth,
      elapsedMs: elapsed(),
      terminationReason: 'solved',
      provenOptimal: result.solution.length === 0,
    });
  }
  if (result.status === 'UNSOLVABLE') {
    return createSolverResult({
      status: 'UNSOLVABLE',
      nodesExpanded,
      maxDepth: maximumDepth,
      elapsedMs: elapsed(),
      terminationReason: 'exhausted',
      provenOptimal: false,
    });
  }
  return createSolverResult({
    status: 'UNKNOWN',
    nodesExpanded,
    maxDepth: maximumDepth,
    elapsedMs: elapsed(),
    terminationReason: limitReason ?? 'depth-limit',
    provenOptimal: false,
  });
}
