import type { Board, GameSnapshot, GameStatus } from '../core';

export const SAVE_SCHEMA_VERSION = 1 as const;
export const STORAGE_PREFIX = 'master-ten:' as const;

export type FontSizeSetting = 'standard' | 'large';

export interface AppSettings {
  readonly fontSize: FontSizeSetting;
  readonly soundEnabled: boolean;
  readonly vibrationEnabled: boolean;
  readonly reducedMotion: boolean;
  readonly highContrast: boolean;
  readonly largeBoard: boolean;
}

export interface ProgressData {
  readonly schemaVersion: typeof SAVE_SCHEMA_VERSION;
  readonly completedPuzzles: readonly string[];
  readonly noAssistCompletions: readonly string[];
  readonly playedProblemIds?: readonly string[];
  readonly recentPuzzleCycleIds?: readonly string[];
  readonly totalClears?: number;
  readonly currentClearStreak?: number;
  readonly bestClearStreak?: number;
  readonly hardClears?: number;
  readonly masterClears?: number;
  readonly extremeClears?: number;
}

export interface SavedSession {
  readonly schemaVersion: typeof SAVE_SCHEMA_VERSION;
  readonly ruleVersion: string;
  readonly generatorVersion: string;
  readonly difficultyVersion: string;
  readonly puzzleId: string;
  readonly seed: string;
  readonly initialBoardHash: string;
  readonly currentBoard: Board;
  readonly logicalLength: number;
  readonly additionsRemaining: number;
  readonly additionsUsed: number;
  readonly moveCount: number;
  readonly history: readonly GameSnapshot[];
  readonly hintCount: number;
  readonly undoCount: number;
  readonly restartCount: number;
  readonly startedAt: number;
  readonly elapsedTime: number;
  readonly completedAt: number | null;
  readonly completionStatus: GameStatus;
  readonly settings: AppSettings;
  readonly completedPuzzles: readonly string[];
  readonly noAssistCompletions: readonly string[];
  readonly practiceMode: boolean;
}

export type SessionLoadResult =
  | { readonly status: 'EMPTY' }
  | { readonly status: 'OK'; readonly session: SavedSession }
  | { readonly status: 'RECOVERED'; readonly message: string };

export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
