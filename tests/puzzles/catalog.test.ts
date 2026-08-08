import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { applyGameMove, createGameState, RULE_VERSION, type GameState } from '../../src/core';
import { HintEngine } from '../../src/hints';
import { CATALOG_VERSION, PUZZLES } from '../../src/puzzles';

interface SelectionReport {
  readonly selectionVersion: string;
  readonly sourceCounts: {
    readonly stageTwoEntries: number;
    readonly reconstructedVerifiedExactFiveStageTwoCandidates: number;
  };
  readonly diversity: {
    readonly selectedMinimumHamming: number;
    readonly attempts: readonly { readonly selectedCount: number }[];
    readonly selectedCanonicalPatternSummary: {
      readonly unique: number;
      readonly duplicateGroups: number;
    };
    readonly selectedInitialLegalPairStructureSummary: {
      readonly maximumGroupSize: number;
    };
  };
  readonly finalCatalog: {
    readonly total: number;
    readonly normal: number;
    readonly elite: number;
    readonly publicDifficulty: string;
    readonly routeVerification: {
      readonly won: number;
      readonly exactFiveAdditions: number;
      readonly brokenOrUnknown: number;
    };
  };
}

const report = JSON.parse(readFileSync(
  new URL('../../artifacts/master-catalog-selection/report.json', import.meta.url),
  'utf8',
)) as SelectionReport;

describe('production MASTER catalog', () => {
  it('contains exactly 1000 unique dense MASTER puzzles', () => {
    expect(CATALOG_VERSION).toBe('master-catalog-selection-v1');
    expect(PUZZLES).toHaveLength(1_000);
    expect(new Set(PUZZLES.map((puzzle) => puzzle.puzzleId)).size).toBe(1_000);
    expect(new Set(PUZZLES.map((puzzle) => puzzle.initialBoardHash)).size).toBe(1_000);
    expect(new Set(PUZZLES.map((puzzle) => puzzle.initialBoard.cells.join(','))).size).toBe(1_000);
    for (const puzzle of PUZZLES) {
      expect(puzzle.ruleVersion).toBe(RULE_VERSION);
      expect(puzzle.solutionStatus).toBe('SOLVED');
      expect(puzzle.initialBoard.logicalLength).toBe(42);
      expect(puzzle.initialBoard.cells).toHaveLength(42);
      expect(puzzle.initialBoard.cells.every((cell) => cell >= 1 && cell <= 9)).toBe(true);
      expect(puzzle.difficultyTier).toBe('MASTER');
      expect(puzzle.additionsAllowed).toBe(5);
      expect(puzzle.minimumAdditionsProven).toBe(false);
    }
  });

  it('keeps the internal 950/50 split without a public tier split', () => {
    expect(PUZZLES.filter((puzzle) => puzzle.internalBand === 'normal-master')).toHaveLength(950);
    expect(PUZZLES.filter((puzzle) => puzzle.internalBand === 'elite-master')).toHaveLength(50);
    expect(new Set(PUZZLES.map((puzzle) => puzzle.difficultyTier))).toEqual(new Set(['MASTER']));
  });

  it('replays every known route to WON with exactly five additions', () => {
    for (const puzzle of PUZZLES) {
      let state: GameState = createGameState(puzzle.initialBoard, puzzle.additionsAllowed);
      for (const move of puzzle.verifiedSolution) state = applyGameMove(state, move);
      expect(state.status, puzzle.puzzleId).toBe('WON');
      expect(state.additionsUsed, puzzle.puzzleId).toBe(5);
    }
  });

  it('validates every production hint route end to end', () => {
    const engine = new HintEngine();
    for (const puzzle of PUZZLES) {
      let state: GameState = createGameState(puzzle.initialBoard, puzzle.additionsAllowed);
      expect(engine.prime(state, puzzle.recommendedHumanSolution), puzzle.puzzleId).toBe(true);
      for (const expectedMove of puzzle.recommendedHumanSolution) {
        const hint = engine.getHint(state, { now: () => 0 });
        expect(hint.status, puzzle.puzzleId).toBe('SAFE_MOVE');
        if (hint.status !== 'SAFE_MOVE') break;
        expect(hint.move).toEqual(expectedMove);
        state = applyGameMove(state, hint.move);
      }
      expect(state.status, puzzle.puzzleId).toBe('WON');
      expect(state.additionsUsed, puzzle.puzzleId).toBe(5);
    }
  });

  it('matches the deterministic selection and diversity report', () => {
    expect(report.selectionVersion).toBe(CATALOG_VERSION);
    expect(report.sourceCounts.stageTwoEntries).toBe(3_000);
    expect(report.sourceCounts.reconstructedVerifiedExactFiveStageTwoCandidates).toBe(3_000);
    expect(report.finalCatalog).toMatchObject({
      total: 1_000,
      normal: 950,
      elite: 50,
      publicDifficulty: 'MASTER',
      routeVerification: { won: 1_000, exactFiveAdditions: 1_000, brokenOrUnknown: 0 },
    });
    expect(report.diversity.selectedMinimumHamming).toBe(3);
    expect(report.diversity.attempts.map((attempt) => attempt.selectedCount)).toEqual([748, 878, 1_000]);
    expect(report.diversity.selectedCanonicalPatternSummary).toMatchObject({
      unique: 1_000,
      duplicateGroups: 0,
    });
    expect(report.diversity.selectedInitialLegalPairStructureSummary.maximumGroupSize).toBeLessThanOrEqual(6);
  });
});
