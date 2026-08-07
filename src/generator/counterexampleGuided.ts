import {
  createBoard,
  createGameState,
  positionToIndex,
  type Cell,
  type GameMove,
  type GameState,
} from '../core';
import { createStateKey } from '../solver';
import type { SuccessfulHumanTrace } from './humanPlayers';
import {
  applyMoveWithProvenance,
  createAnalysisProvenance,
} from './analysisProvenance';
import { createPrng } from './prng';

export interface RankedCounterexampleCell {
  readonly initialIndex: number;
  readonly score: number;
  readonly uses: number;
  readonly strategies: readonly string[];
  readonly nearAdditionUses: number;
}
export interface CounterexampleSummary {
  readonly initialIndexes: readonly number[];
  readonly rankedCells: readonly RankedCounterexampleCell[];
  readonly firstDivergencePly?: number;
}

function moveKey(move: GameMove | undefined): string {
  if (!move) return '';
  if (move.type === 'ADD_NUMBERS') return 'A';
  const first = move.first.row * 9 + move.first.column;
  const second = move.second.row * 9 + move.second.column;
  return `${Math.min(first, second)}-${Math.max(first, second)}`;
}

export function extractCounterexamples(
  initialState: GameState,
  traces: readonly SuccessfulHumanTrace[],
  recommendedRoute: readonly GameMove[] = [],
): CounterexampleSummary {
  const cells = new Map<number, {
    score: number;
    uses: number;
    strategies: Set<string>;
    nearAdditionUses: number;
  }>();
  let firstDivergencePly: number | undefined;

  for (const trace of traces) {
    let state = createGameState(initialState.board, initialState.additionsRemaining);
    let provenance = createAnalysisProvenance(state.board);
    for (let index = 0; index < trace.steps.length; index += 1) {
      const step = trace.steps[index];
      if (!step) continue;
      if (step.stateKey !== createStateKey(state)) {
        throw new Error('Human trace does not match the supplied initial state.');
      }
      if (
        firstDivergencePly === undefined
        && recommendedRoute[index]
        && moveKey(step.selectedMove) !== moveKey(recommendedRoute[index])
      ) {
        firstDivergencePly = index;
      }

      if (step.selectedMove.type === 'PAIR' && step.legalTransitionCount >= 2) {
        const indexes = [
          positionToIndex(state.board, step.selectedMove.first),
          positionToIndex(state.board, step.selectedMove.second),
        ];
        const nearAddition = trace.steps[index - 1]?.selectedMove.type === 'ADD_NUMBERS'
          || trace.steps[index + 1]?.selectedMove.type === 'ADD_NUMBERS';
        for (const logicalIndex of indexes) {
          const origin = provenance.cells[logicalIndex]?.originInitialIndex;
          if (origin === undefined) continue;
          const current = cells.get(origin) ?? {
            score: 0,
            uses: 0,
            strategies: new Set<string>(),
            nearAdditionUses: 0,
          };
          current.uses += 1;
          current.score += 1 + Math.min(4, step.legalTransitionCount - 1) * 0.25 + (nearAddition ? 1 : 0);
          current.strategies.add(trace.strategy);
          if (nearAddition) current.nearAdditionUses += 1;
          cells.set(origin, current);
        }
      }

      const transition = applyMoveWithProvenance(state, provenance, step.selectedMove);
      state = transition.state;
      provenance = transition.provenance;
    }
  }

  const rankedCells = [...cells.entries()]
    .map(([initialIndex, value]) => ({
      initialIndex,
      score: value.score + Math.max(0, value.strategies.size - 1) * 2,
      uses: value.uses,
      strategies: [...value.strategies].sort(),
      nearAdditionUses: value.nearAdditionUses,
    }))
    .sort((first, second) => second.score - first.score || first.initialIndex - second.initialIndex);
  return {
    initialIndexes: rankedCells.map((cell) => cell.initialIndex),
    rankedCells,
    ...(firstDivergencePly === undefined ? {} : { firstDivergencePly }),
  };
}

