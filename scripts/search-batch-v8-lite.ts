import { writeFileSync } from 'node:fs';

import {
  canAddNumbers,
  type Cell,
  createBoard,
  createGameState,
  getLegalPairMoves,
  type GameMove,
  type GameState,
} from '../src/core';
import { simulateHumanStrategy } from '../src/generator/humanPlayers';
import { V5_LITE_PLAYTEST_CANDIDATE } from '../src/generator/v5LiteCandidate';
import { V6_LITE_HARD_SAMPLE } from '../src/generator/v6LiteCandidate';
import { V7_LITE_HARDER_SAMPLE } from '../src/generator/v7LiteCandidate';
import { V8_LITE_BATCH_CANDIDATES } from '../src/generator/v8BatchCandidates.generated';
import type { DifficultyTier, HumanStrategyId } from '../src/puzzles/types';
import { applySearchMove, countSolutionAdditions, solveWithDfs } from '../src/solver';

const MAX_CANDIDATES = 250;
const TARGET_ACCEPTED = 8;
const MAX_ELAPSED_MS = 35 * 60_000;
const acceptedOnly = process.argv.includes('--accepted-only');
const rankedExisting = process.argv.includes('--ranked-existing');
const RANKED_EXISTING_INDEXES = [158, 212, 78, 74, 222, 178, 54, 142, 185, 56] as const;
const BASE = V7_LITE_HARDER_SAMPLE.cells;
const SCHEDULES: readonly (readonly number[])[] = [
  [7, 18, 18, 8],
  [8, 16, 20, 8],
  [10, 20, 12, 6],
  [6, 24, 18, 8],
  [12, 14, 22, 6],
  [14, 10, 24, 6],
];

