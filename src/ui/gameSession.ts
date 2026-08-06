import {
  applyGameMove,
  canAddNumbers,
  createGameState,
  isPairMoveLegal,
  positionToIndex,
  undoLastMove,
  type GameState,
  type PairMove,
  type Position,
} from '../core';
import { HintEngine, requestHint, type HintResult } from '../hints';
import type { VerifiedPuzzle } from '../puzzles';
import {
  SAVE_SCHEMA_VERSION,
  type AppSettings,
  type ProgressData,
  type SavedSession,
  type SaveRepository,
} from '../storage';

export interface SessionActionResult {
  readonly changed: boolean;
  readonly message: string;
}

function restoredState(session: SavedSession): GameState {
  return {
    board: session.currentBoard,
    additionsRemaining: session.additionsRemaining,
    additionsUsed: session.additionsUsed,
    moveCount: session.moveCount,
    status: session.completionStatus,
    ruleVersion: '1.0.0',
    history: session.history,
    hintCount: session.hintCount,
    undoCount: session.undoCount,
    restartCount: session.restartCount,
  };
}

export class GameSession {
  readonly puzzle: VerifiedPuzzle;
  readonly #repository: SaveRepository;
  readonly #hintEngine: HintEngine;
  readonly #now: () => number;
  #state: GameState;
  #settings: AppSettings;
  #progress: ProgressData;
  #selected?: Position;
  #hint?: HintResult;
  #startedAt: number;
  #elapsedTime: number;
  #lastTick: number;
  #completedAt: number | null;

  private constructor(options: {
    puzzle: VerifiedPuzzle;
    state: GameState;
    settings: AppSettings;
    progress: ProgressData;
    repository: SaveRepository;
    hintEngine: HintEngine;
    now: () => number;
    startedAt: number;
    elapsedTime: number;
    completedAt: number | null;
  }) {
    this.puzzle = options.puzzle;
    this.#state = options.state;
    this.#settings = options.settings;
    this.#progress = options.progress;
    this.#repository = options.repository;
    this.#hintEngine = options.hintEngine;
    this.#now = options.now;
    this.#startedAt = options.startedAt;
    this.#elapsedTime = options.elapsedTime;
    this.#lastTick = options.now();
    this.#completedAt = options.completedAt;
  }

  public static create(
    puzzle: VerifiedPuzzle,
    settings: AppSettings,
    progress: ProgressData,
    repository: SaveRepository,
    options: { hintEngine?: HintEngine; now?: () => number } = {},
  ): GameSession {
    const now = options.now ?? Date.now;
    const startedAt = now();
    const session = new GameSession({
      puzzle,
      state: createGameState(puzzle.initialBoard, puzzle.additionsAllowed),
      settings,
      progress,
      repository,
      hintEngine: options.hintEngine ?? new HintEngine(),
      now,
      startedAt,
      elapsedTime: 0,
      completedAt: null,
    });
    session.persist();
    return session;
  }

  public static resume(
    saved: SavedSession,
    puzzle: VerifiedPuzzle,
    settings: AppSettings,
    progress: ProgressData,
    repository: SaveRepository,
    options: { hintEngine?: HintEngine; now?: () => number } = {},
  ): GameSession {
    return new GameSession({
      puzzle,
      state: restoredState(saved),
      settings,
      progress,
      repository,
      hintEngine: options.hintEngine ?? new HintEngine(),
      now: options.now ?? Date.now,
      startedAt: saved.startedAt,
      elapsedTime: saved.elapsedTime,
      completedAt: saved.completedAt,
    });
  }

  public get state(): GameState {
    return this.#state;
  }

  public get selected(): Position | undefined {
    return this.#selected;
  }

  public get hint(): HintResult | undefined {
    return this.#hint;
  }

  public get progress(): ProgressData {
    return this.#progress;
  }

