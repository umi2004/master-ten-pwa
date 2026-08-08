import { describe, expect, it } from 'vitest';

import {
  applyGameMove,
  createBoard,
  createGameState,
  getLegalPairMoves,
} from '../../src/core';
import { hashBoard, PUZZLES, type VerifiedPuzzle } from '../../src/puzzles';
import {
  DEFAULT_SETTINGS,
  SAVE_SCHEMA_VERSION,
  STORAGE_PREFIX,
  SaveRepository,
  migrateSaveData,
  parseSavedSession,
  type StorageLike,
} from '../../src/storage';

class MemoryStorage implements StorageLike {
  readonly data = new Map<string, string>();

  public get length(): number {
    return this.data.size;
  }

  public key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }

  public getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  public removeItem(key: string): void {
    this.data.delete(key);
  }
}

const puzzle = PUZZLES[0] as VerifiedPuzzle;

function saveValid(storage: MemoryStorage): void {
  const repository = new SaveRepository(storage, () => 1234);
  const progress = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    completedPuzzles: [] as string[],
    noAssistCompletions: [] as string[],
  };
  repository.saveSession(
    createGameState(puzzle.initialBoard, puzzle.additionsAllowed),
    puzzle,
    DEFAULT_SETTINGS,
    progress,
    { startedAt: 100, elapsedTime: 50, completedAt: null },
  );
}

function sessionKey(storage: MemoryStorage): string {
  const key = [...storage.data.keys()].find((candidate) => candidate.includes('session'));
  if (!key) throw new Error('session key missing');
  return key;
}

