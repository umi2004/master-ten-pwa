import { createBoard, createGameState, getLegalPairMoves } from '../src/core';
import { solveWithDfs } from '../src/solver';

const maximumLength = Number(
  process.argv.find((argument) => argument.startsWith('--max-length='))?.split('=')[1] ?? 11,
);
let enumerated = 0;
let capZeroUnsolvable = 0;
let capOneUnsolvable = 0;

function check(sequence: readonly number[]): boolean {
  enumerated += 1;
  const board = createBoard(sequence);
  if (getLegalPairMoves(board).length === 0) return false;
  const zero = solveWithDfs(createGameState(board, 0), {
    nodeLimit: 1_000_000,
    timeLimitMs: 10_000,
    maxDepth: 120,
  });
  if (zero.status !== 'UNSOLVABLE') return false;
  capZeroUnsolvable += 1;
  const one = solveWithDfs(createGameState(board, 1), {
    nodeLimit: 1_000_000,
    timeLimitMs: 10_000,
    maxDepth: 120,
  });
  if (one.status !== 'UNSOLVABLE') return false;
  capOneUnsolvable += 1;
  const two = solveWithDfs(createGameState(board, 2), {
    nodeLimit: 2_000_000,
    timeLimitMs: 20_000,
    maxDepth: 180,
  });
  if (two.status !== 'SOLVED') return false;
  console.log(`FOUND_MINIMUM_2 ${JSON.stringify({
    sequence,
    length: two.solution.length,
    nodes: two.nodesExpanded,
  })}`);
  return true;
}

function enumerate(length: number, prefix: number[], maximumClass: number): boolean {
  if (prefix.length === length) return check(prefix);
  const nextMaximum = Math.min(5, maximumClass + 1);
  for (let value = 1; value <= nextMaximum; value += 1) {
    prefix.push(value);
    if (enumerate(length, prefix, Math.max(maximumClass, value))) return true;
    prefix.pop();
  }
  return false;
}

for (let length = 2; length <= maximumLength; length += 1) {
  if (enumerate(length, [1], 1)) process.exit(0);
  console.log(`LENGTH_DONE ${JSON.stringify({ length, enumerated, capZeroUnsolvable, capOneUnsolvable })}`);
}
console.log(`NOT_FOUND ${JSON.stringify({ maximumLength, enumerated, capZeroUnsolvable, capOneUnsolvable })}`);
