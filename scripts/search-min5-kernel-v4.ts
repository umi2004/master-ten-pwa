import { createBoard, createGameState, getLegalPairMoves, type GameMove } from '../src/core';
import { createPrng } from '../src/generator/prng';
import { solveWithDfs } from '../src/solver';

const iterations = Number(
  process.argv.find((argument) => argument.startsWith('--iterations='))?.split('=')[1] ?? 100_000,
);
const start = Number(
  process.argv.find((argument) => argument.startsWith('--start='))?.split('=')[1] ?? 0,
);
function moveKey(move: GameMove): string {
  if (move.type === 'ADD_NUMBERS') return 'A';
  return `${move.first.row * 9 + move.first.column}-${move.second.row * 9 + move.second.column}`;
}

let capFourUnsolvable = 0;
let capFourUnknown = 0;
for (let offset = 0; offset < iterations; offset += 1) {
  const index = start + offset;
  const prng = createPrng(`master-v4-kernel-${index}`);
  const length = 1 + prng.integer(24);
  // Canonical match classes are sufficient because game legality depends on
  // equality/complement class, not the representative digit.
  const cells = Array.from({ length }, () => 1 + prng.integer(5));
  const four = solveWithDfs(createGameState(createBoard(cells), 4), {
    nodeLimit: 2_000_000,
    timeLimitMs: 2_000,
    maxDepth: 260,
  });
  if (four.status === 'UNKNOWN') {
    capFourUnknown += 1;
    continue;
  }
  if (four.status !== 'UNSOLVABLE') continue;
  capFourUnsolvable += 1;
  const five = solveWithDfs(createGameState(createBoard(cells), 5), {
    nodeLimit: 20_000_000,
    timeLimitMs: 30_000,
    maxDepth: 420,
  });
  if (five.status !== 'SOLVED') continue;
  console.log(`FOUND_MINIMUM_5 ${JSON.stringify({
    index,
    cells,
    initialMoves: getLegalPairMoves(createBoard(cells)).length,
    four: { nodes: four.nodesExpanded, elapsedMs: four.elapsedMs },
    five: {
      nodes: five.nodesExpanded,
      elapsedMs: five.elapsedMs,
      length: five.solution.length,
      solution: five.solution.map(moveKey),
    },
  })}`);
  process.exit(0);
}
console.log(`NOT_FOUND ${JSON.stringify({ start, iterations, capFourUnsolvable, capFourUnknown })}`);
