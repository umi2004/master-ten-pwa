import { createBoard, createGameState, type GameMove } from '../src/core';
import { V3_COMPARATIVE_CANDIDATES } from '../src/generator/v3Candidates';
import { solveWithDfs } from '../src/solver';

function moveKey(move: GameMove): string {
  if (move.type === 'ADD_NUMBERS') return 'A';
  const first = move.first.row * 9 + move.first.column;
  const second = move.second.row * 9 + move.second.column;
  return `${Math.min(first, second)}-${Math.max(first, second)}`;
}

for (const candidate of V3_COMPARATIVE_CANDIDATES) {
  const result = solveWithDfs(createGameState(createBoard(candidate.cells), 1), {
    nodeLimit: 2_000_000,
    timeLimitMs: 15_000,
    maxDepth: 180,
  });
  console.log(`MINIMUM ${JSON.stringify({
    displayNumber: candidate.displayNumber,
    status: result.status,
    nodes: result.nodesExpanded,
    elapsedMs: result.elapsedMs,
    length: result.solution.length,
    additions: result.solution.filter((move) => move.type === 'ADD_NUMBERS').length,
    solutionKeys: result.solution.map(moveKey),
  })}`);
}
