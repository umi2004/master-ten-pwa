import type { Board, DifficultyVersion, GeneratorVersion, RuleVersion } from '../core';

export type PuzzleSolutionStatus = 'SOLVED' | 'UNSOLVABLE' | 'UNKNOWN';
export type DesignFamily = 'trap-cascade' | 'double-trap' | 'add-one' | 'add-two' | 'add-three';

export interface PhaseDifficulty {
  readonly early: number;
  readonly middle: number;
  readonly late: number;
}

export interface VerifiedPuzzle {
  readonly puzzleId: string;
  readonly displayNumber: number;
  readonly mode: 'master';
  readonly designFamily: DesignFamily;
  readonly seed: string;
  readonly ruleVersion: RuleVersion;
  readonly generatorVersion: GeneratorVersion;
  readonly difficultyVersion: DifficultyVersion;
  readonly initialBoard: Board;
  readonly initialRows: number;
  readonly initialBoardHash: string;
  readonly additionsAllowed: number;
  readonly initialAliveCount: number;
  readonly initialMoveCount: number;
  readonly solutionStatus: PuzzleSolutionStatus;
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
  readonly difficultyScore: number;
  readonly structureSignature: string;
  readonly reviewed: boolean;
}
