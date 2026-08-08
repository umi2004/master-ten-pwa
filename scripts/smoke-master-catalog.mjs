import { existsSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const targetUrl = process.argv[2] ?? 'http://127.0.0.1:4173/master-ten-pwa/';
const browserPaths = [
  process.env.MASTER_TEN_BROWSER_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);
const browserPath = browserPaths.find((candidate) => existsSync(candidate));
if (!browserPath) throw new Error('Edge or MASTER_TEN_BROWSER_PATH is required for browser smoke.');

class CdpConnection {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((accept, reject) => {
      this.socket.addEventListener('open', accept, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const request = this.pending.get(message.id);
        if (!request) return;
        this.pending.delete(message.id);
        if (message.error) request.reject(new Error(message.error.message));
        else request.accept(message.result);
        return;
      }
      for (const handler of this.handlers.get(message.method) ?? []) handler(message.params);
    });
  }

  on(method, handler) {
    const handlers = this.handlers.get(method) ?? [];
    handlers.push(handler);
    this.handlers.set(method, handlers);
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((accept, reject) => {
      this.pending.set(id, { accept, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket?.close();
  }
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}

async function clickButton(cdp, label) {
  const clicked = await evaluate(cdp, `(() => {
    const button = [...document.querySelectorAll('button')]
      .find((candidate) => candidate.textContent?.trim() === ${JSON.stringify(label)});
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Clickable button not found: ${label}`);
  await delay(10);
}

async function stat(cdp, label) {
  return evaluate(cdp, `(() => [...document.querySelectorAll('.stat-item')]
    .find((item) => item.querySelector('dt')?.textContent === ${JSON.stringify(label)})
    ?.querySelector('dd')?.textContent)()`);
}

const { spawn } = await import('node:child_process');
const { createServer } = await import('node:net');
const server = createServer();
await new Promise((accept, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', accept);
});
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Could not allocate browser debug port.');
const port = address.port;
await new Promise((accept) => server.close(accept));
const debugUrl = `http://127.0.0.1:${port}`;
const browser = spawn(browserPath, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=390,844',
  `--remote-debugging-port=${port}`,
  'about:blank',
], { stdio: 'ignore', windowsHide: true });

let cdp;
try {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${debugUrl}/json/version`);
      if (response.ok) break;
    } catch {
      // Edge may still be starting.
    }
    await delay(100);
  }
  const targetResponse = await fetch(`${debugUrl}/json/new?${encodeURIComponent(targetUrl)}`, { method: 'PUT' });
  if (!targetResponse.ok) throw new Error(`Could not open smoke page: ${targetResponse.status}`);
  const target = await targetResponse.json();
  cdp = new CdpConnection(target.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  const consoleErrors = [];
  cdp.on('Runtime.exceptionThrown', (event) => consoleErrors.push(event.exceptionDetails?.text ?? 'exception'));
  cdp.on('Runtime.consoleAPICalled', (event) => {
    if (event.type === 'error') consoleErrors.push(event.args?.map((argument) => argument.value).join(' ') ?? 'console error');
  });
  const navigation = await cdp.send('Page.navigate', { url: targetUrl });
  if (navigation.errorText) throw new Error(`Smoke navigation failed: ${navigation.errorText}`);
  await delay(250);
  await evaluate(cdp, `localStorage.setItem('master-ten:settings:v1', JSON.stringify({
    fontSize: 'standard', soundEnabled: false, vibrationEnabled: false,
    reducedMotion: true, highContrast: false, largeBoard: false
  }))`);
  const navigationStarted = Date.now();
  await cdp.send('Page.reload', { ignoreCache: true });
  await delay(250);
  const loadMs = Date.now() - navigationStarted;
  const home = await evaluate(cdp, `({
    title: document.title,
    text: document.body.innerText,
    blank: document.body.innerText.trim().length === 0,
    overlay: Boolean(document.querySelector('.vite-error-overlay, #webpack-dev-server-client-overlay, [data-nextjs-dialog]')),
    buttons: [...document.querySelectorAll('button')].map((button) => button.textContent?.trim())
  })`);
  if (home.blank || home.overlay || !home.text.includes('MASTER')) throw new Error('Home did not render correctly.');
  if (home.text.includes('HARD') || home.text.includes('EXTREME')) throw new Error('Public non-MASTER tier is visible.');
  const homeScreenshot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync('dist/browser-smoke-home.png', Buffer.from(homeScreenshot.data, 'base64'));

  await clickButton(cdp, '新しいゲーム');
  const initialGame = await evaluate(cdp, `({
    text: document.body.innerText,
    cells: document.querySelectorAll('button.number-cell').length,
    overlay: Boolean(document.querySelector('.vite-error-overlay'))
  })`);
  if (
    initialGame.cells !== 42
    || initialGame.overlay
    || !initialGame.text.includes('MASTER')
    || initialGame.text.includes('LOCAL CANDIDATE')
    || initialGame.text.includes('難度 ')
  ) throw new Error('New Game screen failed catalog/UI checks.');

  await clickButton(cdp, 'ヒント');
  const hintCount = await stat(cdp, 'ヒント');
  await clickButton(cdp, '数字追加');
  const afterAdd = await stat(cdp, '追加残り');
  await clickButton(cdp, '1手戻す');
  const afterUndo = await stat(cdp, '追加残り');
  const undoCount = await stat(cdp, 'Undo');
  if (hintCount !== '1' || afterAdd !== '4' || afterUndo !== '5' || undoCount !== '1') {
    throw new Error('Hint, ADD, or Undo smoke failed.');
  }

  const clearResult = await evaluate(cdp, `(async () => {
    const pause = () => new Promise((accept) => setTimeout(accept, 0));
    for (let step = 0; step < 250; step += 1) {
      if (document.body.innerText.includes('盤面クリア')) return { status: 'WON', steps: step };
      const hint = [...document.querySelectorAll('button')]
        .find((button) => button.textContent?.trim() === 'ヒント');
      hint?.click();
      await pause();
      const indexes = [...document.querySelectorAll('button.number-cell.is-hinted')]
        .map((cell) => cell.dataset.index);
      if (indexes.length === 2) {
        document.querySelector('button.number-cell[data-index="' + indexes[0] + '"]')?.click();
        await pause();
        document.querySelector('button.number-cell[data-index="' + indexes[1] + '"]')?.click();
      } else {
        [...document.querySelectorAll('button')]
          .find((button) => button.textContent?.trim() === '数字追加' && !button.disabled)?.click();
      }
      await pause();
    }
    return { status: document.body.innerText.includes('盤面クリア') ? 'WON' : 'TIMEOUT', steps: 250 };
  })()`);
  if (clearResult.status !== 'WON') throw new Error(`Clear smoke failed: ${JSON.stringify(clearResult)}`);
  const totalClears = await evaluate(cdp, `(() => [...document.querySelectorAll('.result-grid div')]
    .find((item) => item.querySelector('dt')?.textContent === '累計クリア')
    ?.querySelector('dd')?.textContent)()`);
  await clickButton(cdp, '同じ問題を再プレイ');
  const replay = await evaluate(cdp, `({
    practiceMode: JSON.parse(localStorage.getItem('master-ten:session:v1')).practiceMode,
    hasGame: document.body.innerText.includes('追加残り')
  })`);
  if (!replay.practiceMode || !replay.hasGame) throw new Error('Replay did not start explicit practice mode.');

  const lossStrategy = `(async () => {
    const pause = () => new Promise((accept) => setTimeout(accept, 0));
    const values = () => {
      const cells = [...document.querySelector('.number-board').children];
      const logical = cells.findIndex((cell) => cell.classList.contains('is-display-empty'));
      return cells.slice(0, logical < 0 ? cells.length : logical)
        .map((cell) => cell.matches('button.number-cell') ? Number(cell.textContent) : 0);
    };
    const legalPair = (cells) => {
      const width = 9;
      const rows = Math.ceil(cells.length / width);
      const directions = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
      const matches = (a, b) => a !== 0 && b !== 0 && (a === b || a + b === 10);
      const pairs = [];
      for (let index = 0; index < cells.length; index += 1) {
        if (!cells[index]) continue;
        const row = Math.floor(index / width);
        const column = index % width;
        for (const [dr, dc] of directions) {
          let nextRow = row + dr;
          let nextColumn = column + dc;
          while (nextRow >= 0 && nextRow < rows && nextColumn >= 0 && nextColumn < width) {
            const next = nextRow * width + nextColumn;
            if (next >= cells.length) break;
            if (cells[next]) {
              if (matches(cells[index], cells[next])) pairs.push([index, next]);
              break;
            }
            nextRow += dr;
            nextColumn += dc;
          }
        }
      }
      let previous;
      for (let index = 0; index < cells.length; index += 1) {
        if (!cells[index]) continue;
        if (previous !== undefined && Math.floor(previous / width) !== Math.floor(index / width)
          && matches(cells[previous], cells[index])) pairs.push([previous, index]);
        previous = index;
      }
      return pairs.at(-1);
    };
    for (let step = 0; step < 700; step += 1) {
      if (document.body.innerText.includes('GAME OVER')) return { status: 'LOST', steps: step };
      if (document.body.innerText.includes('盤面クリア')) return { status: 'WON', steps: step };
      const add = [...document.querySelectorAll('button')]
        .find((button) => button.textContent?.trim() === '数字追加' && !button.disabled);
      if (add) {
        add.click();
        await pause();
        continue;
      }
      const pair = legalPair(values());
      if (!pair) {
        await pause();
        continue;
      }
      document.querySelector('button.number-cell[data-index="' + pair[0] + '"]')?.click();
      await pause();
      document.querySelector('button.number-cell[data-index="' + pair[1] + '"]')?.click();
      await pause();
    }
    return { status: 'TIMEOUT', steps: 700 };
  })()`;
  let gameOverResult;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    gameOverResult = await evaluate(cdp, lossStrategy);
    if (gameOverResult.status === 'LOST') break;
    if (gameOverResult.status !== 'WON') break;
    await clickButton(cdp, '新しいゲーム');
  }
  if (gameOverResult?.status !== 'LOST') {
    throw new Error(`Game Over smoke failed: ${JSON.stringify(gameOverResult)}`);
  }
  const gameOverScreenshot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync('dist/browser-smoke-game-over.png', Buffer.from(gameOverScreenshot.data, 'base64'));
  if (consoleErrors.length > 0) throw new Error(`Browser console errors: ${consoleErrors.join(' | ')}`);

  console.log(JSON.stringify({
    status: 'PASS',
    targetUrl,
    loadMs,
    homeTitle: home.title,
    homeButtons: home.buttons,
    initialCells: initialGame.cells,
    hintCount,
    afterAdd,
    afterUndo,
    undoCount,
    clearResult,
    totalClears,
    replay,
    gameOverResult,
    consoleErrors,
    screenshots: ['dist/browser-smoke-home.png', 'dist/browser-smoke-game-over.png'],
  }, null, 2));
} finally {
  cdp?.close();
  browser.kill();
}
