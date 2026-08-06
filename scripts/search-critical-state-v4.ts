import { createBoard, createGameState, getLegalPairMoves } from '../src/core';
import { simulateHumanStrategy } from '../src/generator/humanPlayers';
import type { HumanStrategyId } from '../src/puzzles/types';
import { solveWithDfs } from '../src/solver';

const screening: Readonly<Record<HumanStrategyId, number>> = {
  random: 64,
  proximity: 32,
  'same-value': 32,
  'sum-ten': 32,
  'row-clear': 32,
  'reserve-add': 32,
  'early-add': 32,
  'lookahead-2': 16,
  'lookahead-3': 0,
  'lookahead-4': 0,
};
const strategies = (Object.keys(screening) as HumanStrategyId[])
  .filter((strategy) => screening[strategy] > 0);
const candidates: Array<{
  readonly seed: string;
  readonly cells: readonly number[];
  readonly initialMoves: number;
  readonly length: number;
  readonly solution: ReturnType<typeof solveWithDfs>['solution'];
  readonly rates: Readonly<Record<string, number>>;
  readonly nearMissRates: Readonly<Record<string, number>>;
  readonly score: number;
}> = [];

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
      const matchClass = 1 + (((offsets[row] ?? 0) + column * columnCoefficient) % 5);
      // Break pure digit substitution while retaining the same local constraint
      // graph: choose one of the two representatives deterministically.
      if (matchClass === 5) return 5;
      return ((row * 7 + column * 3 + code) % 2 === 0) ? matchClass : 10 - matchClass;
    });
    const initialMoves = getLegalPairMoves(createBoard(cells)).length;
    if (initialMoves < 3 || initialMoves > 6) continue;
    const seed = `master-v4-critical-${columnCoefficient}-${code}`;
    const initial = createGameState(createBoard(cells), 5);
    const solved = solveWithDfs(initial, {
      nodeLimit: 1_000_000,
      timeLimitMs: 2_000,
      maxDepth: 220,
    });
    if (solved.status !== 'SOLVED' || solved.solution.length < 35) continue;
    const metrics = strategies.map((strategy) => simulateHumanStrategy(
      initial,
      seed,
      strategy,
      screening[strategy],
    ));
    const rates = Object.fromEntries(metrics.map((metric) => [metric.strategy, metric.clearRate]));
    const nearMissRates = Object.fromEntries(metrics.map((metric) => [metric.strategy, metric.nearMissRate]));
    const score = (rates.random ?? 1) * 100
      + (rates.proximity ?? 1) * 60
      + (rates['sum-ten'] ?? 1) * 60
      + (rates['row-clear'] ?? 1) * 60
      + (rates['lookahead-2'] ?? 1) * 40
      - Object.values(nearMissRates).reduce((sum, rate) => sum + rate, 0) * 5;
    candidates.push({
      seed,
      cells,
      initialMoves,
      length: solved.solution.length,
      solution: solved.solution,
      rates,
      nearMissRates,
      score,
    });
  }
}

candidates.sort((first, second) => first.score - second.score);
console.log(`SUMMARY ${JSON.stringify({ screened: candidates.length })}`);
for (const candidate of candidates.slice(0, 5)) {
  console.log(`BEST ${JSON.stringify({
    seed: candidate.seed,
    cells: candidate.cells,
    initialMoves: candidate.initialMoves,
    length: candidate.length,
    additions: candidate.solution.filter((move) => move.type === 'ADD_NUMBERS').length,
    rates: candidate.rates,
    nearMissRates: candidate.nearMissRates,
    score: candidate.score,
  })}`);
}
