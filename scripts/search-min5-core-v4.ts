import { createBoard, createGameState, getLegalPairMoves, type GameMove } from '../src/core';
import { createPrng } from '../src/generator/prng';
import { solveWithDfs } from '../src/solver';

const iterations = Number(
  process.argv.find((argument) => argument.startsWith('--iterations='))?.split('=')[1] ?? 20_000,
);
const start = Number(
  process.argv.find((argument) => argument.startsWith('--start='))?.split('=')[1] ?? 0,
);

function moveKey(move: GameMove): string {
  if (move.type === 'ADD_NUMBERS') return 'A';
  const first = move.first.row * 9 + move.first.column;
  const second = move.second.row * 9 + move.second.column;
  return `${Math.min(first, second)}-${Math.max(first, second)}`;
}

let checked = 0;
let unknownFour = 0;
let solvedFour = 0;
for (let offset = 0; offset < iterations; offset += 1) {
  const index = start + offset;
  const prng = createPrng(`master-v4-min5-core-${index}`);
  const length = 6 + prng.integer(15);
  const cells = Array.from({ length }, () => 1 + prng.integer(9));
  const initial = createGameState(createBoard(cells), 5);
  const legalMoves = getLegalPairMoves(initial.board).length;
  if (legalMoves < 1 || legalMoves > 10) continue;
  checked += 1;

  const four = solveWithDfs(createGameState(createBoard(cells), 4), {
    nodeLimit: 250_000,
    timeLimitMs: 750,
    maxDepth: 160,
  });
  if (four.status === 'UNKNOWN') {
    unknownFour += 1;
    continue;
  }
  if (four.status === 'SOLVED') {
    solvedFour += 1;
    continue;
  }

  const five = solveWithDfs(initial, {
    nodeLimit: 2_000_000,
    timeLimitMs: 5_000,
    maxDepth: 220,
  });
  if (five.status !== 'SOLVED') continue;
  console.log(`FOUND ${JSON.stringify({
    index,
    cells,
    legalMoves,
    four: {
      status: four.status,
      nodes: four.nodesExpanded,
      elapsedMs: four.elapsedMs,
    },
    five: {
      status: five.status,
      nodes: five.nodesExpanded,
      elapsedMs: five.elapsedMs,
      length: five.solution.length,
      used: five.solution.filter((move) => move.type === 'ADD_NUMBERS').length,
      solution: five.solution.map(moveKey),
    },
  })}`);
  process.exit(0);
}

console.log(`NOT_FOUND ${JSON.stringify({ start, iterations, checked, solvedFour, unknownFour })}`);
