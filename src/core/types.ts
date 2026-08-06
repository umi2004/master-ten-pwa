import type {
  DifficultyVersion,
  GeneratorVersion,
  RuleVersion,
} from './version';

export type Cell = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface Board {
  readonly width: 9;
  readonly cells: readonly Cell[];
  readonly logicalLength: number;
}

export interface Position {
  readonly row: number;
  readonly column: number;
}

export interface PairMove {
  readonly type: 'PAIR';
  readonly first: Position;
  readonly second: Position;
}

export interface AddNumbersMove {
  readonly type: 'ADD_NUMBERS';
}

export type GameMove = PairMove | AddNumbersMove;
export type GameStatus = 'PLAYING' | 'WON' | 'LOST';

export interface GameSnapshot {
  readonly board: Board;
  readonly additionsRemaining: number;
  readonly additionsUsed: number;
  readonly moveCount: number;
  readonly status: GameStatus;
}

export interface GameState extends GameSnapshot {
  readonly ruleVersion: RuleVersion;
  readonly history: readonly GameSnapshot[];
  readonly hintCount: number;
  readonly undoCount: number;
  readonly restartCount: number;
}

export interface PuzzleDefinition {
  readonly puzzleId: string;
  readonly seed: string;
  readonly ruleVersion: RuleVersion;
  readonly generatorVersion: GeneratorVersion;
  readonly difficultyVersion: DifficultyVersion;
  readonly initialBoard: Board;
  readonly initialRows: number;
  readonly additionsAllowed: number;
}
