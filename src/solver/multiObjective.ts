import { boardRows, createGameState, type GameMove, type GameState } from '../core';
import {
  applySearchMove,
  countSolutionAdditions,
  createStateKey,
  getSearchMoves,
  hasOddMatchClassWithoutAddition,
} from './searchState';
import type {
  AdditionCapProof,
  FirstMoveAnalysis,
  LexicographicObjective,
  MultiObjectiveSolverResult,
  MinimumAdditionProofSummary,
  SolverLimits,
  SolverStatus,
  TerminationReason,
} from './types';

export function summarizeAdditionCapProofs(
  proofs: readonly AdditionCapProof[],
): MinimumAdditionProofSummary {
  const ordered = [...proofs].sort((first, second) => first.additionsAvailable - second.additionsAvailable);
  const solved = ordered.find((proof) => proof.status === 'SOLVED');
  if (!solved) {
    return {
      status: ordered.some((proof) => proof.status === 'UNKNOWN') ? 'UNKNOWN' : 'UNSOLVABLE',
      minimumAdditions: null,
      minimumAdditionsProven: false,
    };
  }
  const lower = ordered.filter((proof) => proof.additionsAvailable < solved.additionsAvailable);
  return {
    status: 'SOLVED',
    minimumAdditions: solved.additionsAvailable,
    minimumAdditionsProven: lower.length === solved.additionsAvailable
      && lower.every((proof) => proof.status === 'UNSOLVABLE'),
  };
}

interface QueueEntry {
  readonly state: GameState;
  readonly path: readonly GameMove[];
  readonly maximumRows: number;
}

interface CapSearchResult extends AdditionCapProof {
  readonly minimumMoves: number | null;
  readonly minimumMaximumRows: number | null;
  readonly objectiveProven: boolean;
}

function elapsed(start: number, now: () => number): number {
  return Math.max(0, now() - start);
}

function stateWithAdditionCap(state: GameState, cap: number): GameState {
  return createGameState(state.board, cap);
}

/**
 * Exhaustive breadth-first search for one fixed addition allowance. The first
 * solved depth proves minimum moves; processing that whole depth and retaining
 * the lowest path maximum proves the third lexicographic objective.
 */
export function solveAtAdditionCap(
  initialState: GameState,
  additionsAvailable: number,
  limits: SolverLimits = {},
): CapSearchResult {
  const now = limits.now ?? Date.now;
  const start = now();
  const initial = stateWithAdditionCap(initialState, additionsAvailable);
  const initialRows = boardRows(initial.board);
  const queue: QueueEntry[] = [{ state: initial, path: [], maximumRows: initialRows }];
  const visited = new Map<string, { readonly depth: number; readonly maximumRows: number }>();
  visited.set(createStateKey(initial), { depth: 0, maximumRows: initialRows });
  let cursor = 0;
  let nodesExpanded = 0;
  let bestGoal: QueueEntry | undefined;
  let solvedDepth: number | undefined;
  let maximumDepthSeen = 0;
  let depthLimited = false;

  const finish = (
    status: SolverStatus,
    terminationReason: TerminationReason,
    objectiveProven: boolean,
  ): CapSearchResult => ({
    additionsAvailable,
    status,
    solution: bestGoal?.path ?? [],
    minimumMoves: bestGoal?.path.length ?? null,
    minimumMaximumRows: bestGoal?.maximumRows ?? null,
    nodesExpanded,
    elapsedMs: elapsed(start, now),
    terminationReason,
    objectiveProven,
  });

  while (cursor < queue.length) {
    const entry = queue[cursor];
    cursor += 1;
    if (!entry) continue;
    const depth = entry.path.length;
    maximumDepthSeen = Math.max(maximumDepthSeen, depth);

    if (solvedDepth !== undefined && depth > solvedDepth) {
      return finish('SOLVED', 'solved', true);
    }
    if (limits.nodeLimit !== undefined && nodesExpanded >= limits.nodeLimit) {
      return finish(bestGoal ? 'SOLVED' : 'UNKNOWN', 'node-limit', false);
    }
    if (limits.timeLimitMs !== undefined && elapsed(start, now) >= limits.timeLimitMs) {
      return finish(bestGoal ? 'SOLVED' : 'UNKNOWN', 'time-limit', false);
    }
    if (limits.maxDepth !== undefined && depth > limits.maxDepth) {
      depthLimited = true;
      continue;
    }

    nodesExpanded += 1;
    if (entry.state.status === 'WON') {
      solvedDepth = depth;
      if (!bestGoal || entry.maximumRows < bestGoal.maximumRows) bestGoal = entry;
      continue;
    }
    if (solvedDepth !== undefined || entry.state.status !== 'PLAYING') continue;
    if (hasOddMatchClassWithoutAddition(entry.state)) continue;
    if (limits.maxDepth !== undefined && depth === limits.maxDepth) {
      if (getSearchMoves(entry.state).length > 0) depthLimited = true;
      continue;
    }

    for (const move of getSearchMoves(entry.state)) {
      const child = applySearchMove(entry.state, move);
      const childDepth = depth + 1;
      const childMaximumRows = Math.max(entry.maximumRows, boardRows(child.board));
      const key = createStateKey(child);
      const previous = visited.get(key);
      if (
        previous
        && (previous.depth < childDepth
          || (previous.depth === childDepth && previous.maximumRows <= childMaximumRows))
      ) {
        continue;
      }
      visited.set(key, { depth: childDepth, maximumRows: childMaximumRows });
      queue.push({
        state: child,
        path: [...entry.path, move],
        maximumRows: childMaximumRows,
      });
    }
  }

  if (bestGoal) return finish('SOLVED', 'solved', true);
  if (depthLimited || (limits.maxDepth !== undefined && maximumDepthSeen > limits.maxDepth)) {
    return finish('UNKNOWN', 'depth-limit', false);
  }
  return finish('UNSOLVABLE', 'exhausted', true);
}

