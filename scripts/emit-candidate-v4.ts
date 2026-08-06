import { createBoard, createGameState, type GameMove } from '../src/core';
import { solveWithDfs } from '../src/solver';

const cells = [
  9, 2, 7, 4, 5, 1, 8, 3, 6, 4, 5, 1, 8, 3, 6, 5, 9, 2,
  9, 2, 7, 4, 5, 1, 8, 3, 6, 4, 5, 1, 8, 3, 6, 5, 9, 2,
  8, 3, 6, 5, 9, 2, 7, 4, 5, 5, 9, 2, 7, 4, 5, 1, 8, 3,
] as const;

function key(move: GameMove): string {
  if (move.type === 'ADD_NUMBERS') return 'A';
  const first = move.first.row * 9 + move.first.column;
  const second = move.second.row * 9 + move.second.column;
  return `${Math.min(first, second)}-${Math.max(first, second)}`;
}

for (const cap of [1, 5]) {
  const result = solveWithDfs(createGameState(createBoard(cells), cap), {
    nodeLimit: 5_000_000,
    timeLimitMs: 30_000,
    maxDepth: 300,
  });
  console.log(JSON.stringify({
    cap,
    status: result.status,
    nodes: result.nodesExpanded,
    elapsedMs: result.elapsedMs,
    length: result.solution.length,
    additions: result.solution.filter((move) => move.type === 'ADD_NUMBERS').length,
    keys: result.solution.map(key),
  }));
}
