import { performance } from 'node:perf_hooks';

import { createBoard, createGameState } from '../src/core';
import {
  HUMAN_BENCHMARK_TRIALS,
  analyzePostHocDifficulty,
  generateCandidate,
  simulateHumanStrategy,
} from '../src/generator';
import type { HumanStrategyId } from '../src/puzzles/types';

const strategies = Object.keys(HUMAN_BENCHMARK_TRIALS) as HumanStrategyId[];
const requestedDisplay = Number(
  process.argv.find((argument) => argument.startsWith('--display='))?.split('=')[1] ?? 0,
);
const requestedStrategy = process.argv
  .find((argument) => argument.startsWith('--strategy='))
  ?.split('=')[1] as HumanStrategyId | undefined;
const humanOnly = process.argv.includes('--human-only');
const postHocOnly = process.argv.includes('--posthoc-only');

const results: unknown[] = [];
for (let index = 0; index < 5; index += 1) {
  const candidate = generateCandidate(index);
  if (requestedDisplay !== 0 && candidate.displayNumber !== requestedDisplay) continue;
  const initialState = createGameState(createBoard(candidate.cells), candidate.additionsAllowed);
  const startedAt = performance.now();
  const human = [];
  if (!postHocOnly) {
    for (const strategy of strategies.filter((strategy) => !requestedStrategy || strategy === requestedStrategy)) {
      const strategyStartedAt = performance.now();
      const metrics = simulateHumanStrategy(
        initialState,
        candidate.seed,
        strategy,
        HUMAN_BENCHMARK_TRIALS[strategy],
      );
      human.push(metrics);
      console.log(JSON.stringify({
        displayNumber: candidate.displayNumber,
        elapsedMs: Math.round(performance.now() - strategyStartedAt),
        ...metrics,
      }));
    }
  }
  const postHoc = humanOnly
    ? undefined
    : analyzePostHocDifficulty(initialState, candidate.solution, candidate.seed);
  const result = {
    displayNumber: candidate.displayNumber,
    elapsedMs: Math.round(performance.now() - startedAt),
    human,
    postHoc,
  };
  results.push(result);
  console.log(`RESULT ${JSON.stringify(result)}`);
}

console.log(`ALL_RESULTS ${JSON.stringify(results)}`);
