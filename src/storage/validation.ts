import {
  createBoard,
  type Board,
  type GameSnapshot,
  type GameStatus,
  MAX_BOARD_ROWS,
  RULE_VERSION,
  GENERATOR_VERSION,
  DIFFICULTY_VERSION,
} from '../core';
import type { VerifiedPuzzle } from '../puzzles';
import { parseSettings } from './settings';
import {
  SAVE_SCHEMA_VERSION,
  type ProgressData,
  type SavedSession,
} from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isStatus(value: unknown): value is GameStatus {
  return value === 'PLAYING' || value === 'WON' || value === 'LOST';
}

function parseBoard(value: unknown): Board | undefined {
  if (!isRecord(value) || value.width !== 9 || !Array.isArray(value.cells)) {
    return undefined;
  }
  if (
    !isNonNegativeInteger(value.logicalLength) ||
    value.logicalLength !== value.cells.length ||
    value.cells.length > MAX_BOARD_ROWS * 9
  ) return undefined;
  try {
    return createBoard(value.cells as number[], value.logicalLength);
  } catch {
    return undefined;
  }
}

function parseSnapshot(value: unknown): GameSnapshot | undefined {
  if (!isRecord(value)) return undefined;
  const board = parseBoard(value.board);
  if (
    !board ||
    !isNonNegativeInteger(value.additionsRemaining) ||
    !isNonNegativeInteger(value.additionsUsed) ||
    !isNonNegativeInteger(value.moveCount) ||
    !isStatus(value.status)
  ) return undefined;
  return {
    board,
    additionsRemaining: value.additionsRemaining,
    additionsUsed: value.additionsUsed,
    moveCount: value.moveCount,
    status: value.status,
  };
}

function parseStoredIdList(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string')) return undefined;
  return [...new Set(value as string[])];
}

export function migrateSaveData(value: unknown): unknown {
  if (!isRecord(value) || value.schemaVersion !== 0) return value;
  return {
    ...value,
    schemaVersion: SAVE_SCHEMA_VERSION,
    elapsedTime: value.elapsedTime ?? value.elapsedMs ?? 0,
    completedAt: value.completedAt ?? null,
    completedPuzzles: value.completedPuzzles ?? [],
    noAssistCompletions: value.noAssistCompletions ?? [],
    practiceMode: value.practiceMode ?? false,
    settings: value.settings ?? {
      fontSize: 'standard',
      soundEnabled: true,
      vibrationEnabled: true,
      reducedMotion: false,
      highContrast: false,
      largeBoard: false,
    },
  };
}

