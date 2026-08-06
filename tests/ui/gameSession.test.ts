import { describe, expect, it } from 'vitest';

import { createBoard, getLegalPairMoves } from '../../src/core';
import { HintEngine } from '../../src/hints';
import { hashBoard, PUZZLES, type VerifiedPuzzle } from '../../src/puzzles';
import {
  DEFAULT_SETTINGS,
  SAVE_SCHEMA_VERSION,
  SaveRepository,
  type StorageLike,
} from '../../src/storage';
import { GameSession } from '../../src/ui/gameSession';

class MemoryStorage implements StorageLike {
  readonly data = new Map<string, string>();
  public get length(): number { return this.data.size; }
  public key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  public getItem(key: string): string | null { return this.data.get(key) ?? null; }
  public setItem(key: string, value: string): void { this.data.set(key, value); }
  public removeItem(key: string): void { this.data.delete(key); }
}

const emptyProgress = {
  schemaVersion: SAVE_SCHEMA_VERSION,
  completedPuzzles: [] as string[],
  noAssistCompletions: [] as string[],
};

function customPuzzle(cells: readonly number[], additionsAllowed: number): VerifiedPuzzle {
  const original = PUZZLES[0] as VerifiedPuzzle;
  const board = createBoard(cells);
  return {
    ...original,
    puzzleId: `${original.puzzleId}-session-${cells.join('')}`,
    seed: `${original.seed}-session-${cells.join('')}`,
    initialBoard: board,
    initialBoardHash: hashBoard(board),
    initialRows: Math.ceil(board.logicalLength / 9),
    additionsAllowed,
  };
}

describe('ゲーム操作統合', () => {
  it('2セル選択でペアを消し、各手後に自動保存する', () => {
    const storage = new MemoryStorage();
    const repository = new SaveRepository(storage);
    const puzzle = customPuzzle([5, 5], 0);
    const session = GameSession.create(puzzle, DEFAULT_SETTINGS, emptyProgress, repository);
    expect(session.select({ row: 0, column: 0 }).changed).toBe(false);
    expect(session.select({ row: 0, column: 1 }).changed).toBe(true);
    expect(session.state.status).toBe('WON');
    expect(repository.loadSession([puzzle]).status).toBe('OK');
  });

  it('無効ペアでは盤面と手数を変更しない', () => {
    const puzzle = customPuzzle([1, 2, 3], 0);
    const session = GameSession.create(
      puzzle,
      DEFAULT_SETTINGS,
      emptyProgress,
      new SaveRepository(new MemoryStorage()),
    );
    session.select({ row: 0, column: 0 });
    const result = session.select({ row: 0, column: 1 });
    expect(result.changed).toBe(false);
    expect(session.state.board.cells).toEqual([1, 2, 3]);
    expect(session.state.moveCount).toBe(0);
  });

  it('Undoで盤面を復元し使用回数を記録する', () => {
    const puzzle = customPuzzle([1, 1, 2, 2], 0);
    const session = GameSession.create(
      puzzle,
      DEFAULT_SETTINGS,
      emptyProgress,
      new SaveRepository(new MemoryStorage()),
    );
    const move = getLegalPairMoves(session.state.board)[0];
    expect(move).toBeDefined();
    if (!move) return;
    session.select(move.first);
    session.select(move.second);
    expect(session.undo().changed).toBe(true);
    expect(session.state.board.cells).toEqual([1, 1, 2, 2]);
    expect(session.state.undoCount).toBe(1);
  });

  it('手詰まり時だけ数字追加できる', () => {
    const puzzle = customPuzzle([1, 2, 3, 4, 5, 6, 7, 8], 1);
    const session = GameSession.create(
      puzzle,
      DEFAULT_SETTINGS,
      emptyProgress,
      new SaveRepository(new MemoryStorage()),
    );
    expect(session.addNumbers().changed).toBe(true);
    expect(session.state.additionsUsed).toBe(1);
  });

  it('安全ヒントとヒント回数を統合する', () => {
    const puzzle = customPuzzle([5, 5], 0);
    const session = GameSession.create(
      puzzle,
      DEFAULT_SETTINGS,
      emptyProgress,
      new SaveRepository(new MemoryStorage()),
      { hintEngine: new HintEngine() },
    );
    expect(session.requestHint().status).toBe('SAFE_MOVE');
    expect(session.state.hintCount).toBe(1);
  });

  it('リスタートで初期盤面へ戻し回数を記録する', () => {
    const puzzle = customPuzzle([1, 1, 2, 2], 0);
    const session = GameSession.create(
      puzzle,
      DEFAULT_SETTINGS,
      emptyProgress,
      new SaveRepository(new MemoryStorage()),
    );
    const move = getLegalPairMoves(session.state.board)[0];
    if (!move) return;
    session.select(move.first);
    session.select(move.second);
    session.restart();
    expect(session.state.board).toEqual(puzzle.initialBoard);
    expect(session.state.restartCount).toBe(1);
  });

  it('保存セッションから盤面・履歴・時間を再開する', () => {
    let time = 100;
    const now = (): number => time;
    const storage = new MemoryStorage();
    const repository = new SaveRepository(storage, now);
    const puzzle = customPuzzle([1, 1, 2, 2], 0);
    const session = GameSession.create(
      puzzle,
      DEFAULT_SETTINGS,
      emptyProgress,
      repository,
      { now },
    );
    time = 250;
    session.leave();
    const loaded = repository.loadSession([puzzle]);
    expect(loaded.status).toBe('OK');
    if (loaded.status !== 'OK') return;
    const resumed = GameSession.resume(
      loaded.session,
      puzzle,
      DEFAULT_SETTINGS,
      emptyProgress,
      repository,
      { now },
    );
    expect(resumed.elapsedTime).toBe(150);
    expect(resumed.state.board).toEqual(session.state.board);
  });

  it('ノーアシスト勝利を進捗へ記録する', () => {
    const storage = new MemoryStorage();
    const repository = new SaveRepository(storage);
    const puzzle = customPuzzle([5, 5], 0);
    const session = GameSession.create(puzzle, DEFAULT_SETTINGS, emptyProgress, repository);
    session.select({ row: 0, column: 0 });
    session.select({ row: 0, column: 1 });
    expect(session.progress.completedPuzzles).toContain(puzzle.puzzleId);
    expect(session.progress.noAssistCompletions).toContain(puzzle.puzzleId);
  });
});
