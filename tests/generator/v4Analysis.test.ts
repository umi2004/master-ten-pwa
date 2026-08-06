import { describe, expect, it } from 'vitest';

import { createBoard, createGameState, type GameMove } from '../../src/core';
import {
  auditCriticalDecision,
  auditTrapDepths,
  calculateRecoveryCapacity,
  classifyAdditionTiming,
  classifyHumanFailure,
  isNearMissState,
  summarizeMoveClassifications,
} from '../../src/generator';
import type { FirstMoveAnalysis, PostHocMoveClassification } from '../../src/solver';
import { solveMultiObjective, type MultiObjectiveSolverResult } from '../../src/solver';

const add: GameMove = { type: 'ADD_NUMBERS' };
const pair = (first: number, second: number): GameMove => ({
  type: 'PAIR',
  first: { row: Math.floor(first / 9), column: first % 9 },
  second: { row: Math.floor(second / 9), column: second % 9 },
});

function analysis(move: GameMove, classification: PostHocMoveClassification): FirstMoveAnalysis {
  return {
    move,
    classification,
    status: classification === 'LOSING' ? 'UNSOLVABLE' : classification === 'UNKNOWN' ? 'UNKNOWN' : 'SOLVED',
    terminationReason: classification === 'LOSING' ? 'exhausted' : classification === 'UNKNOWN' ? 'node-limit' : 'solved',
  };
}

describe('V4 post-hoc classifications', () => {
  it('keeps all four move classes separate', () => {
    const ratios = summarizeMoveClassifications([
      analysis(add, 'OPTIMAL_SAFE'),
      analysis(pair(0, 1), 'RECOVERABLE'),
      analysis(pair(1, 2), 'LOSING'),
      analysis(pair(2, 3), 'UNKNOWN'),
    ]);
    expect(ratios).toEqual({
      optimalSafeMoveRatio: 0.25,
      recoverableMoveRatio: 0.25,
      losingMoveRatio: 0.25,
      unknownMoveRatio: 0.25,
    });
  });

  it('classifies optimal and losing first moves with exact small-state search', () => {
    const state = createGameState(createBoard([1, 1, 1, 2]), 2);
    const result = solveMultiObjective(state, 2, {
      nodeLimit: 1_000_000,
      timeLimitMs: 30_000,
      maxDepth: 80,
    });
    expect(result.minimumAdditions).toBe(2);
    expect(result.minimumAdditionsProven).toBe(true);
    expect(result.optimalFirstMoves.length).toBeGreaterThan(0);
    expect(result.losingFirstMoves.length).toBeGreaterThan(0);
    expect(result.unknownFirstMoves).toHaveLength(0);
  });

  it('detects an exact delayed trap and its near-miss route', () => {
    const state = createGameState(createBoard([1, 1, 1, 2]), 2);
    const losing = analysis(pair(0, 1), 'LOSING');
    const trap = auditTrapDepths(state, [losing], 6);
    expect(trap.delayedTrapCount).toBe(1);
    expect(trap.trapDepthMinimum).toBe(3);
    expect(trap.nearMissRouteCount).toBe(1);
  });

  it('detects normal and strong Critical Decisions', () => {
    const strong = auditCriticalDecision([
      analysis(add, 'OPTIMAL_SAFE'),
      analysis(pair(0, 1), 'LOSING'),
      analysis(pair(1, 2), 'RECOVERABLE'),
      analysis(pair(2, 3), 'LOSING'),
    ]);
    expect(strong.isCriticalDecision).toBe(true);
    expect(strong.isStrongCriticalDecision).toBe(true);
  });

  it('does not prove a decision when UNKNOWN obstructs the ratios', () => {
    const uncertain = auditCriticalDecision([
      analysis(add, 'OPTIMAL_SAFE'),
      analysis(pair(0, 1), 'LOSING'),
      analysis(pair(1, 2), 'UNKNOWN'),
      analysis(pair(2, 3), 'UNKNOWN'),
    ]);
    expect(uncertain.isCriticalDecision).toBe(false);
  });
});

