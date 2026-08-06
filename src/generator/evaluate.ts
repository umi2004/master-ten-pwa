import {
  applyGameMove,
  boardRows,
  countAlive,
  createBoard,
  createGameState,
  getLegalPairMoves,
  type GameMove,
  type GameState,
} from '../core';
import { hashBoard, structureSignature } from '../puzzles/hash';
import type { PhaseDifficulty, VerifiedPuzzle } from '../puzzles/types';
import { solveWithDfs, type SolverResult } from '../solver';
import {
  DIFFICULTY_VERSION,
  GENERATOR_VERSION,
  RULE_VERSION,
} from '../core/version';
import type { PuzzleCandidate } from './templates';

const SOLVER_LIMITS = {
  now: () => 0,
  timeLimitMs: 1_000_000,
  nodeLimit: 2_000_000,
  maxDepth: 300,
} as const;

export interface PuzzleEvaluation {
  readonly puzzle: VerifiedPuzzle;
  readonly solution: readonly GameMove[];
}

function additionsIn(solution: readonly GameMove[]): number {
  return solution.filter((move) => move.type === 'ADD_NUMBERS').length;
}

function round(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function phaseScores(branching: readonly number[]): PhaseDifficulty {
  const phase = (start: number, end: number): number => {
    const values = branching.slice(start, end);
    if (values.length === 0) return 0;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return Math.min(100, Math.round(38 + mean * 7));
  };
  const third = Math.ceil(branching.length / 3);
  return {
    early: phase(0, third),
    middle: phase(third, third * 2),
    late: phase(third * 2, branching.length),
  };
}

function solve(state: GameState): SolverResult {
  return solveWithDfs(state, SOLVER_LIMITS);
}

function findMinimumAdditions(candidate: PuzzleCandidate): {
  minimum: number;
  proven: boolean;
  result: SolverResult;
} {
  let allLowerProven = true;
  for (let additions = 0; additions <= candidate.additionsAllowed; additions += 1) {
    const result = solve(createGameState(createBoard(candidate.cells), additions));
    if (result.status === 'SOLVED') {
      return { minimum: additionsIn(result.solution), proven: allLowerProven, result };
    }
    if (result.status === 'UNKNOWN') {
      allLowerProven = false;
    }
  }
  return {
    minimum: candidate.additionsAllowed,
    proven: false,
    result: solve(createGameState(createBoard(candidate.cells), candidate.additionsAllowed)),
  };
}

function initialMoveAudit(
  initialState: GameState,
  bestKnownLength: number,
  minimumAdditions: number,
): { traps: number; safeAlternatives: number } {
  let traps = 0;
  let safeAlternatives = 0;
  for (const move of getLegalPairMoves(initialState.board)) {
    const child = applyGameMove(initialState, move);
    const result = solve(child);
    if (result.status === 'UNKNOWN') {
      throw new Error('初期誘惑手監査がUNKNOWNになりました。');
    }
    if (result.status === 'UNSOLVABLE') {
      traps += 1;
      continue;
    }
    const additions = additionsIn(result.solution);
    const worsened = additions > minimumAdditions || result.solution.length + 1 > bestKnownLength * 1.5;
    if (worsened) {
      traps += 1;
    } else {
      safeAlternatives += 1;
    }
  }
  return { traps, safeAlternatives };
}

export function evaluateCandidate(candidate: PuzzleCandidate): PuzzleEvaluation {
  const board = createBoard(candidate.cells);
  const initialState = createGameState(board, candidate.additionsAllowed);
  const initialMoves = getLegalPairMoves(initialState.board);
  if (initialMoves.length === 0) {
    throw new Error(`問題${candidate.displayNumber}に初期合法手がありません。`);
  }

  const minimum = findMinimumAdditions(candidate);
  const result = minimum.result;
  if (result.status !== 'SOLVED') {
    throw new Error(`問題${candidate.displayNumber}の可解性を証明できません: ${result.status}`);
  }

  let state = initialState;
  let maximumRows = boardRows(state.board);
  const branching: number[] = [];
  for (const move of result.solution) {
    branching.push(getLegalPairMoves(state.board).length || 1);
    state = applyGameMove(state, move);
    maximumRows = Math.max(maximumRows, boardRows(state.board));
  }
  if (state.status !== 'WON') {
    throw new Error(`問題${candidate.displayNumber}の保存解を再生できません。`);
  }

  const averageBranching = branching.reduce((sum, value) => sum + value, 0) / branching.length;
  const maximumBranching = Math.max(...branching);
  const forcedMoveRatio = branching.filter((value) => value === 1).length / branching.length;
  const audit = initialMoveAudit(initialState, result.solution.length, minimum.minimum);
  const rawDifficulty =
    48 +
    Math.min(18, result.solution.length * 0.45) +
    minimum.minimum * 5 +
    Math.min(12, audit.traps * 3) +
    Math.min(8, maximumBranching * 0.6) +
    Math.min(6, (1 - forcedMoveRatio) * 6) +
    Math.min(5, Math.max(0, maximumRows - 8));
  const difficultyScore = Math.min(94, Math.round(rawDifficulty));

  const puzzle: VerifiedPuzzle = {
    puzzleId: `master-r1-g1-d1-${candidate.seed}`,
    displayNumber: candidate.displayNumber,
    mode: 'master',
    designFamily: candidate.designFamily,
    seed: candidate.seed,
    ruleVersion: RULE_VERSION,
    generatorVersion: GENERATOR_VERSION,
    difficultyVersion: DIFFICULTY_VERSION,
    initialBoard: board,
    initialRows: boardRows(board),
    initialBoardHash: hashBoard(board),
    additionsAllowed: candidate.additionsAllowed,
    initialAliveCount: countAlive(board),
    initialMoveCount: initialMoves.length,
    solutionStatus: 'SOLVED',
    bestKnownSolutionLength: result.solution.length,
    provenOptimal: result.provenOptimal,
    minimumAdditions: minimum.minimum,
    minimumAdditionsProven: minimum.proven,
    nodesExpanded: result.nodesExpanded,
    averageBranching: round(averageBranching),
    maximumBranching,
    forcedMoveRatio: round(forcedMoveRatio, 4),
    trapMoveCount: audit.traps,
    estimatedSolutionCount: Math.max(1, audit.safeAlternatives),
    maximumRowsDuringSolution: maximumRows,
    phaseDifficulty: phaseScores(branching),
    difficultyScore,
    structureSignature: structureSignature(board),
    reviewed: candidate.reviewed,
  };
  return { puzzle, solution: result.solution };
}
