import { evaluateCandidate, generateCandidate } from '../src/generator';
import { PUZZLES } from '../src/puzzles/catalog.generated';

if (PUZZLES.length !== 30) {
  throw new Error(`公開カタログは30問でなければなりません: ${PUZZLES.length}`);
}

for (const field of ['puzzleId', 'seed', 'structureSignature'] as const) {
  if (new Set(PUZZLES.map((puzzle) => puzzle[field])).size !== PUZZLES.length) {
    throw new Error(`${field}が重複しています。`);
  }
}

for (const puzzle of PUZZLES) {
  const regenerated = evaluateCandidate(generateCandidate(puzzle.displayNumber - 1)).puzzle;
  if (JSON.stringify(regenerated) !== JSON.stringify(puzzle)) {
    throw new Error(`問題${puzzle.displayNumber}の固定データが再評価結果と一致しません。`);
  }
  if (
    puzzle.solutionStatus !== 'SOLVED' ||
    !puzzle.minimumAdditionsProven ||
    puzzle.initialMoveCount < 1 ||
    puzzle.initialRows < 8 ||
    puzzle.initialRows > 12 ||
    puzzle.difficultyScore < 65 ||
    puzzle.maximumRowsDuringSolution > 48 ||
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
