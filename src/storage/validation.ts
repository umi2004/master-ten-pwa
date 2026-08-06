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

function parseIdList(
  value: unknown,
  knownPuzzleIds: ReadonlySet<string>,
): readonly string[] | undefined {
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string')) {
    return undefined;
  }
  const ids = value as string[];
  if (ids.some((id) => !knownPuzzleIds.has(id))) return undefined;
  return [...new Set(ids)];
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
  const knownIds = new Set(puzzles.map((candidate) => candidate.puzzleId));
  const completedPuzzles = parseIdList(value.completedPuzzles, knownIds);
  const noAssistCompletions = parseIdList(value.noAssistCompletions, knownIds);
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
  };
}

export function parseProgress(
  value: unknown,
  puzzles: readonly VerifiedPuzzle[],
): ProgressData | undefined {
  if (!isRecord(value) || value.schemaVersion !== SAVE_SCHEMA_VERSION) {
    return undefined;
  }
  const knownIds = new Set(puzzles.map((puzzle) => puzzle.puzzleId));
  const completedPuzzles = parseIdList(value.completedPuzzles, knownIds);
  const noAssistCompletions = parseIdList(value.noAssistCompletions, knownIds);
  if (
    !completedPuzzles ||
    !noAssistCompletions ||
    noAssistCompletions.some((id) => !completedPuzzles.includes(id))
  ) return undefined;
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    completedPuzzles,
    noAssistCompletions,
  };
}
