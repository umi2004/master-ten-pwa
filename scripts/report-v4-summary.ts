import { PUZZLES } from '../src/puzzles/catalog.generated';

const puzzle = PUZZLES[0];
if (!puzzle) throw new Error('V4 local prototype missing.');
const histogram: Record<string, number> = {};
const remainingAdditions: Record<string, number> = {};
let trials = 0;
let clears = 0;
let nearMissRoutes = 0;
for (const metric of puzzle.humanStrategyMetrics) {
  trials += metric.trials;
  clears += metric.clears;
  nearMissRoutes += metric.nearMissRouteCount;
  for (const [alive, count] of Object.entries(metric.residualAliveHistogram)) {
    histogram[alive] = (histogram[alive] ?? 0) + count;
  }
  for (const [remaining, count] of Object.entries(metric.failureRemainingAdditionsDistribution)) {
    remainingAdditions[remaining] = (remainingAdditions[remaining] ?? 0) + count;
  }
}
console.log(JSON.stringify({
  trials,
  clears,
  failures: trials - clears,
  nearMissRoutes,
  nearMissRatePerTrial: nearMissRoutes / trials,
  nearMissRatePerFailure: nearMissRoutes / (trials - clears),
  failureResidualAliveDistribution: histogram,
  failureRemainingAdditionsDistribution: remainingAdditions,
}));
