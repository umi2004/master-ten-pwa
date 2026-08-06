import {
  canAddNumbers,
  indexToPosition,
  type GameMove,
  type Position,
} from '../core';
import { PUZZLES, type VerifiedPuzzle } from '../puzzles';
import {
  DEFAULT_SETTINGS,
  SAVE_SCHEMA_VERSION,
  SaveRepository,
  type AppSettings,
  type ProgressData,
  type SavedSession,
} from '../storage';
import { GameSession } from './gameSession';

type Screen = 'home' | 'game' | 'puzzles' | 'how-to' | 'settings' | 'clear';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function formatTime(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function moveContains(move: GameMove | undefined, position: Position): boolean {
  return move?.type === 'PAIR' && (
    (move.first.row === position.row && move.first.column === position.column) ||
    (move.second.row === position.row && move.second.column === position.column)
  );
}

function masterLabel(displayNumber: number): string {
  return `Master ${displayNumber.toString().padStart(2, '0')}`;
}

export class MasterTenApp {
  readonly #root: HTMLElement;
  readonly #repository: SaveRepository;
  #settings: AppSettings;
  #progress: ProgressData;
  #saved?: SavedSession;
  #session?: GameSession;
  #screen: Screen = 'home';
  #notice = '';
  #scrollBoardToEnd = false;

  public constructor(root: HTMLElement) {
    this.#root = root;
    this.#repository = new SaveRepository(window.localStorage);
    this.#settings = this.#repository.loadSettings();
    this.#progress = this.#repository.loadProgress(PUZZLES);
    const loaded = this.#repository.loadSession(PUZZLES);
    if (loaded.status === 'OK') {
      this.#saved = loaded.session;
    } else if (loaded.status === 'RECOVERED') {
      this.#notice = loaded.message;
    }
    this.#applySettings();
    window.addEventListener('pagehide', () => this.#session?.leave());
    this.render();
  }

  public render(): void {
    this.#root.replaceChildren();
    const skip = el('a', 'skip-link', 'メイン内容へ移動');
    skip.href = '#main-content';
    this.#root.append(skip);

    switch (this.#screen) {
      case 'game':
        this.#renderGame();
        break;
      case 'puzzles':
        this.#renderPuzzleList();
        break;
      case 'how-to':
        this.#renderHowTo();
        break;
      case 'settings':
        this.#renderSettings();
        break;
      case 'clear':
        this.#renderClear();
        break;
      default:
        this.#renderHome();
    }
  }

  #brandHeader(back?: () => void): HTMLElement {
    const header = el('header', 'topbar');
    if (back) {
      header.append(this.#button('戻る', 'icon-button', back, '前の画面へ戻る'));
    } else {
      header.append(el('span', 'topbar-spacer'));
    }
    const brand = el('div', 'brand-lockup');
    const mark = el('span', 'brand-mark', '10');
    mark.setAttribute('aria-hidden', 'true');
    const name = el('span', 'brand-name', 'MASTER TEN');
    brand.append(mark, name);
    header.append(brand, el('span', 'topbar-spacer'));
    return header;
  }

  #main(title?: string): HTMLElement {
    const main = el('main', 'screen');
    main.id = 'main-content';
    if (title) main.append(el('h1', 'screen-title', title));
    return main;
  }

  #button(
    label: string,
    className: string,
    action: () => void,
    ariaLabel?: string,
  ): HTMLButtonElement {
    const button = el('button', className, label);
    button.type = 'button';
    if (ariaLabel) button.setAttribute('aria-label', ariaLabel);
    button.addEventListener('click', action);
    return button;
  }

  #noticeRegion(): HTMLElement {
    const notice = el('p', 'notice', this.#notice || '準備完了');
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    return notice;
  }

  #renderHome(): void {
    this.#root.append(this.#brandHeader());
    const main = this.#main();
    const hero = el('section', 'hero');
    hero.append(
      el('p', 'eyebrow', 'V5-Lite・Master 01 試遊版'),
      el('h1', 'hero-title', 'MASTER TEN'),
      el('p', 'hero-copy', '同じ数字、または合計10になる数字を見つけて、盤面を空にする高難易度パズルです。'),
    );

    const actions = el('div', 'home-actions');
    if (this.#saved && this.#saved.completionStatus !== 'WON') {
      const continueButton = this.#button(
        '続きから',
        'primary-button',
        () => this.#resumeSaved(),
      );
      continueButton.append(el('span', 'button-detail', `問題 ${this.#puzzleNumber(this.#saved.puzzleId)}・${this.#saved.moveCount}手`));
      actions.append(continueButton);
    }
    actions.append(
      this.#button('新しいMaster問題', 'accent-button', () => {
        const next = PUZZLES.find((puzzle) => !this.#progress.completedPuzzles.includes(puzzle.puzzleId)) ?? PUZZLES[0];
        if (next) this.#startPuzzle(next);
      }),
      this.#button('問題一覧', 'menu-button', () => this.#go('puzzles')),
      this.#button('遊び方', 'menu-button', () => this.#go('how-to')),
      this.#button('設定', 'menu-button', () => this.#go('settings')),
    );

    const progress = el('section', 'progress-card');
    progress.append(
      el('p', 'card-kicker', 'あなたの記録'),
      el('strong', 'progress-number', `${this.#progress.completedPuzzles.length} / ${PUZZLES.length}`),
      el('span', 'progress-label', 'クリア済み'),
    );
    const meter = el('div', 'progress-meter');
    meter.setAttribute('role', 'progressbar');
    meter.setAttribute('aria-valuemin', '0');
    meter.setAttribute('aria-valuemax', String(PUZZLES.length));
    meter.setAttribute('aria-valuenow', String(this.#progress.completedPuzzles.length));
    const fill = el('span', 'progress-fill');
    fill.style.width = `${(this.#progress.completedPuzzles.length / PUZZLES.length) * 100}%`;
    meter.append(fill);
    progress.append(meter);

    main.append(hero, actions, progress, this.#noticeRegion());
    const privacy = el('p', 'privacy-note', '広告・課金・ログイン・分析・個人情報収集はありません。進行状況はこの端末だけに保存されます。');
    main.append(privacy);
    this.#root.append(main);
  }

  #renderPuzzleList(): void {
    this.#root.append(this.#brandHeader(() => this.#go('home')));
    const main = this.#main('問題一覧');
    main.append(el('p', 'screen-intro', '42数字のMaster 01試遊版を1問だけ表示します。正式認定前のローカル候補です。'));
    const grid = el('div', 'puzzle-grid');
    for (const puzzle of PUZZLES) {
      const completed = this.#progress.completedPuzzles.includes(puzzle.puzzleId);
      const noAssist = this.#progress.noAssistCompletions.includes(puzzle.puzzleId);
      const active = this.#saved?.puzzleId === puzzle.puzzleId && this.#saved.completionStatus === 'PLAYING';
      const card = el('article', `puzzle-card${completed ? ' is-complete' : ''}`);
      const number = el('span', 'puzzle-number', puzzle.displayNumber.toString().padStart(2, '0'));
      number.setAttribute('aria-hidden', 'true');
      const status = noAssist ? 'ノーアシスト' : completed ? 'クリア済み' : active ? '進行中' : '未挑戦';
      card.append(
        number,
        el('h2', 'puzzle-title', masterLabel(puzzle.displayNumber)),
        el('p', 'puzzle-meta', `試遊版・${puzzle.initialAliveCount}数字`),
        el('p', 'puzzle-status', status),
        this.#button(completed ? '再プレイ' : active ? '続ける' : '開始', 'small-button', () => {
          if (active) this.#resumeSaved();
          else this.#startPuzzle(puzzle);
        }, `問題${puzzle.displayNumber}を${completed ? '再プレイ' : '開始'}`),
      );
      grid.append(card);
    }
    main.append(grid);
    this.#root.append(main);
  }

  #renderGame(): void {
    const session = this.#session;
    if (!session) {
      this.#go('home');
      return;
    }
    const header = this.#brandHeader(() => {
      session.leave();
      this.#syncSaved();
      this.#go('home');
    });
    this.#root.append(header);
    const main = this.#main();

    const gameHeading = el('section', 'game-heading');
    const headingText = el('div');
    headingText.append(
      el('p', 'eyebrow', masterLabel(session.puzzle.displayNumber).toUpperCase()),
      el('h1', 'game-title', masterLabel(session.puzzle.displayNumber)),
      el('p', 'playtest-label', '試遊版'),
    );
    const difficulty = el('span', 'difficulty-badge', `難度 ${session.puzzle.difficultyScore}`);
    gameHeading.append(headingText, difficulty);

    const stats = el('dl', 'stats-grid');
    const statItems = [
      ['手数', session.state.moveCount],
      ['追加残り', session.state.additionsRemaining],
      ['ヒント', session.state.hintCount],
      ['Undo', session.state.undoCount],
      ['時間', formatTime(session.elapsedTime)],
    ] as const;
    for (const [label, value] of statItems) {
      const item = el('div', 'stat-item');
      item.append(el('dt', undefined, label), el('dd', undefined, String(value)));
      stats.append(item);
    }

    const saveState = el('p', 'save-state', '● 自動保存済み');
    saveState.setAttribute('aria-live', 'polite');

    const boardViewport = el('div', 'board-viewport');
    const board = el('div', 'number-board');
    board.setAttribute('role', 'grid');
    board.setAttribute('aria-label', `問題${session.puzzle.displayNumber}の9列盤面`);
    const hintMove = session.hint?.status === 'SAFE_MOVE' ? session.hint.move : undefined;
    let firstFocusable = true;
    const displayLength = Math.max(session.state.board.logicalLength, 9 * 11);
    for (let index = 0; index < displayLength; index += 1) {
      if (index >= session.state.board.logicalLength) {
        const displayEmpty = el('span', 'number-cell is-empty is-display-empty');
        displayEmpty.setAttribute('role', 'presentation');
        displayEmpty.setAttribute('aria-hidden', 'true');
        board.append(displayEmpty);
        continue;
      }
      const value = session.state.board.cells[index] ?? 0;
      const position = indexToPosition(index);
      if (value === 0) {
        const empty = el('span', 'number-cell is-empty');
        empty.setAttribute('role', 'gridcell');
        empty.setAttribute('aria-label', `行${position.row + 1} 列${position.column + 1} 空所`);
        board.append(empty);
        continue;
      }
      const selected = session.selected?.row === position.row && session.selected.column === position.column;
      const hinted = moveContains(hintMove, position);
      const cell = this.#button(String(value), `number-cell${selected ? ' is-selected' : ''}${hinted ? ' is-hinted' : ''}`, () => {
        const result = session.select(position);
        this.#notice = result.message;
        if (result.changed) this.#feedback(true);
        if (session.state.status === 'WON') {
          this.#progress = session.progress;
          this.#syncSaved();
          this.#screen = 'clear';
        }
        this.render();
      }, `行${position.row + 1} 列${position.column + 1} 数字${value}`);
      cell.dataset.index = String(index);
      cell.setAttribute('role', 'gridcell');
      cell.tabIndex = firstFocusable || selected ? 0 : -1;
      firstFocusable = false;
      cell.addEventListener('keydown', (event) => this.#handleBoardKey(event, index));
      board.append(cell);
    }
    boardViewport.append(board);

    if (session.state.status === 'LOST') {
      const lost = el('p', 'state-banner is-lost', '追加を使い切り、消せるペアもありません。リスタートまたはUndoを選べます。');
      lost.setAttribute('role', 'alert');
      main.append(lost);
    }

    const controls = el('div', 'game-controls');
    const addDisabled = !canAddNumbers(session.state);
    const add = this.#button('数字追加', 'control-button is-add', () => {
      const result = session.addNumbers();
      this.#notice = result.message;
      if (result.changed) {
        this.#feedback(true);
        this.#scrollBoardToEnd = true;
      }
      this.render();
    });
    add.disabled = addDisabled;
    add.setAttribute('aria-describedby', 'add-reason');
    const undo = this.#button('1手戻す', 'control-button', () => {
      const result = session.undo();
      this.#notice = result.message;
      this.render();
    });
    undo.disabled = session.state.history.length === 0;
    const hint = this.#button('ヒント', 'control-button', () => {
      const result = session.requestHint();
      this.#notice = result.message;
      this.render();
    });
    const restart = this.#button('リスタート', 'control-button is-danger', () => {
      if (window.confirm('この問題を最初からやり直しますか？ 現在の盤面と履歴は失われます。')) {
        session.restart();
        this.#notice = '問題を最初の状態へ戻しました';
        this.render();
      }
    });
    controls.append(add, undo, hint, restart);
    const addReason = el(
      'p',
      'control-reason',
      addDisabled
        ? session.state.additionsRemaining === 0
          ? '数字追加の残り回数がありません。'
          : '盤面の高さ上限により、これ以上追加できません。'
        : '合法ペアが残っていても追加できます。タイミングを選んでください。',
    );
    addReason.id = 'add-reason';

    main.append(gameHeading, stats, saveState, boardViewport, controls, addReason, this.#noticeRegion());
    this.#root.append(main);
    if (this.#scrollBoardToEnd) {
      this.#scrollBoardToEnd = false;
      requestAnimationFrame(() => {
        boardViewport.scrollTop = boardViewport.scrollHeight;
      });
    }
  }

  #renderClear(): void {
    const session = this.#session;
    if (!session) {
      this.#go('home');
      return;
    }
    this.#root.append(this.#brandHeader());
    const main = this.#main();
    const panel = el('section', 'clear-panel');
    const seal = el('div', 'clear-seal', '10');
    seal.setAttribute('aria-hidden', 'true');
    panel.append(
      seal,
      el('p', 'eyebrow', masterLabel(session.puzzle.displayNumber).toUpperCase()),
      el('h1', 'clear-title', '盤面クリア'),
      el('p', 'clear-copy', session.state.hintCount === 0 && session.state.undoCount === 0
        ? 'ノーアシストで解き切りました。見事です。'
        : '最後の数字まで、すべて消えました。'),
    );
    const results = el('dl', 'result-grid');
    for (const [label, value] of [
      ['手数', session.state.moveCount],
      ['所要時間', formatTime(session.elapsedTime)],
      ['数字追加', session.state.additionsUsed],
      ['ヒント', session.state.hintCount],
      ['Undo', session.state.undoCount],
      ['判定', session.state.hintCount === 0 && session.state.undoCount === 0 ? 'ノーアシスト' : 'アシスト使用'],
    ] as const) {
      const item = el('div');
      item.append(el('dt', undefined, label), el('dd', undefined, String(value)));
      results.append(item);
    }
    const actions = el('div', 'clear-actions');
    const currentIndex = PUZZLES.findIndex((puzzle) => puzzle.puzzleId === session.puzzle.puzzleId);
    const next = PUZZLES[currentIndex + 1];
    if (next) {
      actions.append(this.#button('次の問題', 'accent-button', () => this.#startPuzzle(next)));
    }
    actions.append(
      this.#button('同じ問題を再プレイ', 'menu-button', () => this.#startPuzzle(session.puzzle, true)),
      this.#button('ホームへ戻る', 'menu-button', () => this.#go('home')),
    );
    panel.append(results, actions);
    main.append(panel);
    this.#root.append(main);
  }

  #renderHowTo(): void {
    this.#root.append(this.#brandHeader(() => this.#go('home')));
    const main = this.#main('遊び方');
    const intro = el('p', 'screen-intro', '盤面の数字を2つずつ消し、最後の1つまで残さず空にすることが目的です。時間制限はありません。');
    const rules = [
      ['01', '数字の組み合わせ', '同じ数字、または合計が10になる2数字を選びます。5と5も1組です。'],
      ['02', 'つながる方向', '横・縦・斜めの直線上で、途中が空所なら離れた数字もつながります。途中に数字があれば、その先には届きません。'],
      ['03', '行をまたぐ接続', '左上から右下への読み順で、間がすべて空所なら前の行から次の行へつながります。'],
      ['04', '数字追加', '合法ペアが残っていても、残った数字を読み順のまま盤面末尾へ追加できます。全問題5回までで、早すぎる追加が不利になる場合もあります。'],
      ['05', '困ったとき', 'Undoは直前の盤面へ戻します。ヒントは完走できると検証した手だけを示し、安全性を確認できないときは何も勧めません。'],
    ] as const;
    const list = el('div', 'rule-list');
    for (const [number, title, description] of rules) {
      const card = el('section', 'rule-card');
      card.append(el('span', 'rule-number', number), el('h2', undefined, title), el('p', undefined, description));
      list.append(card);
    }
    main.append(intro, list);
    this.#root.append(main);
  }

  #renderSettings(): void {
    this.#root.append(this.#brandHeader(() => this.#go('home')));
    const main = this.#main('設定');
    const form = el('form', 'settings-form');
    form.addEventListener('submit', (event) => event.preventDefault());

    const selectRow = el('label', 'setting-row');
    const selectText = el('span');
    selectText.append(el('strong', undefined, '文字サイズ'), el('small', undefined, '画面全体の文字を読みやすくします'));
    const select = el('select', 'setting-select');
    for (const [value, label] of [['standard', '標準'], ['large', '大きい']] as const) {
      const option = el('option', undefined, label);
      option.value = value;
      option.selected = this.#settings.fontSize === value;
      select.append(option);
    }
    select.addEventListener('change', () => this.#updateSettings({ fontSize: select.value as AppSettings['fontSize'] }));
    selectRow.append(selectText, select);
    form.append(selectRow);

    const toggles: readonly [keyof Omit<AppSettings, 'fontSize'>, string, string][] = [
      ['soundEnabled', '効果音', '成功時に短い端末内合成音を鳴らします'],
      ['vibrationEnabled', '振動', '対応端末で短く触覚フィードバックします'],
      ['reducedMotion', 'アニメーション軽減', '動きと切り替えを最小限にします'],
      ['highContrast', '高コントラスト', '輪郭と文字の明暗差を強くします'],
      ['largeBoard', '大きく表示', 'セルを44px以上にして、必要なら横にパンできます'],
    ];
    for (const [key, label, description] of toggles) {
      const row = el('label', 'setting-row');
      const text = el('span');
      text.append(el('strong', undefined, label), el('small', undefined, description));
      const input = el('input', 'toggle-input');
      input.type = 'checkbox';
      input.checked = this.#settings[key];
      input.addEventListener('change', () => this.#updateSettings({ [key]: input.checked }));
      row.append(text, input);
      form.append(row);
    }

    const install = el('section', 'install-card');
    install.append(
      el('h2', undefined, 'ホーム画面へ追加'),
      el('p', undefined, 'iPhone / iPad: Safariの共有ボタンから「ホーム画面に追加」を選びます。Android: Chromeのメニューから「アプリをインストール」を選びます。Windows: EdgeまたはChromeのアドレスバーにあるインストールアイコンを使います。'),
    );
    const danger = el('section', 'danger-card');
    danger.append(
      el('h2', undefined, 'セーブデータ'),
      el('p', undefined, 'この端末に保存した進行状況、記録、設定を削除します。この操作は元に戻せません。'),
      this.#button('セーブデータを削除', 'danger-button', () => {
        if (window.confirm('Master Tenのセーブデータと設定をすべて削除しますか？ この操作は元に戻せません。')) {
          this.#repository.clearAllOwnedData();
          this.#settings = DEFAULT_SETTINGS;
          this.#progress = { schemaVersion: SAVE_SCHEMA_VERSION, completedPuzzles: [], noAssistCompletions: [] };
          this.#saved = undefined;
          this.#session = undefined;
          this.#notice = 'セーブデータを削除しました';
          this.#applySettings();
          this.#go('home');
        }
      }),
    );
    main.append(form, install, danger, this.#noticeRegion());
    this.#root.append(main);
  }

  #handleBoardKey(event: KeyboardEvent, currentIndex: number): void {
    if (event.key === 'Escape') {
      this.#session?.clearSelection();
      this.#notice = '選択を解除しました';
      this.render();
      return;
    }
    const offsets: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -9,
      ArrowDown: 9,
    };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    const cells = [...this.#root.querySelectorAll<HTMLButtonElement>('.number-cell[data-index]')];
    let targetIndex = currentIndex + offset;
    while (targetIndex >= 0 && targetIndex < (this.#session?.state.board.logicalLength ?? 0)) {
      const target = cells.find((cell) => Number(cell.dataset.index) === targetIndex);
      if (target) {
        target.tabIndex = 0;
        target.focus();
        break;
      }
      targetIndex += offset;
    }
  }

  #startPuzzle(puzzle: VerifiedPuzzle, replay = false): void {
    if (
      !replay &&
      this.#saved?.completionStatus === 'PLAYING' &&
      !window.confirm('進行中の問題を終了して、別の問題を始めますか？ 現在の盤面は上書きされます。')
    ) return;
    this.#session = GameSession.create(
      puzzle,
      this.#settings,
      this.#progress,
      this.#repository,
    );
    this.#notice = `問題${puzzle.displayNumber}を開始しました`;
    this.#syncSaved();
    this.#screen = 'game';
    this.render();
  }

  #resumeSaved(): void {
    const saved = this.#saved;
    if (!saved) return;
    const puzzle = PUZZLES.find((candidate) => candidate.puzzleId === saved.puzzleId);
    if (!puzzle) {
      this.#notice = '保存した問題が見つかりません';
      this.#go('home');
      return;
    }
    this.#session = GameSession.resume(
      saved,
      puzzle,
      this.#settings,
      this.#progress,
      this.#repository,
    );
    this.#screen = saved.completionStatus === 'WON' ? 'clear' : 'game';
    this.#notice = '保存した盤面を復元しました';
    this.render();
  }

  #syncSaved(): void {
    const loaded = this.#repository.loadSession(PUZZLES);
    this.#saved = loaded.status === 'OK' ? loaded.session : undefined;
  }

  #updateSettings(changes: Partial<AppSettings>): void {
    this.#settings = { ...this.#settings, ...changes };
    this.#repository.saveSettings(this.#settings);
    this.#session?.updateSettings(this.#settings);
    this.#applySettings();
    this.#notice = '設定を保存しました';
    this.render();
  }

  #applySettings(): void {
    const root = document.documentElement;
    root.dataset.fontSize = this.#settings.fontSize;
    root.dataset.contrast = this.#settings.highContrast ? 'high' : 'standard';
    root.dataset.motion = this.#settings.reducedMotion ? 'reduced' : 'standard';
    root.dataset.boardSize = this.#settings.largeBoard ? 'large' : 'standard';
  }

  #feedback(success: boolean): void {
    if (success && this.#settings.vibrationEnabled && 'vibrate' in navigator) {
      navigator.vibrate(20);
    }
    if (!success || !this.#settings.soundEnabled || !('AudioContext' in window)) return;
    try {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 440;
      gain.gain.setValueAtTime(0.035, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.08);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.08);
      oscillator.addEventListener('ended', () => void context.close());
    } catch {
      // Audio is optional; gameplay continues when the platform blocks it.
    }
  }

  #puzzleNumber(puzzleId: string): number {
    return PUZZLES.find((puzzle) => puzzle.puzzleId === puzzleId)?.displayNumber ?? 0;
  }

  #go(screen: Screen): void {
    this.#screen = screen;
    this.render();
    window.scrollTo({ top: 0, behavior: this.#settings.reducedMotion ? 'auto' : 'smooth' });
  }
}
