import { resolve } from 'node:path';

import { createBoard, createGameState, RULE_VERSION, type Cell } from '../src/core';
import {
  extractCounterexamples,
  mutateCounterexampleGuided,
} from '../src/generator/counterexampleGuided';
import type { SuccessfulHumanTrace } from '../src/generator/humanPlayers';
import { simulateHumanStrategy } from '../src/generator/humanPlayers';
import {
  calculateMasterFitness,
  evaluateEvolutionPlan,
  isMasterCandidate,
  masterSearchVersion,
  measureDiversity,
  repairCandidateSolution,
  selectDiverseBeam,
  STAGE_1_PLAN,
  STAGE_2_PLAN,
  type EvolutionCandidate,
} from '../src/generator/masterEvolution';
import { MasterSearchStore } from '../src/generator/masterSearchStore';
import { fnv1a, hashBoard, PUZZLES } from '../src/puzzles';
import type { VerifiedPuzzle } from '../src/puzzles/types';
import { countSolutionAdditions } from '../src/solver';

interface SearchOptions {
  readonly generations: number;
  readonly parents: number;
  readonly children: number;
  readonly seed: string;
  readonly maxMinutes: number;
  readonly resume: boolean;
  readonly outputDirectory: string;
}

interface SearchCheckpoint {
  readonly version: string;
  readonly ruleVersion: string;
  readonly seed: string;
  readonly parents: number;
  readonly children: number;
  readonly generation: number;
  readonly nextParentIndex: number;
  readonly nextChildIndex: number;
  readonly tested: number;
  readonly beam: readonly EvolutionCandidate[];
  readonly partialCandidates: readonly EvolutionCandidate[];
}

function integerOption(name: string, fallback: number): number {
  const raw = process.argv.find((argument) => argument.startsWith(`--${name}=`))?.split('=')[1];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new RangeError(`--${name} must be a positive integer.`);
  return value;
}

