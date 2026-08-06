import { describe, expect, it } from 'vitest';

import { applyGameMove, createGameState, type GameState } from '../../src/core';
import { evaluateCandidate, generateCandidate } from '../../src/generator';
import { HintEngine } from '../../src/hints';
import { PUZZLES } from '../../src/puzzles';
import type { SolverResult } from '../../src/solver';

describe('最初の5問品質ゲート', () => {
  it('公開候補は5問だけで、ID・seed・構造が一意である', () => {
    expect(PUZZLES).toHaveLength(5);
    expect(new Set(PUZZLES.map((puzzle) => puzzle.puzzleId)).size).toBe(5);
    expect(new Set(PUZZLES.map((puzzle) => puzzle.seed)).size).toBe(5);
    expect(new Set(PUZZLES.map((puzzle) => puzzle.structureSignature)).size).toBe(5);
  });

  it('全問がMaster候補の基本ゲートを満たす', () => {
    for (const puzzle of PUZZLES) {
      expect(puzzle.solutionStatus).toBe('SOLVED');
      expect(puzzle.initialRows).toBeGreaterThanOrEqual(8);
      expect(puzzle.initialRows).toBeLessThanOrEqual(12);
      expect(puzzle.initialAliveCount % 2).toBe(0);
      expect(puzzle.initialMoveCount).toBeGreaterThan(0);
      expect(puzzle.minimumAdditionsProven).toBe(true);
      expect(puzzle.minimumAdditions).toBeLessThanOrEqual(3);
      expect(puzzle.maximumRowsDuringSolution).toBeLessThanOrEqual(48);
      expect(puzzle.difficultyScore).toBeGreaterThanOrEqual(65);
      expect(puzzle.reviewed).toBe(true);
    }
  });

  it('行数・解答手数・追加回数が単一値に偏らない', () => {
    expect(new Set(PUZZLES.map((puzzle) => puzzle.initialRows)).size).toBeGreaterThan(1);
    expect(new Set(PUZZLES.map((puzzle) => puzzle.bestKnownSolutionLength)).size).toBeGreaterThan(1);
    expect(new Set(PUZZLES.map((puzzle) => puzzle.minimumAdditions)).size).toBeGreaterThan(1);
    expect(PUZZLES.filter((puzzle) => puzzle.minimumAdditions > 0).length).toBeGreaterThanOrEqual(2);
    expect(PUZZLES.some((puzzle) => puzzle.trapMoveCount > 0)).toBe(true);
  });

  it.each(PUZZLES)('問題$displayNumberの固定メタデータを再生成結果と照合する', (puzzle) => {
    const evaluation = evaluateCandidate(generateCandidate(puzzle.displayNumber - 1));
    expect(evaluation.puzzle).toEqual(puzzle);
  });

  it.each(PUZZLES)('問題$displayNumberの検証解を再生し、全局面で安全ヒントを返す', (puzzle) => {
    const evaluation = evaluateCandidate(generateCandidate(puzzle.displayNumber - 1));
    const solverResult: SolverResult = {
      status: 'SOLVED',
      solution: evaluation.solution,
      nodesExpanded: puzzle.nodesExpanded,
      maxDepth: evaluation.solution.length,
      elapsedMs: 0,
      terminationReason: 'solved',
      provenOptimal: puzzle.provenOptimal,
      minimumAdditionsProven: puzzle.minimumAdditionsProven,
    };
    const engine = new HintEngine(() => solverResult);
    let state: GameState = createGameState(puzzle.initialBoard, puzzle.additionsAllowed);

    for (const expectedMove of evaluation.solution) {
      const hint = engine.getHint(state, { now: () => 0 });
      expect(hint.status).toBe('SAFE_MOVE');
      if (hint.status !== 'SAFE_MOVE') break;
      expect(hint.move).toEqual(expectedMove);
      state = applyGameMove(state, hint.move);
    }
    expect(state.status).toBe('WON');
  });
});
