import { PUZZLES } from '../src/puzzles/catalog.generated';

for (const puzzle of PUZZLES) {
  console.log(JSON.stringify({
    displayNumber: puzzle.displayNumber,
    seed: puzzle.seed,
    alive: puzzle.initialAliveCount,
    rows: puzzle.initialRows,
    density: puzzle.visualDifficulty.initialDensity,
    initialMoves: puzzle.initialMoveCount,
    solutionLength: puzzle.bestKnownSolutionLength,
    solutionAdditions: puzzle.verifiedSolution.filter((move) => move.type === 'ADD_NUMBERS').length,
    minimumAdditions: puzzle.minimumAdditions,
    maximumRows: puzzle.maximumRowsDuringSolution,
    reviewed: puzzle.reviewed,
    human: puzzle.humanStrategyMetrics,
  }));
}
