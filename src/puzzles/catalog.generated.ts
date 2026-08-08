import {
  DIFFICULTY_VERSION,
  GENERATOR_VERSION,
  RULE_VERSION,
  createBoard,
  getLegalPairMoves,
  type Cell,
} from '../core';
import {
  CATALOG_VERSION,
  MASTER_CATALOG_DATA,
  MASTER_CATALOG_ROUTES,
} from './catalog.data.generated';
import { structureSignature } from './hash';
import { decodeMasterSolution } from './masterSolutionRoutes';
import type { VerifiedPuzzle } from './types';

const ROUTES = MASTER_CATALOG_ROUTES.map(decodeMasterSolution);
const ACCEPTANCE_NOTES = [
  'Selected deterministically from the master-evolution-v1-b 60-minute ledger.',
  'Known route replayed to WON with exactly five ADD_NUMBERS under RULE 2.1.0.',
  'Exactly-five is a verified known route property, not a minimum-additions proof.',
] as const;

function decodeCells(encoded: string): readonly Cell[] {
  if (encoded.length !== 42) throw new Error(`Invalid MASTER board length: ${encoded.length}`);
  return [...encoded].map((digit) => {
    const cell = Number(digit);
    if (!Number.isInteger(cell) || cell < 1 || cell > 9) {
      throw new Error(`Invalid MASTER board cell: ${digit}`);
    }
    return cell as Cell;
  });
}

function digitCounts(cells: readonly Cell[]): readonly number[] {
  const counts = Array.from({ length: 9 }, () => 0);
  for (const cell of cells) counts[cell - 1] = (counts[cell - 1] ?? 0) + 1;
  return counts;
}

export { CATALOG_VERSION };

export const PUZZLES: readonly VerifiedPuzzle[] = MASTER_CATALOG_DATA.map((row, index) => {
  const [puzzleId, initialBoardHash, encodedCells, routeIndex, encodedBand, difficultyScore] = row;
  const cells = decodeCells(encodedCells);
  const initialBoard = createBoard(cells);
  const route = ROUTES[routeIndex];
  if (!route) throw new Error(`Missing MASTER route ${routeIndex} for ${puzzleId}`);
  const difficulty = difficultyScore / 100;
  return {
    puzzleId,
    displayNumber: index + 1,
    mode: 'master',
    difficultyTier: 'MASTER',
    internalBand: encodedBand === 'e' ? 'elite-master' : 'normal-master',
    designFamily: 'multi-add-realignment',
    seed: `${CATALOG_VERSION}|${puzzleId}`,
    ruleVersion: RULE_VERSION,
    generatorVersion: GENERATOR_VERSION,
    difficultyVersion: DIFFICULTY_VERSION,
    initialBoard,
    initialRows: 5,
    initialBoardHash,
    additionsAllowed: 5,
    additionsAvailable: 5,
    initialAliveCount: 42,
    initialMoveCount: getLegalPairMoves(initialBoard).length,
    solutionStatus: 'SOLVED',
    verifiedSolution: route,
    minimumAdditionSolution: route,
    minimumMoveSolutionAtMinimumAdditions: route,
    lowHeightSolution: route,
    recommendedHumanSolution: route,
    bestKnownSolutionLength: route.length,
    provenOptimal: false,
    minimumAdditions: 5,
    minimumAdditionsProven: false,
    nodesExpanded: 0,
    averageBranching: 0,
    maximumBranching: 0,
    forcedMoveRatio: 0,
    trapMoveCount: 0,
    estimatedSolutionCount: 1,
    maximumRowsDuringSolution: 0,
    phaseDifficulty: { early: difficulty, middle: difficulty, late: difficulty },
    humanStrategyMetrics: [],
    mostFailureProneStrategy: 'proximity',
    mostSuccessfulSimpleStrategy: 'lookahead-2',
    visualDifficulty: {
      initialDensity: 1,
      digitCounts: digitCounts(cells),
      matchClassCounts: [],
      obviousPairCount: getLegalPairMoves(initialBoard).length,
      hiddenPairCountOnSolution: 0,
      crossRowPairCount: 0,
      competingCellCount: 0,
      candidateDispersion: 0,
      maximumRecheckRowSpan: 0,
      candidateIncreaseAfterAdditions: 0,
      safetySwitchCount: 0,
      simpleStrategyFailureRate: difficulty,
    },
    estimatedPlayMinutes: Math.max(10, Math.round(8 + difficultyScore / 5)),
    allPathHintsVerified: true,
    prototypeBand: 'MASTER_21_30',
    acceptanceNotes: ACCEPTANCE_NOTES,
    difficultyScore,
    structureSignature: structureSignature(initialBoard),
    reviewed: true,
  };
});