describe('保存データ', () => {
  it('正常なゲーム状態を保存・復元する', () => {
    const storage = new MemoryStorage();
    saveValid(storage);
    const result = new SaveRepository(storage).loadSession(PUZZLES);
    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(result.session.puzzleId).toBe(puzzle.puzzleId);
      expect(result.session.currentBoard).toEqual(puzzle.initialBoard);
      expect(result.session.elapsedTime).toBe(50);
    }
  });

  it('履歴を含む操作後状態を往復する', () => {
    const storage = new MemoryStorage();
    const repository = new SaveRepository(storage);
    const initial = createGameState(puzzle.initialBoard, puzzle.additionsAllowed);
    const move = getLegalPairMoves(initial.board)[0];
    expect(move).toBeDefined();
    if (!move) return;
    const state = applyGameMove(initial, move);
    repository.saveSession(
      state,
      puzzle,
      DEFAULT_SETTINGS,
      { schemaVersion: 1, completedPuzzles: [], noAssistCompletions: [] },
      { startedAt: 1, elapsedTime: 2, completedAt: null },
    );
    const result = repository.loadSession(PUZZLES);
    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(result.session.moveCount).toBe(1);
      expect(result.session.history).toHaveLength(1);
    }
  });

  it('壊れたJSONを隔離し、起動可能な回復結果を返す', () => {
    const storage = new MemoryStorage();
    storage.setItem(`${STORAGE_PREFIX}session:v1`, '{bad json');
    const result = new SaveRepository(storage, () => 999).loadSession(PUZZLES);
    expect(result.status).toBe('RECOVERED');
    expect(storage.getItem(`${STORAGE_PREFIX}session:v1`)).toBeNull();
    expect(storage.getItem(`${STORAGE_PREFIX}quarantine:999`)).toBe('{bad json');
  });

  it.each([
    ['schemaVersion', 99],
    ['ruleVersion', '9.0.0'],
    ['generatorVersion', '9.0.0'],
    ['difficultyVersion', '9.0.0'],
    ['puzzleId', 'unknown'],
    ['initialBoardHash', 'bad-hash'],
  ])('%s不一致を拒否する', (field, replacement) => {
    const storage = new MemoryStorage();
    saveValid(storage);
    const key = sessionKey(storage);
    const value = JSON.parse(storage.getItem(key) ?? '{}') as Record<string, unknown>;
    value[field] = replacement;
    storage.setItem(key, JSON.stringify(value));
    expect(new SaveRepository(storage).loadSession(PUZZLES).status).toBe('RECOVERED');
  });

  it('配列長とセル値が不正な盤面を拒否する', () => {
    const storage = new MemoryStorage();
    saveValid(storage);
    const key = sessionKey(storage);
    const value = JSON.parse(storage.getItem(key) ?? '{}') as {
      currentBoard: { cells: number[]; logicalLength: number };
    };
    value.currentBoard.cells[0] = 42;
    storage.setItem(key, JSON.stringify(value));
    expect(new SaveRepository(storage).loadSession(PUZZLES).status).toBe('RECOVERED');
  });

  it('schema 0のelapsedMsをschema 1へ移行する', () => {
    const storage = new MemoryStorage();
    saveValid(storage);
    const value = JSON.parse(storage.getItem(sessionKey(storage)) ?? '{}') as Record<string, unknown>;
    value.schemaVersion = 0;
    value.elapsedMs = value.elapsedTime;
    delete value.elapsedTime;
    const migrated = migrateSaveData(value);
    const parsed = parseSavedSession(migrated, PUZZLES);
    expect(parsed?.schemaVersion).toBe(1);
    expect(parsed?.elapsedTime).toBe(50);
  });

  it('設定と進捗を個別に保存する', () => {
    const storage = new MemoryStorage();
    const repository = new SaveRepository(storage);
    const settings = { ...DEFAULT_SETTINGS, highContrast: true, largeBoard: true };
    repository.saveSettings(settings);
    expect(repository.loadSettings()).toEqual(settings);

    const progress = {
      schemaVersion: SAVE_SCHEMA_VERSION,
      completedPuzzles: [puzzle.puzzleId],
      noAssistCompletions: [puzzle.puzzleId],
    } as const;
    repository.saveProgress(progress);
    expect(repository.loadProgress(PUZZLES)).toMatchObject({
      ...progress,
      totalClears: 1,
      currentClearStreak: 0,
      bestClearStreak: 0,
    });
  });

  it('旧10問catalogのIDが消えても累計・連続の進捗を維持する', () => {
    const storage = new MemoryStorage();
    const repository = new SaveRepository(storage);
    repository.saveProgress({
      schemaVersion: SAVE_SCHEMA_VERSION,
      completedPuzzles: ['legacy-hard-01', 'legacy-extreme-02'],
      noAssistCompletions: ['legacy-hard-01'],
      playedProblemIds: ['legacy-hard-01', 'legacy-extreme-02'],
      recentPuzzleCycleIds: ['legacy-hard-01'],
      totalClears: 27,
      currentClearStreak: 6,
      bestClearStreak: 11,
      hardClears: 8,
      masterClears: 15,
      extremeClears: 4,
    });
    expect(repository.loadProgress(PUZZLES)).toMatchObject({
      completedPuzzles: ['legacy-hard-01', 'legacy-extreme-02'],
      noAssistCompletions: ['legacy-hard-01'],
      playedProblemIds: ['legacy-hard-01', 'legacy-extreme-02'],
      recentPuzzleCycleIds: [],
      totalClears: 27,
      currentClearStreak: 6,
      bestClearStreak: 11,
      hardClears: 8,
      masterClears: 15,
      extremeClears: 4,
    });
  });

  it('クリア記録を再読込後も維持する', () => {
    const storage = new MemoryStorage();
    const repository = new SaveRepository(storage);
    repository.saveProgress({
      schemaVersion: SAVE_SCHEMA_VERSION,
      completedPuzzles: [puzzle.puzzleId],
      noAssistCompletions: [],
      playedProblemIds: [puzzle.puzzleId],
      totalClears: 12,
      currentClearStreak: 4,
      bestClearStreak: 9,
      hardClears: 3,
      masterClears: 8,
      extremeClears: 1,
    });
    expect(repository.loadProgress(PUZZLES)).toMatchObject({
      totalClears: 12,
      currentClearStreak: 4,
      bestClearStreak: 9,
      hardClears: 3,
      masterClears: 8,
      extremeClears: 1,
      playedProblemIds: [puzzle.puzzleId],
    });
  });

  it('保存なしと破損した進捗は安全に0へ初期化する', () => {
    const storage = new MemoryStorage();
    const repository = new SaveRepository(storage);
    expect(repository.loadProgress(PUZZLES).totalClears).toBe(0);
    storage.setItem(`${STORAGE_PREFIX}progress:v1`, JSON.stringify({
      schemaVersion: 1,
      completedPuzzles: [],
      noAssistCompletions: [],
      totalClears: -3,
    }));
    expect(repository.loadProgress(PUZZLES)).toMatchObject({
      totalClears: 0,
      currentClearStreak: 0,
      bestClearStreak: 0,
    });
  });

  it('データ削除はMaster Ten所有キーだけを対象にする', () => {
    const storage = new MemoryStorage();
    saveValid(storage);
    storage.setItem('another-app:data', 'keep');
    new SaveRepository(storage).clearAllOwnedData();
    expect(storage.getItem('another-app:data')).toBe('keep');
    expect([...storage.data.keys()].some((key) => key.startsWith(STORAGE_PREFIX))).toBe(false);
  });

  it('初期盤面ハッシュは候補盤面と一致する', () => {
    expect(hashBoard(puzzle.initialBoard)).toBe(puzzle.initialBoardHash);
  });

  it('未知の設定値は安全な既定値へ戻す', () => {
    const storage = new MemoryStorage();
    storage.setItem(`${STORAGE_PREFIX}settings:v1`, JSON.stringify({ fontSize: 'huge' }));
    expect(new SaveRepository(storage).loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('異なる論理長を持つ盤面は復元しない', () => {
    const custom = {
      ...puzzle,
      puzzleId: `${puzzle.puzzleId}-partial`,
      seed: `${puzzle.seed}-partial`,
      initialBoard: createBoard([1, 2, 3]),
    };
    expect(custom.initialBoard.logicalLength).toBe(3);
  });
});