function compareObjectives(first: LexicographicObjective, second: LexicographicObjective): number {
  if (first.additions !== second.additions) return first.additions - second.additions;
  if (first.moves !== second.moves) return first.moves - second.moves;
  return first.maximumRows - second.maximumRows;
}

function moveObjective(
  state: GameState,
  move: GameMove,
  child: MultiObjectiveSolverResult,
): LexicographicObjective | undefined {
  if (
    child.minimumAdditions === null
    || child.minimumMovesAtMinimumAdditions === null
    || child.minimumMaximumRows === null
  ) return undefined;
  return {
    additions: child.minimumAdditions + (move.type === 'ADD_NUMBERS' ? 1 : 0),
    moves: child.minimumMovesAtMinimumAdditions + 1,
    maximumRows: Math.max(boardRows(state.board), child.minimumMaximumRows),
  };
}

function emptyResult(
  status: SolverStatus,
  proofs: readonly AdditionCapProof[],
  nodesExpanded: number,
  elapsedMs: number,
  terminationReason: TerminationReason,
): MultiObjectiveSolverResult {
  return {
    status,
    minimumAdditions: null,
    minimumAdditionsProven: false,
    minimumMovesAtMinimumAdditions: null,
    minimumMovesProven: false,
    minimumMaximumRows: null,
    minimumMaximumRowsProven: false,
    minimumAdditionSolution: [],
    minimumMoveSolutionAtMinimumAdditions: [],
    lowHeightSolution: [],
    recommendedHumanSolution: [],
    optimalFirstMoves: [],
    recoverableFirstMoves: [],
    losingFirstMoves: [],
    unknownFirstMoves: [],
    firstMoveAnalyses: [],
    additionCapProofs: proofs,
    nodesExpanded,
    elapsedMs,
    terminationReason,
  };
}