function nextRandom(state: number): number {
  let value = state | 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

function mutate(index: number): Cell[] {
  const cells = [...BASE];
  let random = nextRandom(0x63d83595 ^ Math.imul(index + 1, 0x9e3779b1));
  const integer = (maximum: number): number => {
    random = nextRandom(random);
    return random % maximum;
  };
  const mode = index % 4;
  if (mode === 0) {
    const swaps = 1 + integer(3);
    for (let count = 0; count < swaps; count += 1) {
      const first = integer(cells.length);
      let second = integer(cells.length - 1);
      if (second >= first) second += 1;
      [cells[first], cells[second]] = [cells[second] ?? 1, cells[first] ?? 1];
    }
  } else if (mode === 1) {
    const changes = 3 + integer(6);
    const start = integer(cells.length - changes + 1);
    for (let offset = 0; offset < changes; offset += 1) {
      const position = start + offset;
      let digit = 1 + integer(9);
      if (digit === cells[position]) digit = digit === 9 ? 1 : digit + 1;
      cells[position] = digit as Cell;
    }
  } else {
    const changes = 3 + integer(6);
    const used = new Set<number>();
    while (used.size < changes) used.add(integer(cells.length));
    for (const position of used) {
      let digit = mode === 2 ? 10 - (cells[position] ?? 5) : 1 + integer(9);
      if (digit < 1 || digit > 9 || digit === cells[position]) digit = 1 + integer(9);
      if (digit === cells[position]) digit = digit === 9 ? 1 : digit + 1;
      cells[position] = digit as Cell;
    }
  }
  return cells;
}

function moveKey(move: GameMove): string {
  if (move.type === 'ADD_NUMBERS') return 'A';
  const first = move.first.row * 9 + move.first.column;
  const second = move.second.row * 9 + move.second.column;
  return `${Math.min(first, second)}-${Math.max(first, second)}`;
}

function scheduledPrefix(
  initial: GameState,
  schedule: readonly number[],
  choiceOffset: number,
): { readonly state: GameState; readonly moves: readonly GameMove[] } | undefined {
  let state = initial;
  const moves: GameMove[] = [];
  for (let phase = 0; phase < schedule.length; phase += 1) {
    for (let step = 0; step < (schedule[phase] ?? 0); step += 1) {
      const pairs = getLegalPairMoves(state.board);
      const move = pairs[(choiceOffset + phase * 5 + step * 3) % pairs.length];
      if (!move) break;
      moves.push(move);
      state = applySearchMove(state, move);
    }
    if (!canAddNumbers(state)) return undefined;
    moves.push({ type: 'ADD_NUMBERS' });
    state = applySearchMove(state, { type: 'ADD_NUMBERS' });
  }
  return { state, moves };
}

function replay(initial: GameState, solution: readonly GameMove[]): GameState {
  let state = initial;
  for (const move of solution) state = applySearchMove(state, move);
  return state;
}

function pooledSuccessfulAdditions(
  metrics: readonly ReturnType<typeof simulateHumanStrategy>[],
): { readonly mean: number; readonly median: number; readonly count: number } {
  const additions: number[] = [];
  for (const metric of metrics) {
    for (const [value, count] of Object.entries(metric.successfulAdditionsDistribution)) {
      additions.push(...Array.from({ length: count }, () => Number(value)));
    }
  }
  additions.sort((a, b) => a - b);
  const mean = additions.length === 0
    ? 0
    : additions.reduce((sum, value) => sum + value, 0) / additions.length;
  const median = additions.length === 0
    ? 0
    : additions.length % 2 === 1
      ? additions[Math.floor(additions.length / 2)] ?? 0
      : ((additions[additions.length / 2 - 1] ?? 0) + (additions[additions.length / 2] ?? 0)) / 2;
  return { mean, median, count: additions.length };
}

function combinedNearMiss(metrics: readonly ReturnType<typeof simulateHumanStrategy>[]): number {
  const failures = metrics.reduce((sum, metric) => sum + metric.failures, 0);
  const nearMisses = metrics.reduce((sum, metric) => sum + metric.nearMissRouteCount, 0);
  return failures === 0 ? 0 : nearMisses / failures;
}

function canonicalDigits(cells: readonly number[]): string {
  const map = new Map<number, number>();
  let next = 1;
  return cells.map((cell) => {
    if (!map.has(cell)) map.set(cell, next++);
    return map.get(cell);
  }).join('');
}

function exactHash(cells: readonly number[]): string {
  return cells.join('');
}

function pairStructure(initial: GameState): string {
  return getLegalPairMoves(initial.board).map(moveKey).sort().join(',');
}

const excludedExact = new Set([
  V5_LITE_PLAYTEST_CANDIDATE,
  V6_LITE_HARD_SAMPLE,
  V7_LITE_HARDER_SAMPLE,
].map((candidate) => exactHash(candidate.cells)));
const excludedCanonical = new Set([
  V5_LITE_PLAYTEST_CANDIDATE,
  V6_LITE_HARD_SAMPLE,
  V7_LITE_HARDER_SAMPLE,
].map((candidate) => canonicalDigits(candidate.cells)));

interface AcceptedCandidate {
  readonly displayNumber: number;
  readonly seed: string;
  readonly designFamily: 'timing-crossroads';
  readonly prototypeBand: 'MASTER_01_10';
  readonly difficultyTier: DifficultyTier;
  readonly cells: readonly Cell[];
  readonly solutionKeys: readonly string[];
  readonly minimumSolutionKeys?: readonly string[];
  readonly minimumAdditions: number;
  readonly minimumAdditionsProven: boolean;
  readonly acceptanceNotes: readonly string[];
  readonly reviewed: false;
}

const accepted: AcceptedCandidate[] = [];
const acceptedExact = new Set<string>();
const acceptedCanonical = new Set<string>();
const acceptedStructures = new Set<string>();
const acceptedPrefixes = new Set<string>();
const nearCandidates: Array<{
  index: number;
  random: number;
  proximity: number;
  rowClear: number;
  depth2: number;
  nearMiss: number;
  meanAdditions: number;
  medianAdditions: number;
  score: number;
}> = [];
const startedAt = Date.now();
let tested = 0;
let bestDepth2 = 1;

const candidateIndexes = rankedExisting
  ? [...RANKED_EXISTING_INDEXES]
  : acceptedOnly
    ? [158]
    : Array.from({ length: MAX_CANDIDATES }, (_, index) => index);
for (const candidateIndex of candidateIndexes) {
  const targetAccepted = rankedExisting ? 10 : TARGET_ACCEPTED;
  if (Date.now() - startedAt >= MAX_ELAPSED_MS || accepted.length >= targetAccepted) break;
  tested += 1;
  const cells = mutate(candidateIndex);
  const exact = exactHash(cells);
  const canonical = canonicalDigits(cells);
  if (excludedExact.has(exact) || excludedCanonical.has(canonical)) continue;
  const initial = createGameState(createBoard(cells), 5);
  const legalPairs = getLegalPairMoves(initial.board);
  if (legalPairs.length < 2 || legalPairs.length > 20) continue;

  let solved: readonly GameMove[] | undefined;
  for (let scheduleIndex = 0; scheduleIndex < SCHEDULES.length; scheduleIndex += 1) {
    const prefix = scheduledPrefix(initial, SCHEDULES[scheduleIndex] ?? [], candidateIndex + scheduleIndex * 7);
    if (!prefix) continue;
    const result = solveWithDfs(prefix.state, {
      timeLimitMs: 750,
      nodeLimit: 90_000,
      maxDepth: 300,
    });
    if (result.status !== 'SOLVED') continue;
    const proposed = [...prefix.moves, ...result.solution];
    if (countSolutionAdditions(proposed) !== 5 || replay(initial, proposed).status !== 'WON') continue;
    solved = proposed;
    break;
  }
  if (!solved) continue;

  const seed = `master_v8_${candidateIndex.toString().padStart(3, '0')}_${exact.slice(0, 8)}`;
  if (!rankedExisting) {
    const primary = {
      random: simulateHumanStrategy(initial, seed, 'random', 50),
      proximity: simulateHumanStrategy(initial, seed, 'proximity', 50),
      rowClear: simulateHumanStrategy(initial, seed, 'row-clear', 50),
      lookahead2: simulateHumanStrategy(initial, seed, 'lookahead-2', 20),
    };
    if (
      primary.random.clearRate > 0.08 || primary.proximity.clearRate > 0.24 ||
      primary.rowClear.clearRate > 0.7 || primary.lookahead2.clearRate > 0.9
    ) continue;
  }

  const plan: readonly [HumanStrategyId, number][] = [
    ['random', 200],
    ['proximity', 150],
    ['row-clear', 150],
    ['reserve-add', 150],
    ['early-add', 150],
    ['lookahead-2', 80],
  ];
  const finalMetrics = plan.map(([strategy, trials]) =>
    simulateHumanStrategy(initial, seed, strategy, trials));
  const metric = (strategy: HumanStrategyId) =>
    finalMetrics.find((candidate) => candidate.strategy === strategy)!;
  const simpleAdditions = pooledSuccessfulAdditions(finalMetrics.filter((candidate) =>
    ['proximity', 'row-clear', 'reserve-add', 'early-add'].includes(candidate.strategy)));
  const nearMiss = combinedNearMiss(finalMetrics);
  const random = metric('random').clearRate;
  const proximity = metric('proximity').clearRate;
  const rowClear = metric('row-clear').clearRate;
  const depth2 = metric('lookahead-2').clearRate;
  bestDepth2 = Math.min(bestDepth2, depth2);
  nearCandidates.push({
    index: candidateIndex,
    random,
    proximity,
    rowClear,
    depth2,
    nearMiss,
    meanAdditions: simpleAdditions.mean,
    medianAdditions: simpleAdditions.median,
    score: Math.max(0, random - 0.02) * 20 + Math.max(0, proximity - 0.1) * 12 +
      Math.max(0, depth2 - 0.7) * 8 + Math.max(0, 0.25 - nearMiss) * 8 +
      (depth2 > 0.7 && simpleAdditions.median !== 5 ? 1 : 0),
  });
  if (!rankedExisting && (
    random > 0.02 || proximity > 0.1 || depth2 >= 0.79 || nearMiss < 0.25 ||
    !(depth2 <= 0.7 || simpleAdditions.median === 5)
  )) continue;

  const keys = solved.map(moveKey);
  const structure = pairStructure(initial);
  const prefix = keys.slice(0, 12).join(',');
  if (
    acceptedExact.has(exact) || acceptedCanonical.has(canonical) ||
    (!rankedExisting && (acceptedStructures.has(structure) || acceptedPrefixes.has(prefix)))
  ) continue;

  let tier: DifficultyTier = 'HARD';
  if (
    random <= 0.01 && proximity <= 0.05 && rowClear <= 0.15 && depth2 <= 0.4 &&
    simpleAdditions.median === 5 && nearMiss >= 0.3
  ) tier = 'EXTREME';
  else if (
    random <= 0.015 && proximity <= 0.08 && rowClear <= 0.22 && depth2 <= 0.6 &&
    simpleAdditions.mean >= 4.5 && simpleAdditions.median === 5 && nearMiss >= 0.3
  ) tier = 'MASTER';

  const hasOddClass = [1, 2, 3, 4, 5].some((matchClass) =>
    cells.filter((cell) => Math.min(cell, 10 - cell) === matchClass).length % 2 === 1);
  let minimumSolutionKeys: readonly string[] | undefined;
  let minimumAdditions = 5;
  let minimumAdditionsProven = false;
  const existingMinimum = candidateIndex === 158 ? V8_LITE_BATCH_CANDIDATES[0] : undefined;
  if (rankedExisting && existingMinimum?.minimumSolutionKeys) {
    minimumSolutionKeys = existingMinimum.minimumSolutionKeys;
    minimumAdditions = existingMinimum.minimumAdditions;
    minimumAdditionsProven = existingMinimum.minimumAdditionsProven ?? false;
  } else if (!rankedExisting && hasOddClass) {
    const oneAddition = solveWithDfs(createGameState(createBoard(cells), 1), {
      timeLimitMs: 2_000,
      nodeLimit: 250_000,
      maxDepth: 300,
    });
    if (oneAddition.status === 'SOLVED') {
      minimumSolutionKeys = oneAddition.solution.map(moveKey);
      minimumAdditions = 1;
      minimumAdditionsProven = true;
    }
  }

  accepted.push({
    displayNumber: accepted.length + 1,
    seed,
    designFamily: 'timing-crossroads',
    prototypeBand: 'MASTER_01_10',
    difficultyTier: tier,
    cells,
    solutionKeys: keys,
    ...(minimumSolutionKeys ? { minimumSolutionKeys } : {}),
    minimumAdditions,
    minimumAdditionsProven,
    acceptanceNotes: [
      `V8-Lite ${tier}; ranked from the existing bounded 250-candidate search.`,
      `Final rates R=${random}, P=${proximity}, Row=${rowClear}, D2=${depth2}, nearMiss=${nearMiss}.`,
      `Successful simple-AI additions mean=${simpleAdditions.mean}, median=${simpleAdditions.median}.`,
    ],
    reviewed: false,
  });
  acceptedExact.add(exact);
  acceptedCanonical.add(canonical);
  acceptedStructures.add(structure);
  acceptedPrefixes.add(prefix);
  const counts = (value: DifficultyTier) => accepted.filter((candidate) => candidate.difficultyTier === value).length;
  console.log(`tested=${tested} accepted=${accepted.length} HARD=${counts('HARD')} MASTER=${counts('MASTER')} EXTREME=${counts('EXTREME')} bestD2=${bestDepth2} elapsedMs=${Date.now() - startedAt}`);
}

if (accepted.length < (rankedExisting ? 10 : acceptedOnly ? 1 : 3)) {
  console.log(`NEAREST ${JSON.stringify(nearCandidates.sort((a, b) => a.score - b.score).slice(0, 12))}`);
  throw new Error(`品質条件を満たした候補は${accepted.length}問だけでした。カタログは更新しません。`);
}

const file = `import type { EncodedV3Candidate } from './v3Candidates';\n\n` +
  `/** Bounded V8-Lite batch. All entries are local, unreviewed candidates. */\n` +
  `export const V8_LITE_BATCH_CANDIDATES = ${JSON.stringify(accepted, null, 2)} as const satisfies readonly EncodedV3Candidate[];\n`;
writeFileSync(new URL('../src/generator/v8BatchCandidates.generated.ts', import.meta.url), file, 'utf8');

const counts = (value: DifficultyTier) => accepted.filter((candidate) => candidate.difficultyTier === value).length;
console.log(`FINAL tested=${tested} accepted=${accepted.length} HARD=${counts('HARD')} MASTER=${counts('MASTER')} EXTREME=${counts('EXTREME')} bestD2=${bestDepth2} elapsedMs=${Date.now() - startedAt}`);
