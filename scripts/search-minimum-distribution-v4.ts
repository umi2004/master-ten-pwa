import { createBoard, createGameState, getLegalPairMoves } from '../src/core';
import { createPrng } from '../src/generator/prng';
import { solveWithDfs } from '../src/solver';

const iterations = Number(
  process.argv.find((argument) => argument.startsWith('--iterations='))?.split('=')[1] ?? 10_000,
);
const start = Number(
  process.argv.find((argument) => argument.startsWith('--start='))?.split('=')[1] ?? 0,
);
const counts = { minimum0: 0, minimum1: 0, minimum2: 0, over2: 0, unknown: 0 };

for (let offset = 0; offset < iterations; offset += 1) {
  const index = start + offset;
  const prng = createPrng(`master-v4-minimum-distribution-${index}`);
  const length = 18 + prng.integer(37);
  const cells = Array.from({ length }, () => 1 + prng.integer(9));
  const legal = getLegalPairMoves(createBoard(cells)).length;
  if (legal < 1 || legal > 24) continue;
  let classified = false;
  for (let cap = 0; cap <= 2; cap += 1) {
    const result = solveWithDfs(createGameState(createBoard(cells), cap), {
      nodeLimit: cap === 0 ? 100_000 : 500_000,
      timeLimitMs: cap === 0 ? 100 : 750,
      maxDepth: 180,
    });
    if (result.status === 'UNKNOWN') {
      counts.unknown += 1;
      classified = true;
      break;
    }
    if (result.status === 'SOLVED') {
      counts[`minimum${cap}` as 'minimum0' | 'minimum1' | 'minimum2'] += 1;
      classified = true;
      if (cap >= 2) console.log(`MINIMUM_${cap} ${JSON.stringify({ index, cells, legal, length: result.solution.length })}`);
      break;
    }
  }
  if (!classified) {
    counts.over2 += 1;
    console.log(`OVER_2 ${JSON.stringify({ index, cells, legal })}`);
  }
}

console.log(`DISTRIBUTION ${JSON.stringify({ start, iterations, counts })}`);
