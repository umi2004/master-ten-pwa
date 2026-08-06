import { writeFileSync } from 'node:fs';

import { evaluateCandidate, generateCandidate } from '../src/generator';
import type { VerifiedPuzzle } from '../src/puzzles/types';

function requestedCount(): number {
  const argument = process.argv.find((value) => value.startsWith('--count='));
  const count = Number(argument?.split('=')[1] ?? 1);
  if (count !== 1) {
    throw new RangeError('V5-Liteでは--count=1だけを許可します。2問目は生成しません。');
  }
  return count;
}

const count = requestedCount();
const puzzles: VerifiedPuzzle[] = [];

for (let index = 0; index < count; index += 1) {
  const evaluation = evaluateCandidate(generateCandidate(index), {
    humanTrialPlan: {
      random: 500,
      proximity: 300,
      'row-clear': 300,
      'lookahead-2': 100,
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
  throw new Error('数字クラス構造が重複する候補があります。');
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
