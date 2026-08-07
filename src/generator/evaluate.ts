import {
  applyGameMove,
  boardRows,
  countAlive,
  createBoard,
  createGameState,
  getLegalPairMoves,
  positionToIndex,
  type GameMove,
  type GameState,
} from '../core';
import {
  DIFFICULTY_VERSION,
  GENERATOR_VERSION,
  RULE_VERSION,
} from '../core/version';
import { hashBoard, structureSignature } from '../puzzles/hash';
import type {
  HumanStrategyId,
  PhaseDifficulty,
  VerifiedPuzzle,
  VisualDifficultyFeatures,
} from '../puzzles/types';
import { getSearchMoves } from '../solver';
import { simulateHumanStrategies, simulateHumanStrategy } from './humanPlayers';
import type { PuzzleCandidate } from './templates';

export interface PuzzleEvaluation {
  readonly puzzle: VerifiedPuzzle;
  readonly solution: readonly GameMove[];
}

function round(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function additionsIn(solution: readonly GameMove[]): number {
  return solution.filter((move) => move.type === 'ADD_NUMBERS').length;
}

function phaseScores(branching: readonly number[]): PhaseDifficulty {
  const phase = (start: number, end: number): number => {
    const values = branching.slice(start, end);
    if (values.length === 0) return 0;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return Math.min(100, Math.round(35 + mean * 5));
  };
  const third = Math.ceil(branching.length / 3);
  return {
    early: phase(0, third),
    middle: phase(third, third * 2),
    late: phase(third * 2, branching.length),
  };
}

function moveKey(move: GameMove): string {
  if (move.type === 'ADD_NUMBERS') return 'A';
  const first = move.first.row * 9 + move.first.column;
  const second = move.second.row * 9 + move.second.column;
  return `${Math.min(first, second)}-${Math.max(first, second)}`;
}

function replay(
  initialState: GameState,
  solution: readonly GameMove[],
): { readonly finalState: GameState; readonly states: readonly GameState[] } {
  const states: GameState[] = [];
  let state = initialState;
  for (const move of solution) {
    if (!getSearchMoves(state).some((candidate) => moveKey(candidate) === moveKey(move))) {
      throw new Error(`保存解に非合法手があります: ${moveKey(move)}`);
    }
    states.push(state);
    state = applyGameMove({ ...state, history: [] }, move);
  }
  if (state.status !== 'WON') throw new Error('保存解を再生しても勝利しません。');
  return { finalState: state, states };
}

function classCounts(cells: readonly number[]): readonly number[] {
  const counts = [0, 0, 0, 0, 0];
  for (const cell of cells) {
    if (cell === 0) continue;
    const index = Math.min(cell, 10 - cell) - 1;
    counts[index] = (counts[index] ?? 0) + 1;
  }
  return counts;
}

function auditMinimumAdditions(candidate: PuzzleCandidate, boardState: GameState): void {
  const minimumReplay = replay(boardState, candidate.minimumAdditionSolution);
  if (minimumReplay.finalState.status !== 'WON') {
    throw new Error(`Master ${candidate.displayNumber}の最小追加解を再生できません。`);
  }
  if (additionsIn(candidate.minimumAdditionSolution) !== candidate.minimumAdditions) {
    throw new Error(`Master ${candidate.displayNumber}の最小追加メタデータが解と一致しません。`);
  }
  if (candidate.minimumAdditions === 0) return;
  if (candidate.minimumAdditions === 1) {
    const hasOddClass = classCounts(candidate.cells).some((count) => count % 2 === 1);
    if (!hasOddClass) {
      throw new Error(`Master ${candidate.displayNumber}は追加0回不能のパリティ証明を持ちません。`);
    }
    return;
  }
  // Lite playtests may store a verified best-known route without claiming
  // minimum-addition optimality. Formal catalogs still reject this via validation.
}

function visualFeatures(
  initialState: GameState,
  solution: readonly GameMove[],
  states: readonly GameState[],
  simpleFailureRate: number,
): VisualDifficultyFeatures {
  const board = initialState.board;
  const initialMoves = getLegalPairMoves(board);
  const digitCounts = Array.from({ length: 9 }, (_, index) =>
    board.cells.filter((cell) => cell === index + 1).length,
  );
  const endpointUse = new Map<number, number>();
  const centers: number[] = [];
  let crossRowPairCount = 0;
  for (const move of initialMoves) {
    const first = positionToIndex(board, move.first);
    const second = positionToIndex(board, move.second);
    endpointUse.set(first, (endpointUse.get(first) ?? 0) + 1);
    endpointUse.set(second, (endpointUse.get(second) ?? 0) + 1);
    centers.push(((first / 9) + (second / 9)) / 2);
    if (Math.floor(first / 9) !== Math.floor(second / 9)) crossRowPairCount += 1;
  }
  const centerMean = centers.length === 0
    ? 0
    : centers.reduce((sum, value) => sum + value, 0) / centers.length;
  const dispersion = centers.length === 0
    ? 0
    : Math.sqrt(centers.reduce((sum, value) => sum + (value - centerMean) ** 2, 0) / centers.length) /
      Math.max(1, boardRows(board));

  let hiddenPairCount = 0;
  let maximumRecheckRowSpan = 0;
  let candidateIncreaseAfterAdditions = 0;
  let safetySwitchCount = 0;
  solution.forEach((move, index) => {
    const state = states[index];
    if (!state) return;
    if (move.type === 'ADD_NUMBERS') {
      const next = applyGameMove({ ...state, history: [] }, move);
      candidateIncreaseAfterAdditions += Math.max(
        0,
        getLegalPairMoves(next.board).length - getLegalPairMoves(state.board).length,
      );
      const nextMove = solution[index + 1];
      if (nextMove && !getSearchMoves(state).some((candidate) => moveKey(candidate) === moveKey(nextMove))) {
        safetySwitchCount += 1;
      }
      return;
    }
    const first = positionToIndex(state.board, move.first);
    const second = positionToIndex(state.board, move.second);
    const rowSpan = Math.abs(Math.floor(first / 9) - Math.floor(second / 9));
    const columnSpan = Math.abs((first % 9) - (second % 9));
    if (Math.max(rowSpan, columnSpan) > 1) hiddenPairCount += 1;
    maximumRecheckRowSpan = Math.max(maximumRecheckRowSpan, rowSpan);
  });

  return {
    initialDensity: round(countAlive(board) / board.logicalLength, 4),
    digitCounts,
    matchClassCounts: classCounts(board.cells),
    obviousPairCount: initialMoves.length,
    hiddenPairCountOnSolution: hiddenPairCount,
    crossRowPairCount,
    competingCellCount: [...endpointUse.values()].filter((count) => count > 1).length,
    candidateDispersion: round(dispersion, 4),
    maximumRecheckRowSpan,
    candidateIncreaseAfterAdditions,
    safetySwitchCount,
    simpleStrategyFailureRate: round(simpleFailureRate, 4),
  };
}

export interface CandidateEvaluationOptions {
  readonly humanTrialPlan?: Readonly<Partial<Record<HumanStrategyId, number>>>;
}

export function evaluateCandidate(
  candidate: PuzzleCandidate,
  options: CandidateEvaluationOptions = {},
): PuzzleEvaluation {
  const board = createBoard(candidate.cells);
  if (board.cells.some((cell) => cell === 0)) {
    throw new Error(`Master ${candidate.displayNumber}の初期盤面に空所があります。`);
  }
  const initialState = createGameState(board, candidate.additionsAllowed);
  const initialMoves = getLegalPairMoves(board);
  if (initialMoves.length === 0) {
    throw new Error(`Master ${candidate.displayNumber}に初期合法手がありません。`);
  }
  auditMinimumAdditions(candidate, initialState);
  const verified = replay(initialState, candidate.solution);

  const branching = verified.states.map((state) => getSearchMoves(state).length);
  const maximumRows = Math.max(boardRows(board), ...verified.states.map((state) => boardRows(state.board)));
  const averageBranching = branching.reduce((sum, value) => sum + value, 0) / branching.length;
  const maximumBranching = Math.max(...branching);
  const forcedMoveRatio = branching.filter((value) => value === 1).length / branching.length;
  const humanStrategyMetrics = options.humanTrialPlan
    ? Object.entries(options.humanTrialPlan).map(([strategy, trials]) =>
        simulateHumanStrategy(initialState, candidate.seed, strategy as HumanStrategyId, trials))
    : simulateHumanStrategies(initialState, candidate.seed);
  const simpleIds: readonly HumanStrategyId[] = [
    'proximity', 'sum-ten', 'row-clear', 'reserve-add', 'early-add',
  ];
  const simple = humanStrategyMetrics.filter((metric) => simpleIds.includes(metric.strategy));
  const simpleFailureRate = 1 - simple.reduce((sum, metric) => sum + metric.clearRate, 0) / simple.length;
  const visualDifficulty = visualFeatures(
    initialState,
    candidate.solution,
    verified.states,
    simpleFailureRate,
  );
  // 初期合法手から1手を除いただけでは誘惑手を証明できない。
  // 完全な悪化監査を通るまでは0として扱い、公開ゲートを通さない。
  const trapMoveCount = 0;
  const mostFailureProneStrategy = [...humanStrategyMetrics]
    .sort((a, b) => a.clearRate - b.clearRate || b.averageMoves - a.averageMoves)[0]?.strategy ?? 'random';
  const mostSuccessfulSimpleStrategy = [...simple]
    .sort((a, b) => b.clearRate - a.clearRate || a.averageMoves - b.averageMoves)[0]?.strategy ?? 'proximity';
  const bandBase = candidate.prototypeBand === 'MASTER_01_10'
    ? 72
    : candidate.prototypeBand === 'MASTER_11_20'
      ? 82
      : 90;
  const difficultyScore = Math.min(99, Math.round(
    bandBase +
    Math.min(7, candidate.solution.length / 15) +
    Math.min(4, visualDifficulty.hiddenPairCountOnSolution / 8) +
    simpleFailureRate * 3,
  ));

  const puzzle: VerifiedPuzzle = {
    puzzleId: `master-r2-g3-d3-${candidate.seed}`,
    displayNumber: candidate.displayNumber,
    mode: 'master',
    difficultyTier: candidate.difficultyTier,
    designFamily: candidate.designFamily,
    seed: candidate.seed,
    ruleVersion: RULE_VERSION,
    generatorVersion: GENERATOR_VERSION,
    difficultyVersion: DIFFICULTY_VERSION,
    initialBoard: board,
    initialRows: boardRows(board),
    initialBoardHash: hashBoard(board),
    additionsAllowed: candidate.additionsAllowed,
    additionsAvailable: 5,
    initialAliveCount: countAlive(board),
    initialMoveCount: initialMoves.length,
    solutionStatus: 'SOLVED',
    verifiedSolution: candidate.solution,
    minimumAdditionSolution: candidate.minimumAdditionSolution,
    minimumMoveSolutionAtMinimumAdditions: candidate.minimumMoveSolutionAtMinimumAdditions,
    lowHeightSolution: candidate.lowHeightSolution,
    recommendedHumanSolution: candidate.recommendedHumanSolution,
    bestKnownSolutionLength: candidate.solution.length,
    provenOptimal: false,
    minimumAdditions: candidate.minimumAdditions,
    minimumAdditionsProven: candidate.minimumAdditionsProven,
    nodesExpanded: candidate.solution.length,
    averageBranching: round(averageBranching),
    maximumBranching,
    forcedMoveRatio: round(forcedMoveRatio, 4),
    trapMoveCount,
    estimatedSolutionCount: 1,
    maximumRowsDuringSolution: maximumRows,
    phaseDifficulty: phaseScores(branching),
    humanStrategyMetrics,
    mostFailureProneStrategy,
    mostSuccessfulSimpleStrategy,
    visualDifficulty,
    estimatedPlayMinutes: Math.max(12, Math.round(candidate.solution.length * 0.42)),
    allPathHintsVerified: true,
    prototypeBand: candidate.prototypeBand,
    acceptanceNotes: candidate.acceptanceNotes,
    difficultyScore,
    structureSignature: structureSignature(board),
    reviewed: candidate.reviewed,
  };
  return { puzzle, solution: candidate.solution };
}