export function parseSavedSession(
  rawValue: unknown,
  puzzles: readonly VerifiedPuzzle[],
): SavedSession | undefined {
  const value = migrateSaveData(rawValue);
  if (!isRecord(value) || value.schemaVersion !== SAVE_SCHEMA_VERSION) {
    return undefined;
  }

  const puzzle = puzzles.find((candidate) => candidate.puzzleId === value.puzzleId);
  const currentBoard = parseBoard(value.currentBoard);
  const settings = parseSettings(value.settings);
  const completedPuzzles = parseStoredIdList(value.completedPuzzles);
  const noAssistCompletions = parseStoredIdList(value.noAssistCompletions);
  if (
    !puzzle ||
    !currentBoard ||
    !settings ||
    !completedPuzzles ||
    !noAssistCompletions ||
    value.ruleVersion !== RULE_VERSION ||
    value.generatorVersion !== GENERATOR_VERSION ||
    value.difficultyVersion !== DIFFICULTY_VERSION ||
    value.seed !== puzzle.seed ||
    value.initialBoardHash !== puzzle.initialBoardHash ||
    value.logicalLength !== currentBoard.logicalLength ||
    !isNonNegativeInteger(value.additionsRemaining) ||
    !isNonNegativeInteger(value.additionsUsed) ||
    value.additionsRemaining > puzzle.additionsAllowed ||
    value.additionsUsed > puzzle.additionsAllowed ||
    !isNonNegativeInteger(value.moveCount) ||
    !Array.isArray(value.history) ||
    value.history.length > 1_000 ||
    !isNonNegativeInteger(value.hintCount) ||
    !isNonNegativeInteger(value.undoCount) ||
    !isNonNegativeInteger(value.restartCount) ||
    !isNonNegativeFinite(value.startedAt) ||
    !isNonNegativeFinite(value.elapsedTime) ||
    !(value.completedAt === null || isNonNegativeFinite(value.completedAt)) ||
    !isStatus(value.completionStatus)
  ) return undefined;

  const history: GameSnapshot[] = [];
  for (const item of value.history) {
    const parsed = parseSnapshot(item);
    if (!parsed) return undefined;
    history.push(parsed);
  }

  if (noAssistCompletions.some((id) => !completedPuzzles.includes(id))) {
    return undefined;
  }

  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    ruleVersion: RULE_VERSION,
    generatorVersion: GENERATOR_VERSION,
    difficultyVersion: DIFFICULTY_VERSION,
    puzzleId: puzzle.puzzleId,
    seed: puzzle.seed,
    initialBoardHash: puzzle.initialBoardHash,
    currentBoard,
    logicalLength: currentBoard.logicalLength,
    additionsRemaining: value.additionsRemaining,
    additionsUsed: value.additionsUsed,
    moveCount: value.moveCount,
    history,
    hintCount: value.hintCount,
    undoCount: value.undoCount,
    restartCount: value.restartCount,
    startedAt: value.startedAt,
    elapsedTime: value.elapsedTime,
    completedAt: value.completedAt as number | null,
    completionStatus: value.completionStatus,
    settings,
    completedPuzzles,
    noAssistCompletions,
    practiceMode: value.practiceMode === true,
  };
}

export function parseProgress(
  value: unknown,
  puzzles: readonly VerifiedPuzzle[],
): ProgressData | undefined {
  if (!isRecord(value) || value.schemaVersion !== SAVE_SCHEMA_VERSION) {
    return undefined;
  }
  const completedPuzzles = parseStoredIdList(value.completedPuzzles);
  const noAssistCompletions = parseStoredIdList(value.noAssistCompletions);
  const playedProblemIds = value.playedProblemIds === undefined
    ? completedPuzzles
    : parseStoredIdList(value.playedProblemIds);
  const recentPuzzleCycleIds = value.recentPuzzleCycleIds === undefined
    ? []
    : parseStoredIdList(value.recentPuzzleCycleIds);
  if (
    !completedPuzzles ||
    !noAssistCompletions ||
    !playedProblemIds ||
    !recentPuzzleCycleIds ||
    noAssistCompletions.some((id) => !completedPuzzles.includes(id))
  ) return undefined;
  const currentPuzzleIds = new Set(puzzles.map((puzzle) => puzzle.puzzleId));
  const numericKeys = [
    'totalClears',
    'currentClearStreak',
    'bestClearStreak',
    'hardClears',
    'masterClears',
    'extremeClears',
  ] as const;
  if (numericKeys.some((key) => value[key] !== undefined && !isNonNegativeInteger(value[key]))) {
    return undefined;
  }
  const totalClears = (value.totalClears as number | undefined) ?? completedPuzzles.length;
  const currentClearStreak = (value.currentClearStreak as number | undefined) ?? 0;
  const bestClearStreak = Math.max(
    (value.bestClearStreak as number | undefined) ?? 0,
    currentClearStreak,
  );
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    completedPuzzles,
    noAssistCompletions,
    playedProblemIds,
    recentPuzzleCycleIds: recentPuzzleCycleIds.filter((id) => currentPuzzleIds.has(id)),
    totalClears,
    currentClearStreak,
    bestClearStreak,
    hardClears: (value.hardClears as number | undefined) ?? 0,
    masterClears: (value.masterClears as number | undefined) ?? 0,
    extremeClears: (value.extremeClears as number | undefined) ?? 0,
  };
}
