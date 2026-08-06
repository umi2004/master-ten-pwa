import { createBoard, createGameState } from '../src/core';
import { solveWithDfs } from '../src/solver';

const maximumLength = Number(
  process.argv.find((argument) => argument.startsWith('--max-length='))?.split('=')[1] ?? 10,
);
let enumerated = 0;
const minimumCounts = [0, 0, 0, 0, 0, 0];

function check(sequence: readonly number[]): boolean {
  enumerated += 1;
  for (let cap = 0; cap <= 5; cap += 1) {
    const result = solveWithDfs(createGameState(createBoard(sequence), cap), {
      nodeLimit: 10_000_000,
      timeLimitMs: 30_000,
      maxDepth: 320,
    });
    if (result.status === 'UNKNOWN') return false;
    if (result.status !== 'SOLVED') continue;
    minimumCounts[cap] = (minimumCounts[cap] ?? 0) + 1;
    if (cap >= 3) {
      console.log(`MINIMUM_${cap} ${JSON.stringify({
        sequence,
        length: result.solution.length,
        nodes: result.nodesExpanded,
      })}`);
    }
    return cap === 5;
  }
  return false;
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

for (let length = 1; length <= maximumLength; length += 1) {
  if (enumerate(length, [1], 1)) process.exit(0);
  console.log(`LENGTH_DONE ${JSON.stringify({ length, enumerated, minimumCounts })}`);
}
console.log(`NOT_FOUND ${JSON.stringify({ maximumLength, enumerated, minimumCounts })}`);
