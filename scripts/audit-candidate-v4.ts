import {
  applyGameMove,
  boardRows,
  countAlive,
  createBoard,
  createGameState,
  getLegalPairMoves,
  type GameMove,
  type GameState,
} from '../src/core';
import { generateCandidate } from '../src/generator/templates';
import { HintEngine } from '../src/hints';
import { hashBoard, structureSignature } from '../src/puzzles/hash';
import { PUZZLES } from '../src/puzzles/catalog.generated';
import { applySearchMove, getSearchMoves, solveAtAdditionCap, solveWithDfs } from '../src/solver';

function replay(initial: GameState, solution: readonly GameMove[]): {
  readonly won: boolean;
  readonly maximumRows: number;
  readonly allHintsVerified: boolean;
} {
  const hints = new HintEngine();
  const primed = hints.prime(initial, solution);
  let allHintsVerified = primed;
  let state = initial;
  let maximumRows = boardRows(state.board);
  for (const expected of solution) {
    const hint = hints.getHint(state);
    if (hint.status !== 'SAFE_MOVE' || JSON.stringify(hint.move) !== JSON.stringify(expected)) {
      allHintsVerified = false;
    }
    state = applyGameMove({ ...state, history: [] }, expected);
    maximumRows = Math.max(maximumRows, boardRows(state.board));
  }
  return { won: state.status === 'WON', maximumRows, allHintsVerified };
}

const candidate = generateCandidate(0);
const puzzle = PUZZLES[0];
if (!puzzle) throw new Error('V4 prototype is missing from the local catalog.');
const board = createBoard(candidate.cells);
const initial = createGameState(board, 5);
const capProofs = [];
for (let cap = 0; cap <= 5; cap += 1) {
  const result = solveWithDfs(createGameState(board, cap), {
    nodeLimit: 10_000_000,
    timeLimitMs: 30_000,
    maxDepth: 320,
  });
  capProofs.push({
    cap,
    status: result.status,
    nodes: result.nodesExpanded,
    elapsedMs: Math.round(result.elapsedMs),
    length: result.solution.length,
    additions: result.solution.filter((move) => move.type === 'ADD_NUMBERS').length,
    reason: result.terminationReason,
  });
}

const bfsObjective = solveAtAdditionCap(initial, 1, {
  nodeLimit: 500_000,
  timeLimitMs: 15_000,
  maxDepth: 120,
});
const firstMoveReachability = getSearchMoves(initial).map((move) => {
  const child = applySearchMove(initial, move);
  const result = solveWithDfs(child, {
    nodeLimit: 2_000_000,
    timeLimitMs: 10_000,
    maxDepth: 260,
  });
  return {
    move,
    status: result.status,
    nodes: result.nodesExpanded,
    reason: result.terminationReason,
  };
});

console.log(JSON.stringify({
  identity: {
    seed: candidate.seed,
    boardHash: hashBoard(board),
    structureSignature: structureSignature(board),
  },
  initial: {
    alive: countAlive(board),
    rows: boardRows(board),
    density: countAlive(board) / board.logicalLength,
    legalPairs: getLegalPairMoves(board).length,
    legalTransitions: getSearchMoves(initial).length,
  },
  capProofs,
  objectiveSearch: {
    cap: 1,
    status: bfsObjective.status,
    nodes: bfsObjective.nodesExpanded,
    elapsedMs: Math.round(bfsObjective.elapsedMs),
    terminationReason: bfsObjective.terminationReason,
    minimumMoves: bfsObjective.minimumMoves,
    minimumMaximumRows: bfsObjective.minimumMaximumRows,
    proven: bfsObjective.objectiveProven,
  },
  paths: {
    minimumAddition: {
      length: candidate.minimumAdditionSolution.length,
      additions: candidate.minimumAdditionSolution.filter((move) => move.type === 'ADD_NUMBERS').length,
      ...replay(initial, candidate.minimumAdditionSolution),
    },
    minimumMoveAtMinimumAdditions: {
      length: candidate.minimumMoveSolutionAtMinimumAdditions.length,
      proven: false,
      ...replay(initial, candidate.minimumMoveSolutionAtMinimumAdditions),
    },
    lowHeight: {
      length: candidate.lowHeightSolution.length,
      proven: false,
      ...replay(initial, candidate.lowHeightSolution),
    },
    recommendedHuman: {
      length: candidate.recommendedHumanSolution.length,
      additions: candidate.recommendedHumanSolution.filter((move) => move.type === 'ADD_NUMBERS').length,
      ...replay(initial, candidate.recommendedHumanSolution),
    },
  },
  firstMoveReachability,
  human: puzzle.humanStrategyMetrics,
  reviewed: puzzle.reviewed,
}));
