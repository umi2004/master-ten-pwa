import { evaluateCandidate, generateCandidate } from '../src/generator';
import { PUZZLES } from '../src/puzzles/catalog.generated';

if (PUZZLES.length !== 1) {
  throw new Error(`V4のローカルカタログは試作1問だけでなければなりません: ${PUZZLES.length}`);
}

for (const field of ['puzzleId', 'seed', 'structureSignature'] as const) {
  if (new Set(PUZZLES.map((puzzle) => puzzle[field])).size !== PUZZLES.length) {
    throw new Error(`${field}が重複しています。`);
  }
}

for (const [index, puzzle] of PUZZLES.entries()) {
  const rate = (strategy: string): number =>
    puzzle.humanStrategyMetrics.find((metric) => metric.strategy === strategy)?.clearRate ?? 1;
  const simpleStrategies = ['proximity', 'sum-ten'] as const;
  if (
    rate('random') > 0.01 ||
    simpleStrategies.some((strategy) => rate(strategy) > 0.1) ||
    rate('row-clear') > 0.2 ||
    rate('lookahead-2') > 0.5
  ) {
    throw new Error(
      `Master ${puzzle.displayNumber}は人間向け初期ゲート不合格です: ` +
      `random=${rate('random')}, ` +
      `simple=${simpleStrategies.map((strategy) => `${strategy}:${rate(strategy)}`).join(',')}, ` +
      `row-clear=${rate('row-clear')}, ` +
      `lookahead-2=${rate('lookahead-2')}`,
    );
  }
  const regenerated = evaluateCandidate(generateCandidate(index)).puzzle;
  if (JSON.stringify(regenerated) !== JSON.stringify(puzzle)) {
    throw new Error(`問題${puzzle.displayNumber}の固定データが再評価結果と一致しません。`);
  }
  if (
    puzzle.solutionStatus !== 'SOLVED' ||
    !puzzle.minimumAdditionsProven ||
    puzzle.initialMoveCount < 1 ||
    puzzle.initialAliveCount < 54 ||
    puzzle.initialBoard.cells.some((cell) => cell === 0) ||
    puzzle.additionsAllowed !== 5 ||
    puzzle.additionsAvailable !== 5 ||
    puzzle.minimumAdditions !== 5 ||
    puzzle.difficultyScore < 65 ||
    puzzle.maximumRowsDuringSolution > 48 ||
    !puzzle.allPathHintsVerified ||
    !puzzle.reviewed
  ) {
    throw new Error(`問題${puzzle.displayNumber}が公開品質ゲートを満たしません。`);
  }
}

const minimumAdditions = new Map<number, number>();
for (const puzzle of PUZZLES) {
  minimumAdditions.set(
    puzzle.minimumAdditions,
    (minimumAdditions.get(puzzle.minimumAdditions) ?? 0) + 1,
  );
}
console.log(
  `${PUZZLES.length}問: SOLVED、メタデータ、ハッシュ、構造署名を再検証しました。`,
);
console.log(
  `難度=${Math.min(...PUZZLES.map((puzzle) => puzzle.difficultyScore))}` +
    `～${Math.max(...PUZZLES.map((puzzle) => puzzle.difficultyScore))}, ` +
    `解長=${Math.min(...PUZZLES.map((puzzle) => puzzle.bestKnownSolutionLength))}` +
    `～${Math.max(...PUZZLES.map((puzzle) => puzzle.bestKnownSolutionLength))}, ` +
    `最小追加分布=${JSON.stringify(Object.fromEntries(minimumAdditions))}`,
);
