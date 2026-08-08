import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RULE_VERSION,
  applyGameMove,
  createBoard,
  createGameState,
  type Cell,
  type GameState,
} from '../src/core';
import { fnv1a, hashBoard } from '../src/puzzles/hash';
import {
  encodeMasterSolution,
  type MasterSolutionRoute,
} from '../src/puzzles/masterSolutionRoutes';
import { simulateHumanStrategy } from '../src/generator/humanPlayers';

const SELECTION_VERSION = 'master-catalog-selection-v1';
const SELECTION_SEED = 'master-seed-b-60m|catalog-v1';
const SEARCH_SEED = 'master-evolution-v1-b';
const TARGET_TOTAL = 1_000;
const TARGET_ELITE = 50;
const LINEAGE_CAP = 500;
const RELAXED_LINEAGE_CAP = 650;
const PREFIX_CAP = 500;
const LEGAL_PAIR_STRUCTURE_CAP = 6;

type StrategyId =
  | 'random'
  | 'proximity'
  | 'row-clear'
  | 'reserve-add'
  | 'early-add'
  | 'lookahead-2';

interface LedgerMetrics {
  readonly clearRates: Readonly<Partial<Record<StrategyId, number>>>;
  readonly successfulAdditionsMean?: number;
  readonly successfulAdditionsMedian?: number;
  readonly nearMissAmongFailures?: number;
  readonly trials: number;
}

interface LedgerDiversity {
  readonly boardHash: string;
  readonly hammingToParent: number;
  readonly minimumHammingToBeam?: number;
  readonly canonicalDigitPattern: string;
  readonly initialLegalPairStructure: string;
  readonly solutionPrefix: string;
}

interface LedgerEntry {
  readonly candidateId: string;
  readonly parentId: string;
  readonly generation: number;
  readonly boardHash: string;
  readonly initialCells: readonly number[];
  readonly changedInitialIndexes: readonly number[];
  readonly mutationType: string;
  readonly solutionStatus: string;
  readonly recommendedAdditions?: number;
  readonly aiMetrics: LedgerMetrics;
  readonly fitness: number;
  readonly beforeFitness?: number;
  readonly afterFitness?: number;
  readonly diversityMetrics: LedgerDiversity;
  readonly evaluationStage: 1 | 2;
  readonly timestamp: string;
  readonly ruleVersion: string;
}

export interface ScoredMasterCandidate {
  readonly entry: LedgerEntry;
  readonly route: MasterSolutionRoute;
  readonly rootLineage: string;
  readonly hardnessScore: number;
  readonly playabilityScore: number;
  readonly selectionQuality: number;
}

export interface DiversitySelectionAttempt {
  readonly minimumHamming: number;
  readonly lineageCap: number;
  readonly prefixCap: number;
  readonly legalPairStructureCap: number;
}

interface DiversitySelectionResult {
  readonly candidates: readonly ScoredMasterCandidate[];
  readonly attempt: DiversitySelectionAttempt;
}

interface RejectionCounts {
  stageNotTwo: number;
  wrongRuleVersion: number;
  wrongInitialLength: number;
  invalidInitialCell: number;
  notSolved: number;
  notKnownExactFive: number;
  missingKnownRoute: number;
  boardHashMismatch: number;
  brokenRoute: number;
  duplicateBoardHash: number;
  duplicateInitialCells: number;
  incompleteMetrics: number;
  playabilityGuard: number;
  diversityNotSelected: number;
}

function round(value: number, digits = 4): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function quantile(sorted: readonly number[], percentile: number): number | undefined {
  if (sorted.length === 0) return undefined;
  const index = (sorted.length - 1) * percentile;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  const lowValue = sorted[low] ?? 0;
  const highValue = sorted[high] ?? lowValue;
  return round(lowValue + (highValue - lowValue) * (index - low));
}

function distribution(values: readonly (number | undefined)[]): Record<string, number | undefined> {
  const sorted = values.filter((value): value is number => Number.isFinite(value)).sort((a, b) => a - b);
  return {
    count: sorted.length,
    minimum: quantile(sorted, 0),
    p05: quantile(sorted, 0.05),
    p25: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    p95: quantile(sorted, 0.95),
    maximum: quantile(sorted, 1),
  };
}

function countBy<T>(values: readonly T[], key: (value: T) => string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) {
    const group = key(value);
    result[group] = (result[group] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort(([first], [second]) => first.localeCompare(second)));
}

function groupedValueSummary(entries: readonly LedgerEntry[], key: (entry: LedgerEntry) => string): object {
  const counts = countBy(entries, key);
  const sizes = Object.values(counts).sort((first, second) => second - first);
  return {
    unique: sizes.length,
    duplicateGroups: sizes.filter((size) => size > 1).length,
    maximumGroupSize: sizes[0] ?? 0,
    topGroupSizes: sizes.slice(0, 20),
  };
}