  public get elapsedTime(): number {
    if (this.#state.status !== 'PLAYING') return this.#elapsedTime;
    return this.#elapsedTime + Math.max(0, this.#now() - this.#lastTick);
  }

  public clearSelection(): void {
    this.#selected = undefined;
    this.#hint = undefined;
  }

  public select(position: Position): SessionActionResult {
    let index: number;
    try {
      index = positionToIndex(this.#state.board, position);
    } catch {
      return { changed: false, message: 'その場所は選べません' };
    }
    if (this.#state.board.cells[index] === 0) {
      return { changed: false, message: '空所は選べません' };
    }
    if (!this.#selected) {
      this.#selected = position;
      this.#hint = undefined;
      return { changed: false, message: 'もう一つの数字を選んでください' };
    }
    if (
      this.#selected.row === position.row &&
      this.#selected.column === position.column
    ) {
      this.#selected = undefined;
      return { changed: false, message: '選択を解除しました' };
    }

    const move: PairMove = { type: 'PAIR', first: this.#selected, second: position };
    if (!isPairMoveLegal(this.#state.board, move)) {
      return { changed: false, message: '同じ数字か、合計10になる接続可能な数字を選んでください' };
    }
    this.#tick();
    this.#state = applyGameMove(this.#state, move);
    this.#selected = undefined;
    this.#hint = undefined;
    this.#afterStateChange();
    return { changed: true, message: '数字を消しました' };
  }

  public addNumbers(): SessionActionResult {
    if (!canAddNumbers(this.#state)) {
      return {
        changed: false,
        message: '消せるペアが残っているため、数字は追加できません',
      };
    }
    this.#tick();
    this.#state = applyGameMove(this.#state, { type: 'ADD_NUMBERS' });
    this.#selected = undefined;
    this.#hint = undefined;
    this.#afterStateChange();
    return { changed: true, message: '残っている数字を末尾へ追加しました' };
  }

  public undo(): SessionActionResult {
    const next = undoLastMove(this.#state);
    if (next === this.#state) {
      return { changed: false, message: '戻せる手がありません' };
    }
    this.#tick();
    this.#state = next;
    this.#selected = undefined;
    this.#hint = undefined;
    this.#completedAt = null;
    this.persist();
    return { changed: true, message: '1手戻しました' };
  }

  public requestHint(): HintResult {
    this.#tick();
    const result = requestHint(this.#state, this.#hintEngine, {
      nodeLimit: 250_000,
      timeLimitMs: 1_500,
      maxDepth: 300,
    });
    this.#state = result.state;
    this.#hint = result.hint;
    this.persist();
    return result.hint;
  }

  public restart(): void {
    const restartCount = this.#state.restartCount + 1;
    this.#state = {
      ...createGameState(this.puzzle.initialBoard, this.puzzle.additionsAllowed),
      restartCount,
    };
    this.#selected = undefined;
    this.#hint = undefined;
    this.#startedAt = this.#now();
    this.#lastTick = this.#startedAt;
    this.#elapsedTime = 0;
    this.#completedAt = null;
    this.persist();
  }

  public updateSettings(settings: AppSettings): void {
    this.#settings = settings;
    this.persist();
  }

  public leave(): void {
    this.#tick();
    this.persist();
  }

  public persist(): void {
    this.#repository.saveSession(
      this.#state,
      this.puzzle,
      this.#settings,
      this.#progress,
      {
        startedAt: this.#startedAt,
        elapsedTime: this.#elapsedTime,
        completedAt: this.#completedAt,
      },
    );
  }

  #tick(): void {
    const now = this.#now();
    if (this.#state.status === 'PLAYING') {
      this.#elapsedTime += Math.max(0, now - this.#lastTick);
    }
    this.#lastTick = now;
  }

  #afterStateChange(): void {
    if (this.#state.status === 'WON') {
      this.#completedAt = this.#now();
      const completed = new Set(this.#progress.completedPuzzles);
      completed.add(this.puzzle.puzzleId);
      const noAssist = new Set(this.#progress.noAssistCompletions);
      if (this.#state.hintCount === 0 && this.#state.undoCount === 0) {
        noAssist.add(this.puzzle.puzzleId);
      }
      this.#progress = {
        schemaVersion: SAVE_SCHEMA_VERSION,
        completedPuzzles: [...completed],
        noAssistCompletions: [...noAssist],
      };
      this.#repository.saveProgress(this.#progress);
    }
    this.persist();
  }
}
