import { describe, expect, it } from 'vitest';

import { PUZZLES, type VerifiedPuzzle } from '../../src/puzzles';
import {
  SAVE_SCHEMA_VERSION,
  type ProgressData,
} from '../../src/storage';
import { pickNextPuzzle, recordPuzzleStart } from '../../src/ui/puzzleSelection';

function emptyProgress(): ProgressData {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    completedPuzzles: [],
    noAssistCompletions: [],
    playedProblemIds: [],
    recentPuzzleCycleIds: [],
  };
}

function createDeterministicRandom(): () => number {
  let state = 0x5eed1234;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function selectSequence(count: number): readonly VerifiedPuzzle[] {
  const selected: VerifiedPuzzle[] = [PUZZLES[0]!];
  const random = createDeterministicRandom();
  let current = selected[0]!;
  for (let index = 0; index < count; index += 1) {
    const selection = pickNextPuzzle(PUZZLES, {
      currentPuzzleId: current?.puzzleId,
      currentInitialBoardHash: current?.initialBoardHash,
      random,
    });
    if (!selection) throw new Error('Expected a puzzle selection');
    selected.push(selection.selectedPuzzle);
    current = selection.selectedPuzzle;
  }
  return selected;
}

describe('random puzzle selection', () => {
  it('never repeats the current puzzle id across 100 new games', () => {
    const selected = selectSequence(100);
    for (let index = 1; index < selected.length; index += 1) {
      expect(selected[index]?.puzzleId).not.toBe(selected[index - 1]?.puzzleId);
    }
  });

  it('never repeats the current initial board hash across 100 new games', () => {
    const selected = selectSequence(100);
    for (let index = 1; index < selected.length; index += 1) {
      expect(selected[index]?.initialBoardHash).not.toBe(
        selected[index - 1]?.initialBoardHash,
      );
    }
  });

  it('can select all 10 puzzles over time', () => {
    const selected = selectSequence(100);
    expect(new Set(selected.map((puzzle) => puzzle.puzzleId)).size).toBe(10);
  });

  it('keeps an explicit replay on the same puzzle without changing progress', () => {
    const current = PUZZLES[0]!;
    const progress = {
      ...emptyProgress(),
      playedProblemIds: [current.puzzleId],
      recentPuzzleCycleIds: [current.puzzleId],
    };
    const replayProgress = recordPuzzleStart(progress, current.puzzleId, true);
    expect(current.puzzleId).toBe(PUZZLES[0]!.puzzleId);
    expect(replayProgress).toBe(progress);
  });

  it('shuffles only within the selected difficulty pool', () => {
    const puzzles = PUZZLES.slice(0, 6).map((puzzle, index): VerifiedPuzzle => ({
      ...puzzle,
      difficultyTier: index < 3 ? 'HARD' : 'MASTER',
    }));
    const current = puzzles[3]!;
    const selection = pickNextPuzzle(puzzles, {
      difficultyTier: 'MASTER',
      currentPuzzleId: current.puzzleId,
      currentInitialBoardHash: current.initialBoardHash,
      random: () => 0,
    });
    expect(selection?.selectedPuzzle.difficultyTier).toBe('MASTER');
    expect(selection?.selectedPuzzle.puzzleId).not.toBe(current.puzzleId);
    expect(selection?.selectedPuzzle.initialBoardHash).not.toBe(current.initialBoardHash);
  });
});