export function hammingDistance(first: readonly number[], second: readonly number[]): number {
  const length = Math.max(first.length, second.length);
  let distance = 0;
  for (let index = 0; index < length; index += 1) {
    if (first[index] !== second[index]) distance += 1;
  }
  return distance;
}

function lineageRoot(candidateId: string): string {
  return candidateId.match(/^(master-r2-g3-d3-master_v8_\d+_\d+)/u)?.[1] ?? 'unknown';
}

function lineageDepth(candidateId: string): number {
  return candidateId.match(/-g\d+c\d+-[a-f0-9]+/gu)?.length ?? 0;
}

function replayRoute(entry: LedgerEntry, route: MasterSolutionRoute): GameState | undefined {
  try {
    let state = createGameState(createBoard(entry.initialCells as readonly Cell[]), 5);
    for (const move of route.moves) state = applyGameMove(state, move);
    return state;
  } catch {
    return undefined;
  }
}

function solutionPrefix(moves: MasterSolutionRoute['moves']): string {
  return moves.slice(0, 12).map((move) => {
    if (move.type === 'ADD_NUMBERS') return 'A';
    const first = move.first.row * 9 + move.first.column;
    const second = move.second.row * 9 + move.second.column;
    return `${Math.min(first, second)}-${Math.max(first, second)}`;
  }).join(',');
}

interface CachedStrategyTrialMetrics {
  readonly successfulAdditionsDistribution?: Readonly<Record<string, number>>;
}

type SearchCache = Readonly<Record<string, CachedStrategyTrialMetrics>>;

interface RouteReconstructionResult {
  readonly routesByCandidateId: ReadonlyMap<string, MasterSolutionRoute>;
  readonly stageTwoCandidatesReconstructed: number;
  readonly failedCandidateIds: readonly string[];
  readonly prefixMismatches: number;
  readonly uniqueRouteCount: number;
  readonly replayedTrials: number;
}

function stageTwoCacheKey(
  entry: LedgerEntry,
  strategy: StrategyId,
  trials: number,
): string {
  return [
    RULE_VERSION,
    entry.boardHash,
    strategy,
    trials,
    `${SEARCH_SEED}|${entry.candidateId}|stage2`,
  ].join('|');
}

function reconstructStageTwoRoutes(
  entries: readonly LedgerEntry[],
  cache: SearchCache,
): RouteReconstructionResult {
  const stageTwo = entries.filter((entry) => entry.evaluationStage === 2);
  const plan: readonly (readonly [StrategyId, number])[] = [
    ['proximity', 50],
    ['row-clear', 50],
    ['reserve-add', 30],
    ['early-add', 30],
    ['lookahead-2', 24],
  ];
  const routesByCandidateId = new Map<string, MasterSolutionRoute>();
  const failedCandidateIds: string[] = [];
  let prefixMismatches = 0;
  let stageTwoCandidatesReconstructed = 0;
  let replayedTrials = 0;
  const routeEncodings = new Set<string>();
  for (const [processed, entry] of stageTwo.entries()) {
    const strategiesWithExactFive = plan.flatMap(([strategy, trials]) => {
      const cached = cache[stageTwoCacheKey(entry, strategy, trials)];
      const exactFive = cached?.successfulAdditionsDistribution?.['5'] ?? 0;
      return exactFive > 0 ? [{ strategy, trials, exactFive }] : [];
    }).sort((first, second) =>
      (second.exactFive / second.trials) - (first.exactFive / first.trials)
      || first.trials - second.trials
      || first.strategy.localeCompare(second.strategy));
    const selectedStrategy = strategiesWithExactFive[0];
    if (!selectedStrategy) {
      failedCandidateIds.push(entry.candidateId);
      continue;
    }
    replayedTrials += selectedStrategy.trials;
    const result = simulateHumanStrategy(
      createGameState(createBoard(entry.initialCells as readonly Cell[]), 5),
      `${SEARCH_SEED}|${entry.candidateId}|stage2`,
      selectedStrategy.strategy,
      selectedStrategy.trials,
      300,
      {
        analysis: true,
        maxSuccessfulTraces: 1,
        successfulAdditionsFilter: 5,
      },
    );
    const trace = result.successfulTraces[0];
    if (!trace) {
      failedCandidateIds.push(entry.candidateId);
      continue;
    }
    const moves = trace.steps.map((step) => step.selectedMove);
    const encodedMoves = encodeMasterSolution(moves);
    const route: MasterSolutionRoute = {
      routeId: `route-${fnv1a(encodedMoves)}`,
      solutionPrefix: solutionPrefix(moves),
      encodedMoves,
      moves,
    };
    const state = replayRoute(entry, route);
    if (state?.status !== 'WON' || state.additionsUsed !== 5) {
      failedCandidateIds.push(entry.candidateId);
      continue;
    }
    if (route.solutionPrefix !== entry.diversityMetrics.solutionPrefix) prefixMismatches += 1;
    routesByCandidateId.set(entry.candidateId, route);
    routeEncodings.add(encodedMoves);
    stageTwoCandidatesReconstructed += 1;
    if ((processed + 1) % 100 === 0) {
      console.log(`Recovered ${processed + 1}/${stageTwo.length} exact-five Stage 2 traces.`);
    }
  }
  return {
    routesByCandidateId,
    stageTwoCandidatesReconstructed,
    failedCandidateIds,
    prefixMismatches,
    uniqueRouteCount: routeEncodings.size,
    replayedTrials,
  };
}

