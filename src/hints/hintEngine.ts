import { recordHintUse, type GameMove, type GameState } from '../core';
import {
  applySearchMove,
  createStateKey,
  getSearchMoves,
  solveWithDfs,
  type SolverLimits,
} from '../solver';
import type {
  HintRequestResult,
  HintResult,
  HintSolver,
  UnavailableHintResult,
} from './types';

const UNKNOWN_MESSAGE = '現在この局面の安全なヒントを確認できません';

function moveKey(move: GameMove): string {
  if (move.type === 'ADD_NUMBERS') {
    return move.type;
  }
  const first = move.first.row * 9 + move.first.column;
  const second = move.second.row * 9 + move.second.column;
  return first < second
    ? `${move.type}:${first}:${second}`
    : `${move.type}:${second}:${first}`;
}

function isLegalMove(state: GameState, move: GameMove): boolean {
  const target = moveKey(move);
  return getSearchMoves(state).some((candidate) => moveKey(candidate) === target);
}

function unavailable(
  solverStatus: UnavailableHintResult['solverStatus'],
  message: string,
): UnavailableHintResult {
  return {
    status: 'UNAVAILABLE',
    message,
    source: 'none',
    solverStatus,
  };
}

export class HintEngine {
  readonly #solver: HintSolver;
  readonly #cache = new Map<string, readonly GameMove[]>();

  public constructor(solver: HintSolver = solveWithDfs) {
    this.#solver = solver;
  }

  public get cacheSize(): number {
    return this.#cache.size;
  }

  public clear(): void {
    this.#cache.clear();
  }

  public prime(state: GameState, solution: readonly GameMove[]): boolean {
    return this.#verifyAndCache(state, solution);
  }

  public getHint(state: GameState, limits?: SolverLimits): HintResult {
    if (state.status === 'WON') {
      return unavailable('SOLVED', 'この問題はすでにクリアしています');
    }

    const stateKey = createStateKey(state);
    const cached = this.#cache.get(stateKey);
    const cachedMove = cached?.[0];
    if (cachedMove && isLegalMove(state, cachedMove)) {
      return {
        status: 'SAFE_MOVE',
        move: cachedMove,
        message: '検証済みの解答経路から次の一手を示します',
        source: 'cache',
        solutionLength: cached.length,
      };
    }
    if (cached) {
      this.#cache.delete(stateKey);
    }

    const result = this.#solver(state, limits);
    if (result.status === 'UNKNOWN') {
      return unavailable('UNKNOWN', UNKNOWN_MESSAGE);
    }
    if (result.status === 'UNSOLVABLE') {
      return unavailable('UNSOLVABLE', 'この局面から完走できる手順を確認できません');
    }

    if (!this.#verifyAndCache(state, result.solution)) {
      return unavailable('SOLVED', UNKNOWN_MESSAGE);
    }

    const move = result.solution[0];
    if (!move) {
      return unavailable('SOLVED', 'この問題はすでにクリアしています');
    }
    return {
      status: 'SAFE_MOVE',
      move,
      message: '完走できることを確認した次の一手です',
      source: 'search',
      solutionLength: result.solution.length,
    };
  }

  #verifyAndCache(state: GameState, solution: readonly GameMove[]): boolean {
    const states: GameState[] = [];
    let current = state;

    try {
      for (const move of solution) {
        if (!isLegalMove(current, move)) {
          return false;
        }
        states.push(current);
        current = applySearchMove(current, move);
      }
    } catch {
      return false;
    }

    if (current.status !== 'WON') {
      return false;
    }

    states.forEach((pathState, index) => {
      this.#cache.set(createStateKey(pathState), solution.slice(index));
    });
    this.#cache.set(createStateKey(current), []);
    return true;
  }
}

export function requestHint(
  state: GameState,
  engine: HintEngine,
  limits?: SolverLimits,
): HintRequestResult {
  return {
    state: recordHintUse(state),
    hint: engine.getHint(state, limits),
  };
}
