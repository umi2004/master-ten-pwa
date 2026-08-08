import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  selectDiverseCandidates,
  type ScoredMasterCandidate,
} from '../../scripts/select-master-catalog';

interface SelectedArtifactRow {
  readonly candidateId: string;
  readonly initialCells: readonly number[];
  readonly solution: {
    readonly routeId: string;
    readonly encodedMoves: string;
  };
  readonly hardnessScore: number;
  readonly playabilityScore: number;
  readonly selectionQuality: number;
  readonly diversity: {
    readonly boardHash: string;
    readonly hammingToParent: number;
    readonly canonicalDigitPattern: string;
    readonly initialLegalPairStructure: string;
    readonly solutionPrefix: string;
    readonly rootLineage: string;
  };
}

const artifact = JSON.parse(readFileSync(
  new URL('../../artifacts/master-catalog-selection/selected.json', import.meta.url),
  'utf8',
)) as readonly SelectedArtifactRow[];

function fixture(row: SelectedArtifactRow): ScoredMasterCandidate {
  return {
    entry: {
      candidateId: row.candidateId,
      initialCells: row.initialCells,
      diversityMetrics: {
        boardHash: row.diversity.boardHash,
        hammingToParent: row.diversity.hammingToParent,
        canonicalDigitPattern: row.diversity.canonicalDigitPattern,
        initialLegalPairStructure: row.diversity.initialLegalPairStructure,
        solutionPrefix: row.diversity.solutionPrefix,
      },
    },
    route: {
      routeId: row.solution.routeId,
      encodedMoves: row.solution.encodedMoves,
      solutionPrefix: row.diversity.solutionPrefix,
      moves: [],
    },
    rootLineage: row.diversity.rootLineage,
    hardnessScore: row.hardnessScore,
    playabilityScore: row.playabilityScore,
    selectionQuality: row.selectionQuality,
  } as unknown as ScoredMasterCandidate;
}

describe('MASTER catalog selector', () => {
  it('is deterministic for identical and reordered input', () => {
    const candidates = artifact.slice(0, 80).map(fixture);
    const selectIds = (input: readonly ScoredMasterCandidate[]): readonly string[] =>
      selectDiverseCandidates(input, 30).at(-1)?.candidates
        .map((candidate) => candidate.entry.candidateId) ?? [];
    const first = selectIds(candidates);
    expect(first).toHaveLength(30);
    expect(selectIds(candidates)).toEqual(first);
    expect(selectIds([...candidates].reverse())).toEqual(first);
  });
});