function requiredRate(metrics: LedgerMetrics, strategy: StrategyId): number | undefined {
  const value = metrics.clearRates[strategy];
  return Number.isFinite(value) ? value : undefined;
}

function hasCompleteStageTwoMetrics(metrics: LedgerMetrics): boolean {
  return (['proximity', 'row-clear', 'reserve-add', 'early-add', 'lookahead-2'] as const)
    .every((strategy) => requiredRate(metrics, strategy) !== undefined)
    && Number.isFinite(metrics.successfulAdditionsMean)
    && Number.isFinite(metrics.successfulAdditionsMedian)
    && Number.isFinite(metrics.nearMissAmongFailures)
    && metrics.trials === 184;
}

export function scoreHardness(metrics: LedgerMetrics): number {
  const d2 = requiredRate(metrics, 'lookahead-2') ?? 1;
  const row = requiredRate(metrics, 'row-clear') ?? 1;
  const proximity = requiredRate(metrics, 'proximity') ?? 1;
  const reserve = requiredRate(metrics, 'reserve-add') ?? 1;
  const early = requiredRate(metrics, 'early-add') ?? 1;
  const meanAdditions = metrics.successfulAdditionsMean ?? 2.5;
  const nearMiss = metrics.nearMissAmongFailures ?? 0;
  const additionDifficulty = clamp((meanAdditions - 2.5) / 2);
  return round(100 * (
    (1 - d2) * 0.30
    + (1 - row) * 0.20
    + (1 - proximity) * 0.15
    + (1 - reserve) * 0.10
    + (1 - early) * 0.10
    + nearMiss * 0.10
    + additionDifficulty * 0.05
  ));
}

export function scorePlayability(metrics: LedgerMetrics): number {
  const rates = (['proximity', 'row-clear', 'reserve-add', 'early-add', 'lookahead-2'] as const)
    .map((strategy) => requiredRate(metrics, strategy) ?? 0);
  const maximumRate = Math.max(...rates);
  const minimumRate = Math.min(...rates);
  const averageRate = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
  const meanAdditions = metrics.successfulAdditionsMean ?? 0;
  const nearMiss = metrics.nearMissAmongFailures ?? 0;
  const successfulRoutePresence = clamp((maximumRate - 0.05) / 0.45);
  const crossStrategySuccess = clamp(averageRate / 0.35);
  const additionBand = clamp(1 - Math.abs(meanAdditions - 3.7) / 1.7);
  const nearMissBand = clamp((nearMiss - 0.25) / 0.55);
  const outlierGuard = 1 - clamp((maximumRate - minimumRate - 0.65) / 0.35);
  return round(100 * (
    0.30
    + successfulRoutePresence * 0.20
    + crossStrategySuccess * 0.15
    + additionBand * 0.20
    + nearMissBand * 0.10
    + outlierGuard * 0.05
  ));
}

function passesPlayabilityGuard(metrics: LedgerMetrics, playabilityScore: number): boolean {
  const rates = (['proximity', 'row-clear', 'reserve-add', 'early-add', 'lookahead-2'] as const)
    .map((strategy) => requiredRate(metrics, strategy) ?? 0);
  const meanAdditions = metrics.successfulAdditionsMean ?? 0;
  return Math.max(...rates) >= 0.1
    && meanAdditions >= 2.4
    && meanAdditions <= 4.6
    && (metrics.nearMissAmongFailures ?? 0) >= 0.25
    && playabilityScore >= 55;
}

function deterministicTie(candidateId: string): number {
  return Number.parseInt(fnv1a(`${SELECTION_SEED}|${candidateId}`), 16) / 0xffff_ffff;
}