function result(overrides: Partial<MultiObjectiveSolverResult> = {}): MultiObjectiveSolverResult {
  return {
    status: 'SOLVED',
    minimumAdditions: 5,
    minimumAdditionsProven: true,
    minimumMovesAtMinimumAdditions: 40,
    minimumMovesProven: true,
    minimumMaximumRows: 10,
    minimumMaximumRowsProven: true,
    minimumAdditionSolution: [],
    minimumMoveSolutionAtMinimumAdditions: [],
    lowHeightSolution: [],
    recommendedHumanSolution: [],
    optimalFirstMoves: [add],
    recoverableFirstMoves: [],
    losingFirstMoves: [],
    unknownFirstMoves: [],
    firstMoveAnalyses: [],
    additionCapProofs: [],
    nodesExpanded: 1,
    elapsedMs: 1,
    terminationReason: 'solved',
    ...overrides,
  };
}

describe('V4 timing and recovery definitions', () => {
  it('does not count a timing variant without a meaningful objective change', () => {
    const baseline = { label: 'do-not-add' as const, result: result() };
    const comparison = { label: 'add-after-one' as const, result: result() };
    expect(classifyAdditionTiming(baseline, comparison)).toBe('neutralAdditionTiming');
  });

  it('marks a solved-to-unsolvable early addition as harmful', () => {
    const baseline = { label: 'do-not-add' as const, result: result() };
    const comparison = {
      label: 'add-now' as const,
      result: result({ status: 'UNSOLVABLE', minimumAdditions: null }),
    };
    expect(classifyAdditionTiming(baseline, comparison)).toBe('harmfulEarlyAddition');
  });

  it('separates any-solution, near-optimal, and unrecoverable recovery', () => {
    const recovery = calculateRecoveryCapacity(result({
      firstMoveAnalyses: [
        {
          ...analysis(pair(0, 1), 'RECOVERABLE'),
          objective: { additions: 5, moves: 44, maximumRows: 11 },
        },
        analysis(pair(1, 2), 'LOSING'),
      ],
    }));
    expect(recovery.recoveryToAnySolutionRate).toBe(0.5);
    expect(recovery.recoveryToNearOptimalSolutionRate).toBe(0.5);
    expect(recovery.unrecoverableRate).toBe(0.5);
  });
});

describe('V4 near-miss and failure classification', () => {
  it('recognizes additions=0, no legal pair, LOST, and 2..10 residual cells', () => {
    const state = createGameState(createBoard([1, 2]), 0);
    expect(isNearMissState(state)).toBe(true);
    expect(classifyHumanFailure(state)).toBe('LATE_NEAR_MISS');
  });

  it('does not call a state with additions remaining a near miss', () => {
    expect(isNearMissState(createGameState(createBoard([1, 2]), 1))).toBe(false);
  });

  it('distinguishes a legal-move-free 11-cell remainder', () => {
    const cells = Array.from({ length: 11 }, (_, index) => {
      const row = Math.floor(index / 9);
      const column = index % 9;
      return 1 + ((row * 2 + column) % 5);
    });
    const state = createGameState(createBoard(cells), 0);
    expect(state.status).toBe('LOST');
    expect(classifyHumanFailure(state)).toBe('LATE_LARGE_REMAINDER');
  });

  it('never calls a winning state a near miss', () => {
    const won = createGameState(createBoard([]), 0);
    expect(won.status).toBe('WON');
    expect(isNearMissState(won)).toBe(false);
  });

  it('classifies a board-height blocked state separately', () => {
    const cells = Array.from({ length: 48 * 9 }, (_, index) => {
      const row = Math.floor(index / 9);
      const column = index % 9;
      return 1 + ((row * 2 + column) % 5);
    });
    const state = createGameState(createBoard(cells), 1);
    expect(classifyHumanFailure(state)).toBe('HEIGHT_OVERFLOW');
  });
});
