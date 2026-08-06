import { createBoard, createGameState, getLegalPairMoves } from '../src/core';
import { solveWithDfs } from '../src/solver';

const maximumResults = Number(
  process.argv.find((argument) => argument.startsWith('--results='))?.split('=')[1] ?? 20,
);
let checked = 0;
let capOneUnsolvable = 0;
let unknown = 0;
let found = 0;

for (let columnCoefficient = 1; columnCoefficient <= 4; columnCoefficient += 1) {
  for (let code = 0; code < 5 ** 5; code += 1) {
    let remainder = code;
    const offsets = [0];
    for (let row = 1; row < 6; row += 1) {
      offsets.push(remainder % 5);
      remainder = Math.floor(remainder / 5);
    }
    const cells = Array.from({ length: 54 }, (_, index) => {
      const row = Math.floor(index / 9);
      const column = index % 9;
      return 1 + (((offsets[row] ?? 0) + column * columnCoefficient) % 5);
    });
    const initialMoves = getLegalPairMoves(createBoard(cells)).length;
    if (initialMoves < 1 || initialMoves > 12) continue;
    checked += 1;
    const one = solveWithDfs(createGameState(createBoard(cells), 1), {
      nodeLimit: 1_000_000,
      timeLimitMs: 2_000,
      maxDepth: 180,
    });
    if (one.status === 'UNKNOWN') {
      unknown += 1;
      continue;
    }
    if (one.status !== 'UNSOLVABLE') continue;
    capOneUnsolvable += 1;
    const results: unknown[] = [{ cap: 1, status: one.status, nodes: one.nodesExpanded }];
    for (let cap = 2; cap <= 5; cap += 1) {
      const result = solveWithDfs(createGameState(createBoard(cells), cap), {
        nodeLimit: 10_000_000,
        timeLimitMs: 20_000,
        maxDepth: 360,
      });
      results.push({ cap, status: result.status, nodes: result.nodesExpanded, length: result.solution.length });
      if (result.status !== 'UNSOLVABLE') break;
    }
    console.log(`CANDIDATE ${JSON.stringify({ columnCoefficient, offsets, initialMoves, cells, results })}`);
    found += 1;
    if (found >= maximumResults) process.exit(0);
  }
}
console.log(`SUMMARY ${JSON.stringify({ checked, capOneUnsolvable, unknown, found })}`);