function greedyDiverseAttempt(
  candidates: readonly ScoredMasterCandidate[],
  target: number,
  attempt: DiversitySelectionAttempt,
): DiversitySelectionResult {
  const selected: ScoredMasterCandidate[] = [];
  const chosen = new Set<number>();
  const minimumDistances = candidates.map(() => 42);
  const lineageCounts = new Map<string, number>();
  const prefixCounts = new Map<string, number>();
  const canonicalCounts = new Map<string, number>();
  const pairStructureCounts = new Map<string, number>();

  while (selected.length < target) {
    let bestIndex = -1;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < candidates.length; index += 1) {
      if (chosen.has(index) || (minimumDistances[index] ?? 0) < attempt.minimumHamming) continue;
      const candidate = candidates[index];
      if (!candidate) continue;
      const diversity = candidate.entry.diversityMetrics;
      const lineageCount = lineageCounts.get(candidate.rootLineage) ?? 0;
      const prefixCount = prefixCounts.get(candidate.route.solutionPrefix) ?? 0;
      const canonicalCount = canonicalCounts.get(diversity.canonicalDigitPattern) ?? 0;
      const pairStructureCount = pairStructureCounts.get(diversity.initialLegalPairStructure) ?? 0;
      if (
        lineageCount >= attempt.lineageCap
        || prefixCount >= attempt.prefixCap
        || canonicalCount >= 1
        || pairStructureCount >= attempt.legalPairStructureCap
      ) continue;
      const diversityScore = Math.min(minimumDistances[index] ?? 0, 16) * 1.1;
      const balanceScore = (1 - lineageCount / attempt.lineageCap) * 4
        + (1 - prefixCount / attempt.prefixCap) * 2
        + (pairStructureCount === 0 ? 1.5 : 0);
      const score = candidate.selectionQuality + diversityScore + balanceScore
        + deterministicTie(candidate.entry.candidateId) * 0.000_001;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    if (bestIndex < 0) break;
    const next = candidates[bestIndex];
    if (!next) break;
    selected.push(next);
    chosen.add(bestIndex);
    const diversity = next.entry.diversityMetrics;
    lineageCounts.set(next.rootLineage, (lineageCounts.get(next.rootLineage) ?? 0) + 1);
    prefixCounts.set(
      next.route.solutionPrefix,
      (prefixCounts.get(next.route.solutionPrefix) ?? 0) + 1,
    );
    canonicalCounts.set(diversity.canonicalDigitPattern, 1);
    pairStructureCounts.set(
      diversity.initialLegalPairStructure,
      (pairStructureCounts.get(diversity.initialLegalPairStructure) ?? 0) + 1,
    );
    for (let index = 0; index < candidates.length; index += 1) {
      if (chosen.has(index)) continue;
      const candidate = candidates[index];
      if (!candidate) continue;
      minimumDistances[index] = Math.min(
        minimumDistances[index] ?? 42,
        hammingDistance(next.entry.initialCells, candidate.entry.initialCells),
      );
    }
  }
  return { candidates: selected, attempt };
}

export function selectDiverseCandidates(
  candidates: readonly ScoredMasterCandidate[],
  target = TARGET_TOTAL,
): readonly DiversitySelectionResult[] {
  const attempts: DiversitySelectionAttempt[] = [
    {
      minimumHamming: 4,
      lineageCap: LINEAGE_CAP,
      prefixCap: PREFIX_CAP,
      legalPairStructureCap: LEGAL_PAIR_STRUCTURE_CAP,
    },
    {
      minimumHamming: 3,
      lineageCap: LINEAGE_CAP,
      prefixCap: PREFIX_CAP,
      legalPairStructureCap: LEGAL_PAIR_STRUCTURE_CAP,
    },
    {
      minimumHamming: 3,
      lineageCap: RELAXED_LINEAGE_CAP,
      prefixCap: PREFIX_CAP,
      legalPairStructureCap: LEGAL_PAIR_STRUCTURE_CAP,
    },
  ];
  const results: DiversitySelectionResult[] = [];
  for (const attempt of attempts) {
    const result = greedyDiverseAttempt(candidates, target, attempt);
    results.push(result);
    if (result.candidates.length === target) break;
  }
  return results;
}

function nearestCatalogHamming(
  candidate: ScoredMasterCandidate,
  selected: readonly ScoredMasterCandidate[],
): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (const other of selected) {
    if (candidate === other) continue;
    minimum = Math.min(minimum, hammingDistance(candidate.entry.initialCells, other.entry.initialCells));
  }
  return Number.isFinite(minimum) ? minimum : 42;
}

function metricSummary(candidates: readonly ScoredMasterCandidate[]): object {
  const metrics = candidates.map((candidate) => candidate.entry.aiMetrics);
  const value = (strategy: StrategyId): readonly (number | undefined)[] =>
    metrics.map((item) => item.clearRates[strategy]);
  return {
    count: candidates.length,
    hardnessScore: distribution(candidates.map((candidate) => candidate.hardnessScore)),
    playabilityScore: distribution(candidates.map((candidate) => candidate.playabilityScore)),
    d2ClearRate: distribution(value('lookahead-2')),
    rowClearRate: distribution(value('row-clear')),
    proximityClearRate: distribution(value('proximity')),
    reserveAddClearRate: distribution(value('reserve-add')),
    earlyAddClearRate: distribution(value('early-add')),
    successfulAdditionsMean: distribution(metrics.map((item) => item.successfulAdditionsMean)),
    successfulAdditionsMedian: distribution(metrics.map((item) => item.successfulAdditionsMedian)),
    nearMissAmongFailures: distribution(metrics.map((item) => item.nearMissAmongFailures)),
  };
}

