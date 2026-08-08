import type { VerifiedPuzzle } from '../puzzles';
import type { ProgressData } from '../storage';

export interface PickNextPuzzleOptions {
  readonly currentPuzzleId?: string;
  readonly currentInitialBoardHash?: string;
  readonly random?: () => number;
}

export interface PuzzleSelectionResult {
  readonly selectedPuzzle: VerifiedPuzzle;
}

export function pickNextPuzzle(
  puzzles: readonly VerifiedPuzzle[],
  options: PickNextPuzzleOptions = {},
): PuzzleSelectionResult | undefined {
  const pool = [...puzzles];
  if (pool.length === 0) return undefined;

  const shuffled = [...pool];
  const random = options.random ?? Math.random;
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.min(
      index,
      Math.max(0, Math.floor(random() * (index + 1))),
    );
    const current = shuffled[index]!;
    shuffled[index] = shuffled[randomIndex]!;
    shuffled[randomIndex] = current;
  }

  const selectedPuzzle = shuffled.find(
    (puzzle) =>
      puzzle.puzzleId !== options.currentPuzzleId &&
      puzzle.initialBoardHash !== options.currentInitialBoardHash,
  );
  if (!selectedPuzzle) return undefined;
  return { selectedPuzzle };
}

export function recordPuzzleStart(
  progress: ProgressData,
  puzzleId: string,
  replay: boolean,
): ProgressData {
  if (replay) return progress;
  return {
    ...progress,
    playedProblemIds: [...new Set([
      ...(progress.playedProblemIds ?? []),
      puzzleId,
    ])],
  };
}
