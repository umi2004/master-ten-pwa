import { createBoard, createGameState } from '../src/core';
import { HUMAN_BENCHMARK_TRIALS, simulateHumanStrategy } from '../src/generator/humanPlayers';
import { V3_COMPARATIVE_CANDIDATES } from '../src/generator/v3Candidates';
import type { HumanStrategyId } from '../src/puzzles/types';

const strategies = Object.keys(HUMAN_BENCHMARK_TRIALS) as HumanStrategyId[];
for (const candidate of V3_COMPARATIVE_CANDIDATES) {
  const initial = createGameState(createBoard(candidate.cells), 5);
  const human = strategies.map((strategy) => simulateHumanStrategy(
    initial,
    `${candidate.seed}|v4-reanalysis`,
    strategy,
    HUMAN_BENCHMARK_TRIALS[strategy],
  ));
  console.log(JSON.stringify({
    displayNumber: candidate.displayNumber,
    savedLength: candidate.solutionKeys.length,
    savedAdditions: candidate.solutionKeys.filter((key) => key === 'A').length,
    minimumAdditionLength: (candidate.minimumSolutionKeys ?? candidate.solutionKeys).length,
    minimumAdditions: candidate.minimumAdditions,
    human: human.map((metric) => ({
      strategy: metric.strategy,
      trials: metric.trials,
      successRate: metric.clearRate,
      successRate95: metric.clearRate95,
      nearMissRate: metric.nearMissRate,
      lateLargeRemainderRate: metric.lateLargeRemainderRate,
      heightOverflowRate: metric.heightOverflowRate,
      meanResidualAliveOnFailure: metric.meanResidualAliveOnFailure,
      medianResidualAliveOnFailure: metric.medianResidualAliveOnFailure,
    })),
  }));
}