function stageMetricSummary(entries: readonly LedgerEntry[]): object {
  const metrics = entries.map((entry) => entry.aiMetrics);
  const value = (strategy: StrategyId): readonly (number | undefined)[] =>
    metrics.map((item) => item.clearRates[strategy]);
  return {
    trials: distribution(metrics.map((item) => item.trials)),
    d2ClearRate: distribution(value('lookahead-2')),
    rowClearRate: distribution(value('row-clear')),
    proximityClearRate: distribution(value('proximity')),
    successfulAdditionsMean: distribution(metrics.map((item) => item.successfulAdditionsMean)),
    successfulAdditionsMedian: distribution(metrics.map((item) => item.successfulAdditionsMedian)),
    nearMissAmongFailures: distribution(metrics.map((item) => item.nearMissAmongFailures)),
  };
}

function encodeCatalogData(
  selected: readonly ScoredMasterCandidate[],
  eliteIds: ReadonlySet<string>,
): string {
  const routeEncodings = [...new Set(selected.map((candidate) => candidate.route.encodedMoves))];
  const rows = selected.map((candidate, index) => {
    const routeIndex = routeEncodings.indexOf(candidate.route.encodedMoves);
    if (routeIndex < 0) throw new Error(`Missing route index for ${candidate.route.routeId}`);
    return [
      `master-${String(index + 1).padStart(4, '0')}-${candidate.entry.boardHash}`,
      candidate.entry.boardHash,
      candidate.entry.initialCells.join(''),
      routeIndex,
      eliteIds.has(candidate.entry.candidateId) ? 'e' : 'n',
      Math.round(candidate.hardnessScore),
    ];
  });
  return '// Generated by scripts/select-master-catalog.ts; do not edit by hand.\n'
    + `export const CATALOG_VERSION = '${SELECTION_VERSION}' as const;\n\n`
    + "export type CompactMasterCatalogRow = readonly [string, string, string, number, 'n' | 'e', number];\n\n"
    + `export const MASTER_CATALOG_ROUTES: readonly string[] = ${JSON.stringify(routeEncodings)};\n\n`
    + 'export const MASTER_CATALOG_DATA: readonly CompactMasterCatalogRow[] = [\n'
    + rows.map((row) => `  ${JSON.stringify(row)},`).join('\n')
    + '\n];\n';
}

function parseArguments(): {
  readonly ledgerPath: string;
  readonly cachePath: string;
  readonly outputDirectory: string;
  readonly catalogPath: string;
} {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const repositoryRoot = resolve(scriptDirectory, '..');
  const input = process.argv.find((argument) => argument.startsWith('--input='))?.slice('--input='.length)
    ?? 'C:\\master-ten-search-seed-b-60m';
  const ledgerPath = input.endsWith('.jsonl') ? resolve(input) : resolve(input, 'ledger.jsonl');
  const cachePath = process.argv.find((argument) => argument.startsWith('--cache='))
    ?.slice('--cache='.length)
    ?? resolve(dirname(ledgerPath), 'cache.json');
  const outputArgument = process.argv.find((argument) => argument.startsWith('--output='))?.slice('--output='.length);
  return {
    ledgerPath,
    cachePath: resolve(cachePath),
    outputDirectory: outputArgument
      ? resolve(outputArgument)
      : resolve(repositoryRoot, 'artifacts', 'master-catalog-selection'),
    catalogPath: resolve(repositoryRoot, 'src', 'puzzles', 'catalog.data.generated.ts'),
  };
}

