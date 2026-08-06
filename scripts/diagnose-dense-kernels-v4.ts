import { createBoard, createGameState, getLegalPairMoves } from '../src/core';
import { solveWithDfs } from '../src/solver';

function grid(rows: number, rowCoefficient: number, columnCoefficient: number, offset: number): readonly number[] {
  return Array.from({ length: rows * 9 }, (_, index) => {
    const row = Math.floor(index / 9);
    const column = index % 9;
    return 1 + ((row * rowCoefficient + column * columnCoefficient + offset) % 5);
  });
}

for (let rowCoefficient = 1; rowCoefficient <= 4; rowCoefficient += 1) {
  for (let columnCoefficient = 1; columnCoefficient <= 4; columnCoefficient += 1) {
    if (
      rowCoefficient === columnCoefficient
      || (rowCoefficient + columnCoefficient) % 5 === 0
      || (rowCoefficient - 8 * columnCoefficient) % 5 === 0
    ) continue;
    const cells = grid(6, rowCoefficient, columnCoefficient, 0);
    const results: unknown[] = [];
    for (let cap = 0; cap <= 5; cap += 1) {
      const result = solveWithDfs(createGameState(createBoard(cells), cap), {
        nodeLimit: 20_000_000,
        timeLimitMs: 30_000,
        maxDepth: 420,
      });
      results.push({ cap, status: result.status, nodes: result.nodesExpanded, length: result.solution.length });
      if (result.status === 'UNKNOWN' || result.status === 'SOLVED') break;
    }
    console.log(JSON.stringify({
      rowCoefficient,
      columnCoefficient,
      initialMoves: getLegalPairMoves(createBoard(cells)).length,
      cells,
      results,
    }));
  }
}
