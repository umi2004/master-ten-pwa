import { createBoard, createGameState } from '../src/core';
import { auditTrapDepths } from '../src/generator/v4Analysis';
import { applySearchMove, getSearchMoves, solveWithDfs, type FirstMoveAnalysis } from '../src/solver';

function check(sequence: readonly number[]): boolean {
  for (let additions = 0; additions <= 2; additions += 1) {
    const state = createGameState(createBoard(sequence), additions);
    if (getSearchMoves(state).length < 3) continue;
    const solved = solveWithDfs(state, { nodeLimit: 1_000_000, timeLimitMs: 5_000, maxDepth: 100 });
    if (solved.status !== 'SOLVED') continue;
    for (const move of getSearchMoves(state)) {
      const child = solveWithDfs(applySearchMove(state, move), {
        nodeLimit: 1_000_000,
        timeLimitMs: 5_000,
        maxDepth: 100,
      });
      if (child.status !== 'UNSOLVABLE') continue;
      const analysis: FirstMoveAnalysis = {
        move,
        classification: 'LOSING',
        status: 'UNSOLVABLE',
        terminationReason: 'exhausted',
      };
      const trap = auditTrapDepths(state, [analysis], 6);
      if (trap.delayedTrapCount > 0) {
        console.log(JSON.stringify({ sequence, additions, move, trap }));
        return true;
      }
    }
  }
  return false;
}

function enumerate(length: number, prefix: number[], maximumClass: number): boolean {
  if (prefix.length === length) return check(prefix);
  for (let value = 1; value <= Math.min(5, maximumClass + 1); value += 1) {
    prefix.push(value);
    if (enumerate(length, prefix, Math.max(maximumClass, value))) return true;
    prefix.pop();
  }
  return false;
}

for (let length = 3; length <= 9; length += 1) {
  if (enumerate(length, [1], 1)) process.exit(0);
}
console.log('NOT_FOUND');
