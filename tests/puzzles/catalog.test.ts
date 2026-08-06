import { describe, expect, it } from 'vitest';

import { applyGameMove, createGameState, type GameState } from '../../src/core';
import { HintEngine } from '../../src/hints';
import { PUZZLES } from '../../src/puzzles';

describe('V5-Lite local single-playtest catalog', () => {
  it('contains only the requested Master 01 playtest', () => {
    expect(PUZZLES.map((puzzle) => puzzle.displayNumber)).toEqual([1]);
    expect(new Set(PUZZLES.map((puzzle) => puzzle.puzzleId)).size).toBe(1);
    expect(new Set(PUZZLES.map((puzzle) => puzzle.seed)).size).toBe(1);
    expect(new Set(PUZZLES.map((puzzle) => puzzle.structureSignature)).size).toBe(1);
  });

  it('keeps exactly 42 dense cells and five available additions without claiming review', () => {
    for (const puzzle of PUZZLES) {
      expect(puzzle.solutionStatus).toBe('SOLVED');
      expect(puzzle.initialAliveCount).toBe(42);
      expect(puzzle.initialBoard.logicalLength).toBe(42);
      expect(puzzle.initialRows).toBe(5);
      expect(puzzle.initialBoard.cells.every((cell) => cell !== 0)).toBe(true);
      expect(puzzle.visualDifficulty.initialDensity).toBe(1);
      expect(puzzle.additionsAllowed).toBe(5);
      expect(puzzle.additionsAvailable).toBe(5);
      expect(puzzle.initialMoveCount).toBeGreaterThan(0);
      expect(puzzle.minimumAdditionsProven).toBe(true);
      expect(puzzle.maximumRowsDuringSolution).toBeLessThanOrEqual(48);
      expect(puzzle.minimumAdditions).toBe(1);
      expect(puzzle.reviewed).toBe(false);
      expect(puzzle.acceptanceNotes.join(' ')).toContain('playtest');
    }
  });

  it('records only the requested Lite strategies and trial counts', () => {
    for (const puzzle of PUZZLES) {
      expect(Object.fromEntries(puzzle.humanStrategyMetrics.map((metric) => [metric.strategy, metric.trials]))).toEqual({
        random: 500,
        proximity: 300,
        'row-clear': 300,
        'lookahead-2': 100,
      });
      for (const metric of puzzle.humanStrategyMetrics) {
        expect(metric.clears).toBe(Math.round(metric.clearRate * metric.trials));
        expect(metric.clears + metric.failures).toBe(metric.trials);
        expect(metric.clearRate95.lower).toBeLessThanOrEqual(metric.clearRate);
        expect(metric.clearRate95.upper).toBeGreaterThanOrEqual(metric.clearRate);
        expect(
          metric.clearRate
          + metric.earlyCollapseRate
          + metric.lateNearMissRate
          + metric.lateLargeRemainderRate
          + metric.heightOverflowRate
          + metric.unknownFailureRate,
        ).toBeCloseTo(1, 3);
      }
    }
  });

  it.each(PUZZLES)('replays Master $displayNumber and verifies every cached hint', (puzzle) => {
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
    expect(puzzle.allPathHintsVerified).toBe(true);
  });
});
