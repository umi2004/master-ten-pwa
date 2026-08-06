import { createBoard, createGameState } from '../src/core';
import { V3_COMPARATIVE_CANDIDATES } from '../src/generator/v3Candidates';
import { applySearchMove, getSearchMoves, solveWithDfs } from '../src/solver';

for (const candidate of V3_COMPARATIVE_CANDIDATES) {
  const initial = createGameState(createBoard(candidate.cells), 5);
  const statuses = { SOLVED: 0, UNSOLVABLE: 0, UNKNOWN: 0 };
  for (const move of getSearchMoves(initial)) {
    const result = solveWithDfs(applySearchMove(initial, move), {
      nodeLimit: 5_000_000,
      timeLimitMs: 30_000,
      maxDepth: 300,
    });
    statuses[result.status] += 1;
  }
  console.log(JSON.stringify({
    displayNumber: candidate.displayNumber,
    legalTransitions: getSearchMoves(initial).length,
    reachability: statuses,
    v4Classification: {
      OPTIMAL_SAFE: 0,
      RECOVERABLE: 0,
      LOSING: statuses.UNSOLVABLE,
      UNKNOWN: statuses.SOLVED + statuses.UNKNOWN,
      note: 'SOLVED children remain UNKNOWN until minimum moves and maximum rows are proved.',
    },
  }));
}
