import { evaluateCandidate, generateCandidate } from '../src/generator';
import { PUZZLES } from '../src/puzzles/catalog.generated';

for (const puzzle of PUZZLES) {
  const regenerated = evaluateCandidate(generateCandidate(puzzle.displayNumber - 1)).puzzle;
  if (JSON.stringify(regenerated) !== JSON.stringify(puzzle)) {
    throw new Error(`問題${puzzle.displayNumber}の固定データが再評価結果と一致しません。`);
  }
}

console.log(`${PUZZLES.length}問: SOLVED、メタデータ、ハッシュ、構造署名を再検証しました。`);
