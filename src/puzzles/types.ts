import type { Board, DifficultyVersion, GameMove, GeneratorVersion, RuleVersion } from '../core';

export type PuzzleSolutionStatus = 'SOLVED' | 'UNSOLVABLE' | 'UNKNOWN';
export type DifficultyTier = 'HARD' | 'MASTER' | 'EXTREME';
export type DesignFamily =
  | 'distributed-weave'
  | 'timing-crossroads'
  | 'complement-switchback'
  | 'row-boundary-lattice'
  | 'multi-add-realignment';

export type HumanStrategyId =
  | 'random'
  | 'proximity'
  | 'same-value'
  | 'sum-ten'
  | 'row-clear'
  | 'reserve-add'
  | 'early-add'
  | 'lookahead-2'
  | 'lookahead-3'
  | 'lookahead-4';

export type HumanFailureClassification =
  | 'EARLY_COLLAPSE'
  | 'LATE_NEAR_MISS'
  | 'LATE_LARGE_REMAINDER'
  | 'HEIGHT_OVERFLOW'
  | 'UNKNOWN';

export interface StrategyTrialMetrics {
  readonly strategy: HumanStrategyId;
  readonly trials: number;
  readonly clears: number;
  readonly clearRate: number;
  readonly clearRate95: {
    readonly lower: number;
    readonly upper: number;
  };
  readonly averageMoves: number;
  readonly averageAdditions: number;
  readonly averageAdditionsOnSuccess: number;
  readonly medianAdditionsOnSuccess: number;
  readonly successfulAdditionsDistribution: Readonly<Record<string, number>>;
  readonly averageMaximumRows: number;
  readonly failures: number;
  readonly earlyCollapseRate: number;
  readonly lateNearMissRate: number;
  readonly lateLargeRemainderRate: number;
  readonly heightOverflowRate: number;
  readonly unknownFailureRate: number;
  readonly nearMissRouteCount: number;
  readonly nearMissRate: number;
  readonly failureResidualAliveCount: number;
  readonly meanResidualAliveOnFailure: number;
  readonly medianResidualAliveOnFailure: number;
  readonly failureResidualAliveDistribution: Readonly<Record<string, number>>;
  readonly residualAliveHistogram: Readonly<Record<string, number>>;
  readonly failureRemainingAdditionsDistribution: Readonly<Record<string, number>>;
}

export interface VisualDifficultyFeatures {
  readonly initialDensity: number;
  readonly digitCounts: readonly number[];
  readonly matchClassCounts: readonly number[];
  readonly obviousPairCount: number;
  readonly hiddenPairCountOnSolution: number;
  readonly crossRowPairCount: number;
  readonly competingCellCount: number;
  readonly candidateDispersion: number;
  readonly maximumRecheckRowSpan: number;
  readonly candidateIncreaseAfterAdditions: number;
  readonly safetySwitchCount: number;
  readonly simpleStrategyFailureRate: number;
}

export interface PhaseDifficulty {
  readonly early: number;
  readonly middle: number;
  readonly late: number;
}

export interface VerifiedPuzzle {
  readonly puzzleId: string;
  readonly displayNumber: number;
  readonly mode: 'master';
  readonly difficultyTier: DifficultyTier;
  readonly internalBand?: 'normal-master' | 'elite-master';
  readonly designFamily: DesignFamily;
  readonly seed: string;
  readonly ruleVersion: RuleVersion;
  readonly generatorVersion: GeneratorVersion;
  readonly difficultyVersion: DifficultyVersion;
  readonly initialBoard: Board;
  readonly initialRows: number;
  readonly initialBoardHash: string;
  readonly additionsAllowed: number;
  readonly additionsAvailable: 5;
  readonly initialAliveCount: number;
  readonly initialMoveCount: number;
  readonly solutionStatus: PuzzleSolutionStatus;
  readonly verifiedSolution: readonly GameMove[];
  readonly minimumAdditionSolution: readonly GameMove[];
  readonly minimumMoveSolutionAtMinimumAdditions: readonly GameMove[];
  readonly lowHeightSolution: readonly GameMove[];
  readonly recommendedHumanSolution: readonly GameMove[];
  readonly bestKnownSolutionLength: number;
  readonly provenOptimal: boolean;
  readonly minimumAdditions: number;
  readonly minimumAdditionsProven: boolean;
  readonly nodesExpanded: number;
  readonly averageBranching: number;
  readonly maximumBranching: number;
  readonly forcedMoveRatio: number;
  readonly trapMoveCount: number;
  readonly estimatedSolutionCount: number;
  readonly maximumRowsDuringSolution: number;
  readonly phaseDifficulty: PhaseDifficulty;
  readonly humanStrategyMetrics: readonly StrategyTrialMetrics[];
  readonly mostFailureProneStrategy: HumanStrategyId;
  readonly mostSuccessfulSimpleStrategy: HumanStrategyId;
  readonly visualDifficulty: VisualDifficultyFeatures;
  readonly estimatedPlayMinutes: number;
  readonly allPathHintsVerified: boolean;
  readonly prototypeBand: 'MASTER_01_10' | 'MASTER_11_20' | 'MASTER_21_30';
  readonly acceptanceNotes: readonly string[];
  readonly difficultyScore: number;
  readonly structureSignature: string;
  readonly reviewed: boolean;
}
