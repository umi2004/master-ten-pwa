import {
  DIFFICULTY_VERSION,
  GENERATOR_VERSION,
  RULE_VERSION,
  type GameState,
} from '../core';
import type { VerifiedPuzzle } from '../puzzles';
import { DEFAULT_SETTINGS, parseSettings } from './settings';
import {
  parseProgress,
  parseSavedSession,
} from './validation';
import {
  SAVE_SCHEMA_VERSION,
  STORAGE_PREFIX,
  type AppSettings,
  type ProgressData,
  type SavedSession,
  type SessionLoadResult,
  type StorageLike,
} from './types';

const SESSION_KEY = `${STORAGE_PREFIX}session:v1`;
const SETTINGS_KEY = `${STORAGE_PREFIX}settings:v1`;
const PROGRESS_KEY = `${STORAGE_PREFIX}progress:v1`;

export function createEmptyProgress(): ProgressData {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    completedPuzzles: [],
    noAssistCompletions: [],
    playedProblemIds: [],
    recentPuzzleCycleIds: [],
    totalClears: 0,
    currentClearStreak: 0,
    bestClearStreak: 0,
    hardClears: 0,
    masterClears: 0,
    extremeClears: 0,
  };
}

export interface SessionTiming {
  readonly startedAt: number;
  readonly elapsedTime: number;
  readonly completedAt: number | null;
}

export class SaveRepository {
  readonly #storage: StorageLike;
  readonly #now: () => number;

  public constructor(storage: StorageLike, now: () => number = Date.now) {
    this.#storage = storage;
    this.#now = now;
  }

  public loadSession(puzzles: readonly VerifiedPuzzle[]): SessionLoadResult {
    const raw = this.#storage.getItem(SESSION_KEY);
    if (raw === null) return { status: 'EMPTY' };
    try {
      const session = parseSavedSession(JSON.parse(raw) as unknown, puzzles);
      if (session) return { status: 'OK', session };
    } catch {
      // Invalid JSON follows the same quarantine path.
    }
    this.#quarantine(SESSION_KEY, raw);
    return {
      status: 'RECOVERED',
      message: '保存データに不整合があったため、安全に隔離して新しい状態で起動しました。',
    };
  }

  public saveSession(
    state: GameState,
    puzzle: VerifiedPuzzle,
    settings: AppSettings,
    progress: ProgressData,
    timing: SessionTiming,
    practiceMode = false,
  ): SavedSession {
    const session: SavedSession = {
      schemaVersion: SAVE_SCHEMA_VERSION,
      ruleVersion: RULE_VERSION,
      generatorVersion: GENERATOR_VERSION,
      difficultyVersion: DIFFICULTY_VERSION,
      puzzleId: puzzle.puzzleId,
      seed: puzzle.seed,
      initialBoardHash: puzzle.initialBoardHash,
      currentBoard: state.board,
      logicalLength: state.board.logicalLength,
      additionsRemaining: state.additionsRemaining,
      additionsUsed: state.additionsUsed,
      moveCount: state.moveCount,
      history: state.history,
      hintCount: state.hintCount,
      undoCount: state.undoCount,
      restartCount: state.restartCount,
      startedAt: timing.startedAt,
      elapsedTime: timing.elapsedTime,
      completedAt: timing.completedAt,
      completionStatus: state.status,
      settings,
      completedPuzzles: progress.completedPuzzles,
      noAssistCompletions: progress.noAssistCompletions,
      practiceMode,
    };
    this.#storage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  public clearSession(): void {
    this.#storage.removeItem(SESSION_KEY);
  }

  public loadSettings(): AppSettings {
    const raw = this.#storage.getItem(SETTINGS_KEY);
    if (raw === null) return DEFAULT_SETTINGS;
    try {
      return parseSettings(JSON.parse(raw) as unknown) ?? DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  public saveSettings(settings: AppSettings): void {
    this.#storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  public loadProgress(puzzles: readonly VerifiedPuzzle[]): ProgressData {
    const raw = this.#storage.getItem(PROGRESS_KEY);
    if (raw === null) {
      return createEmptyProgress();
    }
    try {
      return parseProgress(JSON.parse(raw) as unknown, puzzles) ?? createEmptyProgress();
    } catch {
      return createEmptyProgress();
    }
  }

  public saveProgress(progress: ProgressData): void {
    this.#storage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  }

  public clearAllOwnedData(): void {
    const keys: string[] = [];
    for (let index = 0; index < this.#storage.length; index += 1) {
      const key = this.#storage.key(index);
      if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => this.#storage.removeItem(key));
  }

  #quarantine(sourceKey: string, raw: string): void {
    const quarantineKey = `${STORAGE_PREFIX}quarantine:${this.#now()}`;
    try {
      this.#storage.setItem(quarantineKey, raw);
    } catch {
      // Quota or privacy mode may prevent quarantine; removing the bad active
      // value still keeps the application bootable.
    } finally {
      this.#storage.removeItem(sourceKey);
    }
  }
}
