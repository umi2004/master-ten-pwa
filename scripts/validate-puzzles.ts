import { applyGameMove, createGameState, RULE_VERSION } from '../src/core';
import { CATALOG_VERSION, PUZZLES } from '../src/puzzles';

if (CATALOG_VERSION !== 'master-catalog-selection-v1') {
  throw new Error(`Unexpected catalog version: ${CATALOG_VERSION}`);
}
if (PUZZLES.length !== 1_000) throw new Error(`Expected 1000 puzzles, got ${PUZZLES.length}`);
if (new Set(PUZZLES.map((puzzle) => puzzle.puzzleId)).size !== PUZZLES.length) {
  throw new Error('Duplicate production puzzleId.');
}
if (new Set(PUZZLES.map((puzzle) => puzzle.initialBoardHash)).size !== PUZZLES.length) {
  throw new Error('Duplicate production board hash.');
}
if (PUZZLES.filter((puzzle) => puzzle.internalBand === 'normal-master').length !== 950) {
  throw new Error('Expected 950 normal-master puzzles.');
}
if (PUZZLES.filter((puzzle) => puzzle.internalBand === 'elite-master').length !== 50) {
  throw new Error('Expected 50 elite-master puzzles.');
}

for (const puzzle of PUZZLES) {
  if (
    puzzle.ruleVersion !== RULE_VERSION
    || puzzle.difficultyTier !== 'MASTER'
    || puzzle.solutionStatus !== 'SOLVED'
    || puzzle.initialBoard.logicalLength !== 42
  ) throw new Error(`Invalid production metadata: ${puzzle.puzzleId}`);
  let state = createGameState(puzzle.initialBoard, 5);
  for (const move of puzzle.verifiedSolution) state = applyGameMove(state, move);
  if (state.status !== 'WON' || state.additionsUsed !== 5) {
    throw new Error(`Broken production route: ${puzzle.puzzleId}`);
  }
}

console.log(`Validated ${PUZZLES.length} MASTER puzzles: all routes WON with exactly five additions.`);