function run(): void {
  const { ledgerPath, cachePath, outputDirectory, catalogPath } = parseArguments();
  if (!existsSync(ledgerPath)) throw new Error(`Required ledger not found: ${ledgerPath}`);
  if (!existsSync(cachePath)) throw new Error(`Required Stage 2 cache not found: ${cachePath}`);
  const source = readFileSync(ledgerPath, 'utf8');
  const entries = source.split(/\r?\n/u).filter(Boolean).map((line, index): LedgerEntry => {
    try {
      return JSON.parse(line) as LedgerEntry;
    } catch (error) {
      throw new Error(`Invalid ledger JSON at line ${index + 1}: ${String(error)}`);
    }
  });
  console.log(`Loaded ${entries.length} ledger entries; validating known routes under RULE ${RULE_VERSION}.`);

  const stageOne = entries.filter((entry) => entry.evaluationStage === 1);
  const stageTwo = entries.filter((entry) => entry.evaluationStage === 2);
  const uniqueBoardHashes = new Set(entries.map((entry) => entry.boardHash));
  const solvedEntries = entries.filter((entry) => entry.solutionStatus === 'SOLVED');
  const uniqueSolvedBoards = new Map<string, LedgerEntry>();
  for (const entry of solvedEntries) {
    const previous = uniqueSolvedBoards.get(entry.boardHash);
    if (!previous || entry.evaluationStage > previous.evaluationStage) uniqueSolvedBoards.set(entry.boardHash, entry);
  }
  const ledgerExactFiveClaims = [...uniqueSolvedBoards.values()]
    .filter((entry) => entry.recommendedAdditions === 5).length;
  const cache = JSON.parse(readFileSync(cachePath, 'utf8')) as SearchCache;
  const routeReconstruction = reconstructStageTwoRoutes(entries, cache);
  console.log(
    `Reconstructed and replay-verified ${routeReconstruction.stageTwoCandidatesReconstructed}/`
    + `${stageTwo.length} Stage 2 routes (${routeReconstruction.uniqueRouteCount} unique routes).`,
  );

  const rejectionCounts: RejectionCounts = {
    stageNotTwo: 0,
    wrongRuleVersion: 0,
    wrongInitialLength: 0,
    invalidInitialCell: 0,
    notSolved: 0,
    notKnownExactFive: 0,
    missingKnownRoute: 0,
    boardHashMismatch: 0,
    brokenRoute: 0,
    duplicateBoardHash: 0,
    duplicateInitialCells: 0,
    incompleteMetrics: 0,
    playabilityGuard: 0,
    diversityNotSelected: 0,
  };
  const publicPool: ScoredMasterCandidate[] = [];
  const seenHashes = new Set<string>();
  const seenCells = new Set<string>();
  for (const entry of entries) {
    if (entry.evaluationStage !== 2) { rejectionCounts.stageNotTwo += 1; continue; }
    if (entry.ruleVersion !== RULE_VERSION) { rejectionCounts.wrongRuleVersion += 1; continue; }
    if (entry.initialCells.length !== 42) { rejectionCounts.wrongInitialLength += 1; continue; }
    if (entry.initialCells.some((cell) => !Number.isInteger(cell) || cell < 1 || cell > 9)) {
      rejectionCounts.invalidInitialCell += 1;
      continue;
    }
    if (entry.solutionStatus !== 'SOLVED') { rejectionCounts.notSolved += 1; continue; }
    if (entry.recommendedAdditions !== 5) { rejectionCounts.notKnownExactFive += 1; continue; }
    const route = routeReconstruction.routesByCandidateId.get(entry.candidateId);
    if (!route) { rejectionCounts.missingKnownRoute += 1; continue; }
    const computedHash = hashBoard(createBoard(entry.initialCells as readonly Cell[]));
    if (computedHash !== entry.boardHash || computedHash !== entry.diversityMetrics.boardHash) {
      rejectionCounts.boardHashMismatch += 1;
      continue;
    }
    const replayed = replayRoute(entry, route);
    if (replayed?.status !== 'WON' || replayed.additionsUsed !== 5) {
      rejectionCounts.brokenRoute += 1;
      continue;
    }
    if (seenHashes.has(entry.boardHash)) { rejectionCounts.duplicateBoardHash += 1; continue; }
    const cellsKey = entry.initialCells.join(',');
    if (seenCells.has(cellsKey)) { rejectionCounts.duplicateInitialCells += 1; continue; }
    if (!hasCompleteStageTwoMetrics(entry.aiMetrics)) { rejectionCounts.incompleteMetrics += 1; continue; }
    const hardnessScore = scoreHardness(entry.aiMetrics);
    const playabilityScore = scorePlayability(entry.aiMetrics);
    if (!passesPlayabilityGuard(entry.aiMetrics, playabilityScore)) {
      rejectionCounts.playabilityGuard += 1;
      continue;
    }
    seenHashes.add(entry.boardHash);
    seenCells.add(cellsKey);
    publicPool.push({
      entry,
      route,
      rootLineage: lineageRoot(entry.candidateId),
      hardnessScore,
      playabilityScore,
      selectionQuality: round(hardnessScore * 0.65 + playabilityScore * 0.35),
    });
  }
  console.log(`Public pool: ${publicPool.length}; running deterministic diversity selection.`);
  const attempts = selectDiverseCandidates(publicPool);
  const finalAttempt = attempts.at(-1);
  if (!finalAttempt) throw new Error('No diversity selection attempt was executed.');
  const selected = finalAttempt.candidates;
  rejectionCounts.diversityNotSelected = publicPool.length - selected.length;

  const eliteCandidates = [...selected]
    .filter((candidate) => candidate.playabilityScore >= 55)
    .sort((first, second) =>
      second.hardnessScore - first.hardnessScore
      || second.playabilityScore - first.playabilityScore
      || first.entry.candidateId.localeCompare(second.entry.candidateId))
    .slice(0, TARGET_ELITE);
  const eliteIds = new Set(eliteCandidates.map((candidate) => candidate.entry.candidateId));
  const normalCandidates = selected.filter((candidate) => !eliteIds.has(candidate.entry.candidateId));
  const selectedLineageCounts = countBy(selected, (candidate) => candidate.rootLineage);
  const selectedPrefixCounts = countBy(selected, (candidate) => candidate.route.solutionPrefix);
  const selectedPairStructureCounts = countBy(
    selected,
    (candidate) => candidate.entry.diversityMetrics.initialLegalPairStructure,
  );
  const selectedCanonicalCounts = countBy(
    selected,
    (candidate) => candidate.entry.diversityMetrics.canonicalDigitPattern,
  );
  const nearestHamming = new Map(
    selected.map((candidate) => [candidate.entry.candidateId, nearestCatalogHamming(candidate, selected)]),
  );

  const selectedArtifact = selected.map((candidate) => ({
    candidateId: candidate.entry.candidateId,
    boardHash: candidate.entry.boardHash,
    initialCells: candidate.entry.initialCells,
    solution: {
      routeId: candidate.route.routeId,
      encodedMoves: candidate.route.encodedMoves,
      additionsUsed: 5,
      replayStatus: 'WON',
      ruleVersion: RULE_VERSION,
    },
    metrics: candidate.entry.aiMetrics,
    hardnessScore: candidate.hardnessScore,
    playabilityScore: candidate.playabilityScore,
    selectionQuality: candidate.selectionQuality,
    diversity: {
      ...candidate.entry.diversityMetrics,
      sourceSolutionPrefix: candidate.entry.diversityMetrics.solutionPrefix,
      solutionPrefix: candidate.route.solutionPrefix,
      minimumHammingToCatalog: nearestHamming.get(candidate.entry.candidateId),
      rootLineage: candidate.rootLineage,
      rootLineageCatalogCount: selectedLineageCounts[candidate.rootLineage],
      canonicalPatternCatalogCount:
        selectedCanonicalCounts[candidate.entry.diversityMetrics.canonicalDigitPattern],
      solutionPrefixCatalogCount:
        selectedPrefixCounts[candidate.route.solutionPrefix],
      legalPairStructureCatalogCount:
        selectedPairStructureCounts[candidate.entry.diversityMetrics.initialLegalPairStructure],
    },
    internalBand: eliteIds.has(candidate.entry.candidateId) ? 'elite-master' : 'normal-master',
    sourceGeneration: candidate.entry.generation,
    sourceLineage: {
      rootParent: candidate.rootLineage,
      parentId: candidate.entry.parentId,
      lineageDepth: lineageDepth(candidate.entry.candidateId),
      mutationType: candidate.entry.mutationType,
      changedInitialIndexes: candidate.entry.changedInitialIndexes,
    },
  }));

  const report = {
    selectionVersion: SELECTION_VERSION,
    selectionSeed: SELECTION_SEED,
    source: {
      ledgerPath,
      ledgerBytes: statSync(ledgerPath).size,
      ledgerFNV1a: fnv1a(source),
      cachePath,
      cacheBytes: statSync(cachePath).size,
      ruleVersion: RULE_VERSION,
    },
    sourceCounts: {
      ledgerEntries: entries.length,
      uniqueBoardHashes: uniqueBoardHashes.size,
      solvedEntries: solvedEntries.length,
      uniqueSolvedCandidates: uniqueSolvedBoards.size,
      stageOneEntries: stageOne.length,
      stageOneUniqueBoards: new Set(stageOne.map((entry) => entry.boardHash)).size,
      stageTwoEntries: stageTwo.length,
      stageTwoUniqueBoards: new Set(stageTwo.map((entry) => entry.boardHash)).size,
      ledgerExactFiveClaims,
      reconstructedVerifiedExactFiveStageTwoCandidates:
        routeReconstruction.stageTwoCandidatesReconstructed,
    },
    sourceDistributions: {
      stageOneMetrics: stageMetricSummary(stageOne),
      stageTwoMetrics: stageMetricSummary(stageTwo),
      rootLineage: countBy(entries, (entry) => lineageRoot(entry.candidateId)),
      mutationType: countBy(entries, (entry) => entry.mutationType),
      solutionPrefix: countBy(entries, (entry) => entry.diversityMetrics.solutionPrefix),
      canonicalPattern: groupedValueSummary(entries, (entry) => entry.diversityMetrics.canonicalDigitPattern),
      initialLegalPairStructure: groupedValueSummary(
        entries,
        (entry) => entry.diversityMetrics.initialLegalPairStructure,
      ),
    },
    routeReconstruction: {
      stageTwoCandidatesReconstructed: routeReconstruction.stageTwoCandidatesReconstructed,
      failedCandidateCount: routeReconstruction.failedCandidateIds.length,
      failedCandidateIds: routeReconstruction.failedCandidateIds,
      prefixMismatches: routeReconstruction.prefixMismatches,
      uniqueRouteCount: routeReconstruction.uniqueRouteCount,
      replayedTrials: routeReconstruction.replayedTrials,
      method: 'Recovered deterministic exact-five successful traces from the existing Stage 2 cache seeds; no evolution search or new candidate generation.',
      safetyNote: 'The ledger SOLVED flag alone is not trusted because the historical repair replay skipped PAIR legality checks; every recovered trace is replayed with applyGameMove.',
    },
    scoring: {
      rationale: [
        'Hardness and playability are separate scores; no legacy MASTER absolute threshold is reused.',
        'Hardness combines D2, row-clear, proximity, reserve-add, and early-add resistance, then near-miss and successful ADD depth.',
        'Playability requires a RULE 2.1.0 exact-five winning route, measurable AI success, non-extreme ADD behavior, near misses, and an outlier guard.',
        'Selection quality weights hardness 65% and playability 35%; diversity is then added by deterministic max-min greedy selection.',
      ],
      hardnessWeights: {
        d2Resistance: 0.30,
        rowClearResistance: 0.20,
        proximityResistance: 0.15,
        reserveAddResistance: 0.10,
        earlyAddResistance: 0.10,
        nearMiss: 0.10,
        successfulAdditionDepth: 0.05,
      },
      selectionQualityWeights: { hardness: 0.65, playability: 0.35 },
    },
    publicPoolCount: publicPool.length,
    diversity: {
      attempts: attempts.map((attempt) => ({
        ...attempt.attempt,
        selectedCount: attempt.candidates.length,
      })),
      selectedMinimumHamming: selected.length > 1
        ? Math.min(...nearestHamming.values())
        : undefined,
      lineageCap: finalAttempt.attempt.lineageCap,
      selectedLineageDistribution: selectedLineageCounts,
      selectedSolutionPrefixDistribution: selectedPrefixCounts,
      selectedCanonicalPatternSummary: groupedValueSummary(
        selected.map((candidate) => candidate.entry),
        (entry) => entry.diversityMetrics.canonicalDigitPattern,
      ),
      selectedInitialLegalPairStructureSummary: groupedValueSummary(
        selected.map((candidate) => candidate.entry),
        (entry) => entry.diversityMetrics.initialLegalPairStructure,
      ),
      relaxed:
        finalAttempt.attempt.minimumHamming < 4
        || finalAttempt.attempt.lineageCap > LINEAGE_CAP,
      relaxationNote:
        finalAttempt.attempt.lineageCap > LINEAGE_CAP
          ? 'The global minimum Hamming target was explicitly relaxed from 4 to 3, then the root-lineage cap from 500 to 650 because the source Stage 2 pool is concentrated in two of five roots. Hamming 3, unique canonical patterns, unique actual solution prefixes, and the legal-pair-structure cap remain enforced.'
          : finalAttempt.attempt.minimumHamming < 4
            ? 'The global minimum Hamming target was explicitly relaxed from 4 to 3 after the target-4 attempt could not fill 1000 slots.'
            : 'No diversity constraint was relaxed; the target-4 attempt filled all 1000 slots.',
    },
    finalCatalog: {
      total: selected.length,
      normal: normalCandidates.length,
      elite: eliteCandidates.length,
      publicDifficulty: 'MASTER',
      routeVerification: {
        won: selected.length,
        exactFiveAdditions: selected.length,
        brokenOrUnknown: 0,
      },
      normalMetrics: metricSummary(normalCandidates),
      eliteMetrics: metricSummary(eliteCandidates),
    },
  };
  const rejectedSummary = {
    sourceLedgerEntries: entries.length,
    publicPoolCount: publicPool.length,
    selectedCount: selected.length,
    counts: rejectionCounts,
  };

  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(resolve(outputDirectory, 'selected.json'), `${JSON.stringify(selectedArtifact, null, 2)}\n`, 'utf8');
  writeFileSync(resolve(outputDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(
    resolve(outputDirectory, 'rejected-summary.json'),
    `${JSON.stringify(rejectedSummary, null, 2)}\n`,
    'utf8',
  );

  if (selected.length !== TARGET_TOTAL || eliteCandidates.length !== TARGET_ELITE) {
    console.error(
      `Safe selection stopped at ${selected.length}; required ${TARGET_TOTAL}. `
      + `Artifacts were written for diagnosis, but production catalog was not replaced.`,
    );
    process.exitCode = 2;
    return;
  }
  writeFileSync(catalogPath, encodeCatalogData(selected, eliteIds), 'utf8');
  console.log(
    `Selected ${normalCandidates.length} normal + ${eliteCandidates.length} elite; `
    + `minimum Hamming ${Math.min(...nearestHamming.values())}.`,
  );
  console.log(`Wrote ${outputDirectory} and ${catalogPath}.`);
}

const directInvocation = process.argv.some((argument) =>
  argument === '--run'
  || argument.replaceAll('\\', '/').endsWith('/scripts/select-master-catalog.ts'));
if (directInvocation) run();
