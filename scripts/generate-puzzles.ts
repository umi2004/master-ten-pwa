import { writeFileSync } from 'node:fs';

import { evaluateCandidate, generateCandidate, PROTOTYPE_DISPLAY_NUMBERS } from '../src/generator';
import type { VerifiedPuzzle } from '../src/puzzles/types';

function requestedCount(): number {
  const argument = process.argv.find((value) => value.startsWith('--count='));
  const count = Number(argument?.split('=')[1] ?? PROTOTYPE_DISPLAY_NUMBERS.length);
  if (!Number.isInteger(count) || count < 1 || count > 10 || count > PROTOTYPE_DISPLAY_NUMBERS.length) {
    throw new RangeError(`V8-Liteでは1～${PROTOTYPE_DISPLAY_NUMBERS.length}問だけを生成できます。`);
  }
  return count;
}

const count = requestedCount();
const puzzles: VerifiedPuzzle[] = [];

for (let index = 0; index < count; index += 1) {
  const evaluation = evaluateCandidate(generateCandidate(index), {
    humanTrialPlan: {
      random: 200,
      proximity: 150,
      'row-clear': 150,
      'reserve-add': 150,
      'early-add': 150,
      'lookahead-2': 80,
    },
  });
  puzzles.push(evaluation.puzzle);
  console.log(
    `#${evaluation.puzzle.displayNumber}: ${evaluation.puzzle.designFamily}, ` +
      `${evaluation.puzzle.initialRows}行, 追加${evaluation.puzzle.minimumAdditions}, ` +
      `難度${evaluation.puzzle.difficultyScore}, ${evaluation.solution.length}手`,
  );
}

const ids = new Set(puzzles.map((puzzle) => puzzle.puzzleId));
const seeds = new Set(puzzles.map((puzzle) => puzzle.seed));
const structures = new Set(puzzles.map((puzzle) => puzzle.structureSignature));
if (ids.size !== puzzles.length || seeds.size !== puzzles.length) {
  throw new Error('問題IDまたはseedが重複しています。');
}
if (structures.size !== puzzles.length) {
  console.warn(`数字クラス構造は${structures.size}種類です。初期数字ハッシュと解経路の一意性を優先します。`);
}

const file = `// このファイルは npm run generate:puzzles で生成されます。\n` +
  `// 手作業で問題配置を編集しないでください。\n\n` +
  `import type { VerifiedPuzzle } from './types';\n\n` +
  `export const PUZZLES: readonly VerifiedPuzzle[] = ${JSON.stringify(puzzles, null, 2)};\n`;

writeFileSync(
  new URL('../src/puzzles/catalog.generated.ts', import.meta.url),
  file,
  'utf8',
);

console.log(`${puzzles.length}問をcatalog.generated.tsへ固定しました。`);
