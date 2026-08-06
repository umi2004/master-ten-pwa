import type { GameMove, GameState } from '../core';
import { resolveLimits } from './limits';
import { createSolverResult } from './result';
import {
  applySearchMove,
  createStateKey,
  getSearchMoves,
} from './searchState';
import type { SolverLimits, SolverResult } from './types';

interface QueueNode {
  readonly state: GameState;
  readonly path: readonly GameMove[];
  readonly depth: number;
}

export function solveWithBfs(
  initialState: GameState,
  requestedLimits: SolverLimits = {},
): SolverResult {
  const limits = resolveLimits(requestedLimits);
  const startedAt = limits.now();
  const elapsed = (): number => limits.now() - startedAt;

  if (initialState.status === 'WON') {
    return createSolverResult({
      status: 'SOLVED',
      nodesExpanded: 0,
      maxDepth: 0,
      elapsedMs: elapsed(),
      terminationReason: 'solved',
      provenOptimal: true,
    });
  }
  if (initialState.status === 'LOST') {
    return createSolverResult({
      status: 'UNSOLVABLE',
      nodesExpanded: 0,
      maxDepth: 0,
      elapsedMs: elapsed(),
      terminationReason: 'exhausted',
      provenOptimal: false,
    });
  }

  const queue: QueueNode[] = [{ state: initialState, path: [], depth: 0 }];
  const visited = new Set([createStateKey(initialState)]);
  let cursor = 0;
  let nodesExpanded = 0;
  let maximumDepth = 0;
  let depthLimited = false;

  while (cursor < queue.length) {
    const node = queue[cursor];
    cursor += 1;
    if (!node) {
      break;
    }

    maximumDepth = Math.max(maximumDepth, node.depth);
    if (node.state.status === 'WON') {
      return createSolverResult({
        status: 'SOLVED',
        solution: node.path,
        nodesExpanded,
        maxDepth: maximumDepth,
        elapsedMs: elapsed(),
        terminationReason: 'solved',
        provenOptimal: true,
      });
    }

    if (elapsed() >= limits.timeLimitMs) {
      return createSolverResult({
        status: 'UNKNOWN',
        nodesExpanded,
        maxDepth: maximumDepth,
        elapsedMs: elapsed(),
        terminationReason: 'time-limit',
      });
    }
    if (node.depth >= limits.maxDepth) {
      depthLimited = true;
      continue;
    }
    if (nodesExpanded >= limits.nodeLimit) {
      return createSolverResult({
        status: 'UNKNOWN',
        nodesExpanded,
        maxDepth: maximumDepth,
        elapsedMs: elapsed(),
        terminationReason: 'node-limit',
      });
    }

    nodesExpanded += 1;
    for (const move of getSearchMoves(node.state)) {
      const child = applySearchMove(node.state, move);
      const key = createStateKey(child);
      if (visited.has(key)) {
        continue;
      }
      visited.add(key);
      queue.push({
        state: child,
        path: [...node.path, move],
        depth: node.depth + 1,
      });
    }
  }

  return createSolverResult({
    status: depthLimited ? 'UNKNOWN' : 'UNSOLVABLE',
    nodesExpanded,
    maxDepth: maximumDepth,
    elapsedMs: elapsed(),
    terminationReason: depthLimited ? 'depth-limit' : 'exhausted',
    provenOptimal: false,
  });
}