export type TargetedMutationType =
  | 'digit-replacement'
  | 'complement-replacement'
  | 'swap'
  | 'shared-endpoint-disruption'
  | 'same-value-decoy-adjustment'
  | 'sum-to-ten-decoy-adjustment';

const MUTATION_TYPES: readonly TargetedMutationType[] = [
  'digit-replacement',
  'complement-replacement',
  'swap',
  'shared-endpoint-disruption',
  'same-value-decoy-adjustment',
  'sum-to-ten-decoy-adjustment',
];

export interface TargetedMutation {
  readonly initialCells: readonly Cell[];
  readonly changedInitialIndexes: readonly number[];
  readonly mutationType: TargetedMutationType;
}

function replacementDifferentFrom(cell: Cell, offset: number): Cell {
  const digit = ((cell + offset - 1) % 9) + 1;
  return (digit === cell ? (cell === 9 ? 1 : cell + 1) : digit) as Cell;
}

export function mutateCounterexampleGuided(
  parentCells: readonly Cell[],
  counterexample: CounterexampleSummary,
  seed: string,
  mutationIndex: number,
): TargetedMutation {
  const prng = createPrng(`${seed}|targeted-v1|${mutationIndex}`);
  const requested = 2 + prng.integer(5);
  const selected = [...new Set(counterexample.initialIndexes)]
    .filter((index) => index >= 0 && index < parentCells.length)
    .slice(0, requested);
  while (selected.length < Math.min(requested, parentCells.length)) {
    const index = prng.integer(parentCells.length);
    if (!selected.includes(index)) selected.push(index);
  }
  const mutationType = MUTATION_TYPES[mutationIndex % MUTATION_TYPES.length] ?? 'digit-replacement';
  const initialCells = [...parentCells];

  if (mutationType === 'swap') {
    const rotated = selected.map((_, index) => parentCells[selected[(index + 1) % selected.length] ?? 0] ?? 1);
    selected.forEach((cellIndex, index) => { initialCells[cellIndex] = rotated[index] ?? 1; });
  } else if (mutationType === 'same-value-decoy-adjustment') {
    const first = selected[0] ?? 0;
    const second = selected[1] ?? first;
    const digit = ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const)
      .find((value) => value !== parentCells[first] && value !== parentCells[second]) ?? 1;
    initialCells[first] = digit;
    initialCells[second] = digit;
  } else if (mutationType === 'sum-to-ten-decoy-adjustment') {
    const first = selected[0] ?? 0;
    const second = selected[1] ?? first;
    const digit = ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const)
      .find((value) => value !== parentCells[first] && 10 - value !== parentCells[second]) ?? 1;
    initialCells[first] = digit;
    initialCells[second] = (10 - digit) as Cell;
  }

  selected.forEach((index, order) => {
    const original = parentCells[index] ?? 1;
    if (mutationType === 'digit-replacement') {
      initialCells[index] = replacementDifferentFrom(original, 1 + prng.integer(8));
    } else if (mutationType === 'complement-replacement') {
      const complement = (10 - original) as Cell;
      initialCells[index] = complement === original ? replacementDifferentFrom(original, 1) : complement;
    } else if (mutationType === 'shared-endpoint-disruption') {
      initialCells[index] = replacementDifferentFrom(original, 2 + (order % 3));
    } else if (initialCells[index] === original) {
      initialCells[index] = replacementDifferentFrom(original, 1 + order);
    }
  });

  const changedInitialIndexes = selected.filter((index) => initialCells[index] !== parentCells[index]).sort((a, b) => a - b);
  return { initialCells, changedInitialIndexes, mutationType };
}

export function boardFromTargetedMutation(mutation: TargetedMutation): GameState {
  return createGameState(createBoard(mutation.initialCells), 5);
}
