import { createBoard, createGameState, type GameMove } from '../src/core';
import { solveWithDfs } from '../src/solver';

const kernels = [
  [1, 2],
  [1, 2, 3],
  [1, 2, 3, 4],
  [1, 2, 3, 4, 5],
  [1, 2, 1, 3],
  [1, 2, 3, 1, 4],
  [1, 2, 1, 2, 3],
] as const;

function moveKey(move: GameMove): string {
  if (move.type === 'ADD_NUMBERS') return 'A';
  return `${move.first.row * 9 + move.first.column}-${move.second.row * 9 + move.second.column}`;
}

for (const cells of kernels) {
  const results: unknown[] = [];
  for (let cap = 0; cap <= 5; cap += 1) {
    const result = solveWithDfs(createGameState(createBoard(cells), cap), {
      nodeLimit: 20_000_000,
      timeLimitMs: 30_000,
      maxDepth: 400,
    });
    results.push({
      cap,
      status: result.status,
      length: result.solution.length,
      nodes: result.nodesExpanded,
      solution: result.solution.map(moveKey),
    });
    if (result.status === 'SOLVED' || result.status === 'UNKNOWN') break;
  }
  console.log(JSON.stringify({ cells, results }));
}
