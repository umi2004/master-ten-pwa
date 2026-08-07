import { describe, expect, it } from 'vitest';

import { PUZZLES, type VerifiedPuzzle } from '../../src/puzzles';
import {
  SAVE_SCHEMA_VERSION,
  SaveRepository,
  type ProgressData,
  type StorageLike,
} from '../../src/storage';
import { pickNextPuzzle, recordPuzzleStart } from '../../src/ui/puzzleSelection';

class MemoryStorage implements StorageLike {
  readonly data = new Map<string, string>();
  public get length(): number { return this.data.size; }
  public key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  public getItem(key: string): string | null { return this.data.get(key) ?? null; }
  public setItem(key: string, value: string): void { this.data.set(key, value); }
  public removeItem(key: string): void { this.data.delete(key); }
}

function emptyProgress(): ProgressData {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    completedPuzzles: [],
    noAssistCompletions: [],
    playedProblemIds: [],
    recentPuzzleCycleIds: [],
  };
}

function selectSequence(count: number): readonly string[] {
  const selectedIds: string[] = [];
  let cycleIds: readonly string[] = [];
  let currentPuzzleId: string | undefined;
  for (let index = 0; index < count; index += 1) {
    const selection = pickNextPuzzle(PUZZLES, {
      currentPuzzleId,
      recentPuzzleCycleIds: cycleIds,
      random: () => 0,
    });
    if (!selection) throw new Error('Expected a puzzle selection');
    selectedIds.push(selection.selectedPuzzle.puzzleId);
    currentPuzzleId = selection.selectedPuzzle.puzzleId;
    cycleIds = selection.updatedCycleIds;
  }
  return selectedIds;
}

describe('puzzle shuffle bag', () => {
  it('A: presents all 10 puzzles once before repeating', () => {
    const selectedIds = selectSequence(10);
    expect(new Set(selectedIds).size).toBe(10);
  });

  it('B: resets on selection 11 without repeating selection 10', () => {
    const selectedIds = selectSequence(11);
    expect(selectedIds[10]).not.toBe(selectedIds[9]);
    expect(selectedIds.slice(0, 10)).toContain(selectedIds[10]);
  });

  it('C: keeps the cycle after progress is reloaded', () => {
    const storage = new MemoryStorage();
    const repository = new SaveRepository(storage);
    const first = pickNextPuzzle(PUZZLES, { random: () => 0 });
    if (!first) throw new Error('Expected a puzzle selection');
    repository.saveProgress(recordPuzzleStart(
      emptyProgress(),
      first.selectedPuzzle.puzzleId,
      first.updatedCycleIds,
      false,
    ));

    const reloaded = repository.loadProgress(PUZZLES);
    const second = pickNextPuzzle(PUZZLES, {
      currentPuzzleId: first.selectedPuzzle.puzzleId,
      recentPuzzleCycleIds: reloaded.recentPuzzleCycleIds,
      random: () => 0,
    });
    expect(reloaded.recentPuzzleCycleIds).toEqual([first.selectedPuzzle.puzzleId]);
    expect(second?.selectedPuzzle.puzzleId).not.toBe(first.selectedPuzzle.puzzleId);
  });

  it('D: explicit replay keeps the puzzle and cycle progress unchanged', () => {
    const progress = {
      ...emptyProgress(),
      playedProblemIds: [PUZZLES[0]!.puzzleId],
      recentPuzzleCycleIds: [PUZZLES[0]!.puzzleId],
    };
    const replayProgress = recordPuzzleStart(
      progress,
      PUZZLES[0]!.puzzleId,
      ['should-not-be-recorded'],
      true,
    );
    expect(replayProgress).toBe(progress);
    expect(replayProgress.recentPuzzleCycleIds).toEqual([PUZZLES[0]!.puzzleId]);
  });

  it('E: shuffles only within the selected difficulty pool', () => {
    const puzzles = PUZZLES.slice(0, 6).map((puzzle, index): VerifiedPuzzle => ({
      ...puzzle,
      difficultyTier: index < 3 ? 'HARD' : 'MASTER',
    }));
    let cycleIds: readonly string[] = [];
    let currentPuzzleId: string | undefined;
    const selected: VerifiedPuzzle[] = [];
    for (let index = 0; index < 3; index += 1) {
      const selection = pickNextPuzzle(puzzles, {
        difficultyTier: 'MASTER',
        currentPuzzleId,
        recentPuzzleCycleIds: cycleIds,
        random: () => 0,
      });
      if (!selection) throw new Error('Expected a puzzle selection');
      selected.push(selection.selectedPuzzle);
      currentPuzzleId = selection.selectedPuzzle.puzzleId;
      cycleIds = selection.updatedCycleIds;
    }
    expect(selected.every((puzzle) => puzzle.difficultyTier === 'MASTER')).toBe(true);
    expect(new Set(selected.map((puzzle) => puzzle.puzzleId)).size).toBe(3);
  });

  it('F: defaults a legacy progress record to an empty cycle', () => {
    const storage = new MemoryStorage();
    const repository = new SaveRepository(storage);
    repository.saveProgress({
      schemaVersion: SAVE_SCHEMA_VERSION,
      completedPuzzles: [],
      noAssistCompletions: [],
      playedProblemIds: [],
    });
    expect(repository.loadProgress(PUZZLES).recentPuzzleCycleIds).toEqual([]);
  });
});
