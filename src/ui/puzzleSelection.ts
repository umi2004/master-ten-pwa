import type { VerifiedPuzzle } from '../puzzles';
import type { ProgressData } from '../storage';

export interface PickNextPuzzleOptions {
  readonly difficultyTier?: VerifiedPuzzle['difficultyTier'];
  readonly currentPuzzleId?: string;
  readonly recentPuzzleCycleIds?: readonly string[];
  readonly random?: () => number;
}

export interface PuzzleSelectionResult {
  readonly selectedPuzzle: VerifiedPuzzle;
  readonly updatedCycleIds: readonly string[];
}

export function pickNextPuzzle(
  puzzles: readonly VerifiedPuzzle[],
  options: PickNextPuzzleOptions = {},
): PuzzleSelectionResult | undefined {
  const pool = options.difficultyTier
    ? puzzles.filter((puzzle) => puzzle.difficultyTier === options.difficultyTier)
    : [...puzzles];
  if (pool.length === 0) return undefined;

  const poolIds = new Set(pool.map((puzzle) => puzzle.puzzleId));
  let cycleIds = [...new Set(
    (options.recentPuzzleCycleIds ?? []).filter((id) => poolIds.has(id)),
  )];
  let candidates = pool.filter((puzzle) => !cycleIds.includes(puzzle.puzzleId));

  if (candidates.length === 0) {
    cycleIds = [];
    candidates = pool;
  }

  const withoutCurrent = candidates.filter(
    (puzzle) => puzzle.puzzleId !== options.currentPuzzleId,
  );
  if (withoutCurrent.length > 0) {
    candidates = withoutCurrent;
  } else if (pool.length > 1) {
    // A missing or stale cycle can leave the current puzzle as the only unused
    // entry. Start a fresh cycle rather than showing it twice in a row.
    cycleIds = [];
    candidates = pool.filter((puzzle) => puzzle.puzzleId !== options.currentPuzzleId);
  }

  const randomValue = options.random?.() ?? Math.random();
  const index = Math.min(
    candidates.length - 1,
    Math.max(0, Math.floor(randomValue * candidates.length)),
  );
  const selectedPuzzle = candidates[index];
  if (!selectedPuzzle) return undefined;

  return {
    selectedPuzzle,
    updatedCycleIds: [...cycleIds, selectedPuzzle.puzzleId],
  };
}

export function recordPuzzleStart(
  progress: ProgressData,
  puzzleId: string,
  updatedCycleIds: readonly string[] | undefined,
  replay: boolean,
): ProgressData {
  if (replay) return progress;
  return {
    ...progress,
    playedProblemIds: [...new Set([
      ...(progress.playedProblemIds ?? []),
      puzzleId,
    ])],
    recentPuzzleCycleIds: updatedCycleIds ?? progress.recentPuzzleCycleIds ?? [],
  };
}