function solveObjectiveCore(
  initialState: GameState,
  maximumAdditions: number,
  limits: SolverLimits,
): MultiObjectiveSolverResult {
  const now = limits.now ?? Date.now;
  const start = now();
  const capResults: CapSearchResult[] = [];
  let nodesExpanded = 0;
  let selected: CapSearchResult | undefined;
  let unknownLowerCap = false;

  for (let cap = 0; cap <= maximumAdditions; cap += 1) {
    const result = solveAtAdditionCap(initialState, cap, limits);
    capResults.push(result);
    nodesExpanded += result.nodesExpanded;
    if (result.status === 'UNKNOWN') unknownLowerCap = true;
    if (result.status === 'SOLVED') {
      selected = result;
      break;
    }
  }

  const proofs: readonly AdditionCapProof[] = capResults;
  if (!selected) {
    const unknown = capResults.find((result) => result.status === 'UNKNOWN');
    return emptyResult(
      unknown ? 'UNKNOWN' : 'UNSOLVABLE',
      proofs,
      nodesExpanded,
      elapsed(start, now),
      unknown?.terminationReason ?? 'exhausted',
    );
  }

  const minimumAdditions = countSolutionAdditions(selected.solution);
  const lowerCapsProven = !unknownLowerCap
    && capResults
      .filter((result) => result.additionsAvailable < minimumAdditions)
      .every((result) => result.status === 'UNSOLVABLE' && result.objectiveProven);
  const objectiveProven = lowerCapsProven && selected.objectiveProven;
  return {
    status: 'SOLVED',
    minimumAdditions,
    minimumAdditionsProven: lowerCapsProven,
    minimumMovesAtMinimumAdditions: selected.minimumMoves,
    minimumMovesProven: objectiveProven,
    minimumMaximumRows: selected.minimumMaximumRows,
    minimumMaximumRowsProven: objectiveProven,
    minimumAdditionSolution: [...selected.solution],
    minimumMoveSolutionAtMinimumAdditions: [...selected.solution],
    lowHeightSolution: [...selected.solution],
    recommendedHumanSolution: [...selected.solution],
    optimalFirstMoves: [],
    recoverableFirstMoves: [],
    losingFirstMoves: [],
    unknownFirstMoves: [],
    firstMoveAnalyses: [],
    additionCapProofs: proofs,
    nodesExpanded,
    elapsedMs: elapsed(start, now),
    terminationReason: selected.terminationReason,
  };
}

/**
 * Complete post-hoc first-move classification. It is intentionally kept out of
 * all human-player modules; those modules import only the pure transition API.
 */
export function solveMultiObjective(
  initialState: GameState,
  maximumAdditions = initialState.additionsRemaining,
  limits: SolverLimits = {},
  classifyFirstMoves = true,
): MultiObjectiveSolverResult {
  const now = limits.now ?? Date.now;
  const start = now();
  const baseline = solveObjectiveCore(initialState, maximumAdditions, limits);
  if (!classifyFirstMoves || baseline.status !== 'SOLVED') return baseline;
  if (
    baseline.minimumAdditions === null
    || baseline.minimumMovesAtMinimumAdditions === null
    || baseline.minimumMaximumRows === null
  ) return baseline;

  const baselineObjective: LexicographicObjective = {
    additions: baseline.minimumAdditions,
    moves: baseline.minimumMovesAtMinimumAdditions,
    maximumRows: baseline.minimumMaximumRows,
  };
  const analyses: FirstMoveAnalysis[] = [];
  let childNodes = 0;
  for (const move of getSearchMoves(initialState)) {
    const childState = applySearchMove(initialState, move);
    const childMaximum = childState.additionsRemaining;
    const child = solveObjectiveCore(childState, childMaximum, limits);
    childNodes += child.nodesExpanded;
    const objective = moveObjective(initialState, move, child);
    let classification: FirstMoveAnalysis['classification'];
    if (child.status === 'UNSOLVABLE') {
      classification = 'LOSING';
    } else if (
      child.status === 'SOLVED'
      && child.minimumAdditionsProven
      && child.minimumMovesProven
      && child.minimumMaximumRowsProven
      && objective
    ) {
      classification = compareObjectives(objective, baselineObjective) === 0
        ? 'OPTIMAL_SAFE'
        : 'RECOVERABLE';
    } else {
      classification = 'UNKNOWN';
    }
    analyses.push({
      move,
      classification,
      objective,
      status: child.status,
      terminationReason: child.terminationReason,
    });
  }

  const select = (classification: FirstMoveAnalysis['classification']): readonly GameMove[] => analyses
    .filter((analysis) => analysis.classification === classification)
    .map((analysis) => analysis.move);
  return {
    ...baseline,
    optimalFirstMoves: select('OPTIMAL_SAFE'),
    recoverableFirstMoves: select('RECOVERABLE'),
    losingFirstMoves: select('LOSING'),
    unknownFirstMoves: select('UNKNOWN'),
    firstMoveAnalyses: analyses,
    nodesExpanded: baseline.nodesExpanded + childNodes,
    elapsedMs: elapsed(start, now),
  };
}

export function compareLexicographicObjectives(
  first: LexicographicObjective,
  second: LexicographicObjective,
): number {
  return compareObjectives(first, second);
}
