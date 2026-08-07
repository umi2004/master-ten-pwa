import {
  getAdditionStartIndex,
  positionToIndex,
  type Board,
  type GameMove,
  type GameState,
} from '../core';
import { applySearchMove } from '../solver';

export interface CellProvenance {
  readonly originInitialIndex: number;
  readonly parentLogicalIndex: number;
  readonly generation: number;
  readonly copiedByAdditionNumber?: number;
  readonly alive: boolean;
}
export interface AnalysisProvenance {
  readonly cells: readonly CellProvenance[];
}

export function createAnalysisProvenance(board: Board): AnalysisProvenance {
  return {
    cells: board.cells.map((cell, index) => ({
      originInitialIndex: index,
      parentLogicalIndex: index,
      generation: 0,
      alive: cell !== 0,
    })),
  };
}

function assertSynchronized(state: GameState, provenance: AnalysisProvenance): void {
  if (state.board.logicalLength !== provenance.cells.length) {
    throw new Error('Analysis provenance is not synchronized with the gameplay board.');
  }
}

export function applyMoveWithProvenance(
  state: GameState,
  provenance: AnalysisProvenance,
  move: GameMove,
): { readonly state: GameState; readonly provenance: AnalysisProvenance } {
  assertSynchronized(state, provenance);
  const nextState = applySearchMove(state, move);
  let cells: CellProvenance[];

  if (move.type === 'ADD_NUMBERS') {
    const additionStartIndex = getAdditionStartIndex(state.board);
    const prefix = provenance.cells.slice(0, additionStartIndex);
    const copied = state.board.cells.flatMap((cell, index) => {
      if (cell === 0) return [];
      const source = provenance.cells[index];
      if (!source) throw new Error('Missing source provenance for an alive cell.');
      return [{
        ...source,
        parentLogicalIndex: index,
        generation: source.generation + 1,
        copiedByAdditionNumber: state.additionsUsed + 1,
        alive: true,
      }];
    });
    cells = [...prefix, ...copied];
  } else {
    const deleted = new Set([
      positionToIndex(state.board, move.first),
      positionToIndex(state.board, move.second),
    ]);
    const boardAfterDeletion = state.board.cells.map((cell, index) => deleted.has(index) ? 0 : cell);
    const marked = provenance.cells.map((cell, index) => deleted.has(index)
      ? { ...cell, alive: false }
      : cell);
    cells = [];
    for (let start = 0; start < state.board.logicalLength; start += state.board.width) {
      const end = Math.min(start + state.board.width, state.board.logicalLength);
      if (boardAfterDeletion.slice(start, end).some((cell) => cell !== 0)) {
        cells.push(...marked.slice(start, end));
      }
    }
  }

  if (cells.length !== nextState.board.logicalLength) {
    throw new Error('Analysis provenance transition diverged from the gameplay transition.');
  }
  return {
    state: nextState,
    provenance: {
      cells: cells.map((cell, index) => ({ ...cell, alive: nextState.board.cells[index] !== 0 })),
    },
  };
}
