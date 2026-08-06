import { createBoard, createGameState } from '../src/core';
import { solveWithDfs } from '../src/solver';

for (let ones = 1; ones <= 25; ones += 2) {
  const cells = [...Array<number>(ones).fill(1), 2];
  const results: unknown[] = [];
  for (let cap = 0; cap <= 5; cap += 1) {
    const result = solveWithDfs(createGameState(createBoard(cells), cap), {
      nodeLimit: 5_000_000,
      timeLimitMs: 10_000,
      maxDepth: 300,
    });
    results.push({ cap, status: result.status, length: result.solution.length, nodes: result.nodesExpanded });
    if (result.status === 'SOLVED' || result.status === 'UNKNOWN') break;
  }
  console.log(JSON.stringify({ ones, cells, results }));
}