function stringOption(name: string, fallback: string): string {
  return process.argv.find((argument) => argument.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
}

function parseOptions(): SearchOptions {
  const maxMinutes = Number(stringOption('max-minutes', '30'));
  if (!Number.isFinite(maxMinutes) || maxMinutes <= 0) throw new RangeError('--max-minutes must be positive.');
  return {
    generations: integerOption('generations', 5),
    parents: integerOption('parents', 3),
    children: integerOption('children', 8),
    seed: stringOption('seed', 'master-evolution-v1'),
    maxMinutes,
    resume: process.argv.includes('--resume'),
    outputDirectory: resolve(stringOption('output-dir', 'artifacts/master-search')),
  };
}

function selectStructurallyDiverseParents(puzzles: readonly VerifiedPuzzle[], limit: number): readonly VerifiedPuzzle[] {
  const remaining = [...puzzles];
  const selected: VerifiedPuzzle[] = [];
  while (selected.length < Math.min(limit, puzzles.length) && remaining.length > 0) {
    remaining.sort((first, second) => {
      const score = (puzzle: VerifiedPuzzle): number => selected.length === 0
        ? puzzles.reduce((sum, other) => sum + puzzle.initialBoard.cells.reduce<number>(
          (distance, cell, index) => distance + (cell === other.initialBoard.cells[index] ? 0 : 1),
          0,
        ), 0)
        : Math.min(...selected.map((other) => puzzle.initialBoard.cells.reduce<number>(
          (distance, cell, index) => distance + (cell === other.initialBoard.cells[index] ? 0 : 1),
          0,
        )));
      return score(second) - score(first);
    });
    const next = remaining.shift();
    if (next) selected.push(next);
  }
  return selected;
}

function publicParent(puzzle: VerifiedPuzzle, store: MasterSearchStore): EvolutionCandidate {
  const state = createGameState(puzzle.initialBoard, 5);
  const metrics = evaluateEvolutionPlan(state, `${puzzle.seed}|parent`, STAGE_2_PLAN, store);
  return {
    candidateId: puzzle.puzzleId,
    parentId: puzzle.puzzleId,
    generation: 0,
    initialCells: puzzle.initialBoard.cells,
    changedInitialIndexes: [],
    mutationType: 'public-parent',
    solutionStatus: 'SOLVED',
    solution: puzzle.recommendedHumanSolution,
    recommendedAdditions: countSolutionAdditions(puzzle.recommendedHumanSolution),
    metrics,
    fitness: calculateMasterFitness(metrics),
    diversity: measureDiversity(
      puzzle.initialBoard.cells,
      puzzle.recommendedHumanSolution,
      puzzle.initialBoard.cells,
    ),
    timestamp: new Date().toISOString(),
  };
}

function traceForParent(
  parent: EvolutionCandidate,
  generation: number,
  seed: string,
  store: MasterSearchStore,
): readonly SuccessfulHumanTrace[] {
  const traceId = `${parent.candidateId}-g${generation}-${fnv1a(`${seed}|${RULE_VERSION}`)}`;
  const cached = store.readTrace<readonly SuccessfulHumanTrace[]>(traceId);
  if (cached) return cached;
  const state = createGameState(createBoard(parent.initialCells), 5);
  const traces = (['proximity', 'row-clear', 'lookahead-2'] as const).flatMap((strategy) => {
    const result = simulateHumanStrategy(
      state,
      `${seed}|${parent.candidateId}|g${generation}|trace`,
      strategy,
      8,
      300,
      { analysis: true, maxSuccessfulTraces: 1 },
    );
    return result.successfulTraces;
  });
  store.writeTrace(traceId, traces);
  return traces;
}

function ledgerEntry(candidate: EvolutionCandidate, evaluationStage: 1 | 2): Record<string, unknown> {
  return {
    candidateId: candidate.candidateId,
    parentId: candidate.parentId,
    generation: candidate.generation,
    boardHash: candidate.diversity.boardHash,
    initialCells: candidate.initialCells,
    changedInitialIndexes: candidate.changedInitialIndexes,
    mutationType: candidate.mutationType,
    solutionStatus: candidate.solutionStatus,
    recommendedAdditions: candidate.recommendedAdditions,
    aiMetrics: candidate.metrics,
    fitness: candidate.fitness,
    beforeFitness: candidate.beforeFitness,
    afterFitness: candidate.fitness,
    diversityMetrics: candidate.diversity,
    evaluationStage,
    timestamp: candidate.timestamp,
    ruleVersion: RULE_VERSION,
  };
}

function assertResumeCompatible(checkpoint: SearchCheckpoint, options: SearchOptions): void {
  if (
    checkpoint.version !== masterSearchVersion()
    || checkpoint.ruleVersion !== RULE_VERSION
    || checkpoint.seed !== options.seed
    || checkpoint.parents !== options.parents
    || checkpoint.children !== options.children
  ) {
    throw new Error('Checkpoint options or rule version do not match this search.');
  }
}

function nextCursor(
  parentIndex: number,
  childIndex: number,
  options: SearchOptions,
): { readonly parent: number; readonly child: number } {
  return childIndex + 1 < options.children
    ? { parent: parentIndex, child: childIndex + 1 }
    : { parent: parentIndex + 1, child: 0 };
}

function writeCheckpoint(
  store: MasterSearchStore,
  options: SearchOptions,
  generation: number,
  nextParentIndex: number,
  nextChildIndex: number,
  tested: number,
  beam: readonly EvolutionCandidate[],
  partialCandidates: readonly EvolutionCandidate[],
): void {
  store.writeCheckpoint({
    version: masterSearchVersion(),
    ruleVersion: RULE_VERSION,
    seed: options.seed,
    parents: options.parents,
    children: options.children,
    generation,
    nextParentIndex,
    nextChildIndex,
    tested,
    beam,
    partialCandidates,
  } satisfies SearchCheckpoint);
}

const options = parseOptions();
const store = new MasterSearchStore(options.outputDirectory);
process.once('beforeExit', () => { store.flushCache(); });
const startedAt = Date.now();
const expired = (): boolean => Date.now() - startedAt >= options.maxMinutes * 60_000;
let interrupted = false;
process.once('SIGINT', () => { interrupted = true; });

let checkpoint = options.resume ? store.readCheckpoint<SearchCheckpoint>() : undefined;
if (options.resume && !checkpoint) throw new Error('--resume requested but checkpoint.json was not found.');
if (checkpoint) assertResumeCompatible(checkpoint, options);

let beam = checkpoint?.beam ?? selectStructurallyDiverseParents(PUZZLES, options.parents)
  .map((puzzle) => publicParent(puzzle, store));
let generation = checkpoint?.generation ?? 1;
let tested = checkpoint?.tested ?? 0;
let resumeParentIndex = checkpoint?.nextParentIndex ?? 0;
let resumeChildIndex = checkpoint?.nextChildIndex ?? 0;
let partialCandidates = [...(checkpoint?.partialCandidates ?? [])];
const seenBoardHashes = new Set([
  ...beam.map((candidate) => candidate.diversity.boardHash),
  ...partialCandidates.map((candidate) => candidate.diversity.boardHash),
  ...store.readLedger<{ readonly boardHash?: string }>()
    .flatMap((entry) => entry.boardHash ? [entry.boardHash] : []),
]);

for (; generation <= options.generations && !expired() && !interrupted; generation += 1) {
  const parents = beam.slice(0, options.parents);
  let stoppedMidGeneration = false;
  for (let parentIndex = resumeParentIndex; parentIndex < parents.length; parentIndex += 1) {
    const parent = parents[parentIndex];
    if (!parent) continue;
    const traces = traceForParent(parent, generation, options.seed, store);
    const counterexample = extractCounterexamples(
      createGameState(createBoard(parent.initialCells), 5),
      traces,
      parent.solution,
    );
    const childStart = parentIndex === resumeParentIndex ? resumeChildIndex : 0;
    for (let childIndex = childStart; childIndex < options.children; childIndex += 1) {
      if (expired() || interrupted) {
        writeCheckpoint(store, options, generation, parentIndex, childIndex, tested, beam, partialCandidates);
        stoppedMidGeneration = true;
        break;
      }
      const mutationIndex = (generation - 1) * options.parents * options.children
        + parentIndex * options.children + childIndex;
      const mutation = mutateCounterexampleGuided(
        parent.initialCells as readonly Cell[],
        counterexample,
        options.seed,
        mutationIndex,
      );
      const mutationBoardHash = hashBoard(createBoard(mutation.initialCells));
      if (seenBoardHashes.has(mutationBoardHash)) {
        tested += 1;
        const cursor = nextCursor(parentIndex, childIndex, options);
        writeCheckpoint(store, options, generation, cursor.parent, cursor.child, tested, beam, partialCandidates);
        continue;
      }
      seenBoardHashes.add(mutationBoardHash);
      const repair = repairCandidateSolution(mutation.initialCells, parent.solution, mutationIndex);
      const diversity = measureDiversity(
        mutation.initialCells,
        repair.solution,
        parent.initialCells,
        partialCandidates.map((candidate) => candidate.initialCells),
      );
      const candidateId = `${parent.candidateId}-g${generation}c${childIndex}-${diversity.boardHash}`;
      tested += 1;
      let candidate: EvolutionCandidate = {
        candidateId,
        parentId: parent.candidateId,
        generation,
        initialCells: mutation.initialCells,
        changedInitialIndexes: mutation.changedInitialIndexes,
        mutationType: mutation.mutationType,
        solutionStatus: repair.status,
        solution: repair.solution,
        ...(repair.status === 'SOLVED' ? { recommendedAdditions: countSolutionAdditions(repair.solution) } : {}),
        fitness: Number.NEGATIVE_INFINITY,
        beforeFitness: parent.fitness,
        diversity,
        timestamp: new Date().toISOString(),
      };
      if (repair.status === 'SOLVED' && mutation.initialCells.length === 42) {
        const state = createGameState(createBoard(mutation.initialCells), 5);
        const metrics = evaluateEvolutionPlan(state, `${options.seed}|${candidateId}|stage1`, STAGE_1_PLAN, store);
        candidate = { ...candidate, metrics, fitness: calculateMasterFitness(metrics) };
        partialCandidates.push(candidate);
      }
      store.appendLedger(ledgerEntry(candidate, 1));
      const cursor = nextCursor(parentIndex, childIndex, options);
      writeCheckpoint(
        store,
        options,
        generation,
        cursor.parent,
        cursor.child,
        tested,
        beam,
        partialCandidates,
      );
    }
    if (stoppedMidGeneration) break;
  }
  if (stoppedMidGeneration) break;

  const shortlist = [...partialCandidates]
    .sort((first, second) => second.fitness - first.fitness)
    .slice(0, Math.max(options.parents, options.parents * 2));
  const refined = shortlist.map((candidate) => {
    const metrics = evaluateEvolutionPlan(
      createGameState(createBoard(candidate.initialCells), 5),
      `${options.seed}|${candidate.candidateId}|stage2`,
      STAGE_2_PLAN,
      store,
    );
    const result = { ...candidate, metrics, fitness: calculateMasterFitness(metrics) };
    store.appendLedger(ledgerEntry(result, 2));
    return result;
  });
  beam = [...selectDiverseBeam([...parents, ...refined], options.parents)];
  partialCandidates = [];
  resumeParentIndex = 0;
  resumeChildIndex = 0;
  const best = beam[0];
  const masterCandidates = beam.filter((candidate) => candidate.metrics && isMasterCandidate(candidate.metrics)).length;
  store.writeBest({ version: masterSearchVersion(), generation, tested, candidate: best });
  store.flushCache();
  writeCheckpoint(store, options, generation + 1, 0, 0, tested, beam, []);
  console.log(
    `Generation ${generation}/${options.generations} tested=${tested} beam=${beam.length} `
    + `bestD2=${best?.metrics?.clearRates['lookahead-2'] ?? 'N/A'} `
    + `bestRow=${best?.metrics?.clearRates['row-clear'] ?? 'N/A'} `
    + `bestProximity=${best?.metrics?.clearRates.proximity ?? 'N/A'} `
    + `masterCandidates=${masterCandidates} elapsed=${Math.round((Date.now() - startedAt) / 60_000)}m`,
  );
  if (masterCandidates > 0) break;
}

store.flushCache();

if (interrupted || expired()) {
  console.log(`Search paused: tested=${tested}; resume with the same options plus --resume.`);
} else {
  console.log(`Search complete: tested=${tested}; output=${options.outputDirectory}`);
}
