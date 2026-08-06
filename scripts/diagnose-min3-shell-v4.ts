import { createBoard, createGameState, getLegalPairMoves } from '../src/core';
import { solveWithDfs } from '../src/solver';

const shells: Readonly<Record<string, readonly number[]>> = {
  adjacentBlocks: [
    ...Array.from({ length: 26 }, (_, pair) => [3 + (pair % 3), 3 + (pair % 3)]).flat(),
    1,
    2,
  ],
  mirroredPairs: [
    ...Array.from({ length: 26 }, (_, index) => 3 + (index % 3)),
    1,
    2,
    ...Array.from({ length: 26 }, (_, index) => 3 + ((25 - index) % 3)),
  ],
};

for (const [name, cells] of Object.entries(shells)) {
  const results: unknown[] = [];
  for (let cap = 0; cap <= 3; cap += 1) {
    const result = solveWithDfs(createGameState(createBoard(cells), cap), {
      nodeLimit: 10_000_000,
      timeLimitMs: 30_000,
      maxDepth: 320,
    });
    results.push({ cap, status: result.status, nodes: result.nodesExpanded, length: result.solution.length });
    if (result.status === 'UNKNOWN' || result.status === 'SOLVED') break;
  }
  console.log(JSON.stringify({ name, alive: cells.length, moves: getLegalPairMoves(createBoard(cells)).length, results }));
}
