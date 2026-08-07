import { describe, expect, it } from 'vitest';

import { applyGameMove, createGameState, type GameState } from '../../src/core';
import { HintEngine } from '../../src/hints';
import { PUZZLES } from '../../src/puzzles';

describe('V8-Lite bounded local catalog', () => {
  it('contains only unique, unreviewed V8 candidates', () => {
    expect(PUZZLES).toHaveLength(10);
    expect(new Set(PUZZLES.map((puzzle) => puzzle.puzzleId)).size).toBe(PUZZLES.length);
    expect(new Set(PUZZLES.map((puzzle) => puzzle.seed)).size).toBe(PUZZLES.length);
    expect(new Set(PUZZLES.map((puzzle) => puzzle.initialBoardHash)).size).toBe(PUZZLES.length);
    expect(new Set(PUZZLES.map((puzzle) => puzzle.structureSignature)).size).toBeGreaterThanOrEqual(3);
    expect(PUZZLES.every((puzzle) => puzzle.seed.startsWith('master_v8_'))).toBe(true);
    expect(PUZZLES.every((puzzle) => puzzle.reviewed === false)).toBe(true);
  });

  it('keeps 42 dense cells, five additions, and the Lite final trial plan', () => {
    for (const puzzle of PUZZLES) {
      expect(puzzle.solutionStatus).toBe('SOLVED');
      expect(puzzle.initialAliveCount).toBe(42);
      expect(puzzle.initialBoard.logicalLength).toBe(42);
      expect(puzzle.initialRows).toBe(5);
      expect(puzzle.initialBoard.cells.every((cell) => cell !== 0)).toBe(true);
      expect(puzzle.visualDifficulty.initialDensity).toBe(1);
      expect(puzzle.additionsAllowed).toBe(5);
      expect(puzzle.additionsAvailable).toBe(5);
      expect(['HARD', 'MASTER', 'EXTREME']).toContain(puzzle.difficultyTier);
      expect(Object.fromEntries(puzzle.humanStrategyMetrics.map((metric) => [metric.strategy, metric.trials]))).toEqual({
        random: 200,
        proximity: 150,
        'row-clear': 150,
        'reserve-add': 150,
        'early-add': 150,
        'lookahead-2': 80,
      });
    }
  });

  it('stores complete relative-ranking metrics without treating them as formal review', () => {
    for (const puzzle of PUZZLES) {
      const metric = (strategy: string) => puzzle.humanStrategyMetrics.find((item) => item.strategy === strategy)!;
      expect(metric('random').trials).toBe(200);
      expect(metric('proximity').trials).toBe(150);
      expect(metric('row-clear').trials).toBe(150);
      expect(metric('lookahead-2').trials).toBe(80);
      const failures = puzzle.humanStrategyMetrics.reduce((sum, item) => sum + item.failures, 0);
      const nearMisses = puzzle.humanStrategyMetrics.reduce((sum, item) => sum + item.nearMissRouteCount, 0);
      expect(failures).toBeGreaterThan(0);
      expect(nearMisses / failures).toBeGreaterThan(0);
      expect(puzzle.acceptanceNotes.join(' ')).toContain('ranked from the existing');
      expect(puzzle.reviewed).toBe(false);
    }
  });

  it.each(PUZZLES)('replays $difficultyTier and verifies every cached hint', (puzzle) => {
    let verifiedState: GameState = createGameState(puzzle.initialBoard, puzzle.additionsAllowed);
    for (const move of puzzle.verifiedSolution) {
      verifiedState = applyGameMove(verifiedState, move);
    }
    expect(verifiedState.status).toBe('WON');
    expect(verifiedState.additionsUsed).toBe(5);

    let state: GameState = createGameState(puzzle.initialBoard, puzzle.additionsAllowed);
    const engine = new HintEngine();
    expect(engine.prime(state, puzzle.recommendedHumanSolution)).toBe(true);
    for (const expectedMove of puzzle.recommendedHumanSolution) {
      const hint = engine.getHint(state, { now: () => 0 });
      expect(hint.status).toBe('SAFE_MOVE');
      if (hint.status !== 'SAFE_MOVE') break;
      expect(hint.move).toEqual(expectedMove);
      state = applyGameMove(state, hint.move);
    }
    expect(state.status).toBe('WON');
    expect(state.additionsUsed).toBe(5);
    expect(puzzle.allPathHintsVerified).toBe(true);
  });
});
