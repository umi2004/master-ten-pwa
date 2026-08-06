import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { basename, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

const DEFAULT_URL = 'https://umi2004.github.io/master-ten-pwa/';
const PROFILE_PREFIX = 'master-ten-offline-';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function freePort() {
  const server = createServer();
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
  });
  const address = server.address();
  assert(address && typeof address !== 'string', '検証用ポートを取得できませんでした');
  const port = address.port;
  await new Promise((accept) => server.close(accept));
  return port;
}

function browserPath() {
  const candidates = [
    process.env.MASTER_TEN_BROWSER_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/microsoft-edge',
    '/usr/bin/google-chrome',
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  assert(found, 'EdgeまたはChromeが見つかりません。MASTER_TEN_BROWSER_PATHを指定してください。');
  return found;
}

class CdpConnection {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
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
      const listeners = this.listeners.get(message.method) ?? [];
      this.listeners.delete(message.method);
      for (const listener of listeners) listener(message.params);
    });
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((accept, reject) => {
      this.pending.set(id, { accept, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  waitFor(method, timeoutMs = 20_000) {
    return new Promise((accept, reject) => {
      const timer = setTimeout(() => reject(new Error(`${method}を待機中にタイムアウトしました`)), timeoutMs);
      const listeners = this.listeners.get(method) ?? [];
      listeners.push((params) => {
        clearTimeout(timer);
        accept(params);
      });
      this.listeners.set(method, listeners);
    });
  }

  close() {
    this.socket?.close();
  }
}

async function waitForEndpoint(baseUrl) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/json/version`);
      if (response.ok) return;
    } catch {
      // Browser process may still be starting.
    }
    await delay(100);
  }
  throw new Error('ブラウザの検証用接続が開始しませんでした');
}

async function openPage(baseUrl, offline) {
  const targetResponse = await fetch(`${baseUrl}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' });
  assert(targetResponse.ok, `検証タブを作成できませんでした: ${targetResponse.status}`);
  const target = await targetResponse.json();
  const cdp = new CdpConnection(target.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  if (offline) {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
  }
  return { cdp, target };
}

async function navigate(cdp, url) {
  const loaded = cdp.waitFor('Page.loadEventFired');
  const result = await cdp.send('Page.navigate', { url });
  assert(!result.errorText, `ページを開けませんでした: ${result.errorText}`);
  await loaded;
  await delay(150);
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

async function closePage(baseUrl, page) {
  page.cdp.close();
  await fetch(`${baseUrl}/json/close/${page.target.id}`).catch(() => undefined);
  await delay(100);
}

const targetUrl = process.argv[2] ?? DEFAULT_URL;
const profileDirectory = mkdtempSync(join(tmpdir(), PROFILE_PREFIX));
const port = await freePort();
const debugBaseUrl = `http://127.0.0.1:${port}`;
let browser;

try {
  browser = spawn(browserPath(), [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profileDirectory}`,
    `--remote-debugging-port=${port}`,
    'about:blank',
  ], { stdio: 'ignore', windowsHide: true });
  await waitForEndpoint(debugBaseUrl);

  const onlinePage = await openPage(debugBaseUrl, false);
  await navigate(onlinePage.cdp, targetUrl);
  let onlinePwa = await evaluate(onlinePage.cdp, `(async () => {
    const registration = await navigator.serviceWorker.ready;
    await new Promise((accept) => setTimeout(accept, 500));
    return {
      title: document.title,
      scope: registration.scope,
      controlled: Boolean(navigator.serviceWorker.controller),
      caches: await caches.keys()
    };
  })()`);
  if (!onlinePwa.controlled) {
    await navigate(onlinePage.cdp, targetUrl);
    onlinePwa = await evaluate(onlinePage.cdp, `(async () => ({
      title: document.title,
      scope: (await navigator.serviceWorker.ready).scope,
      controlled: Boolean(navigator.serviceWorker.controller),
      caches: await caches.keys()
    }))()`);
  }
  assert(onlinePwa.controlled, 'Service Workerがページを制御していません');
  assert(onlinePwa.caches.some((name) => name.startsWith('master-ten-shell-')), 'アプリシェルキャッシュがありません');
  await closePage(debugBaseUrl, onlinePage);

  const firstOfflinePage = await openPage(debugBaseUrl, true);
  await navigate(firstOfflinePage.cdp, targetUrl);
  const offlineHome = await evaluate(firstOfflinePage.cdp, `({
    title: document.title,
    hasHome: document.body.innerText.includes('新しいMaster問題'),
    controlled: Boolean(navigator.serviceWorker.controller)
  })`);
  assert(offlineHome.hasHome && offlineHome.controlled, 'オフラインでホーム画面を起動できません');

  await evaluate(firstOfflinePage.cdp, `(() => {
    [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === '問題一覧')?.click();
  })()`);
  const offlineListCount = await evaluate(firstOfflinePage.cdp, `document.querySelectorAll('.puzzle-card').length`);
  assert(offlineListCount === 5, `オフライン試作問題一覧が${offlineListCount}件です`);

  await evaluate(firstOfflinePage.cdp, `document.querySelector('.puzzle-card button')?.click()`);
  const initialCells = await evaluate(firstOfflinePage.cdp, `document.querySelectorAll('button.number-cell').length`);
  assert(initialCells > 0, 'オフラインで問題を開始できません');
  await evaluate(firstOfflinePage.cdp, `document.querySelector('[aria-label="行1 列1 数字1"]')?.click()`);
  await evaluate(firstOfflinePage.cdp, `document.querySelector('[aria-label="行1 列2 数字1"]')?.click()`);
  const savedMoveCount = await evaluate(firstOfflinePage.cdp, `[...document.querySelectorAll('.stat-item')]
    .find((item) => item.querySelector('dt')?.textContent === '手数')?.querySelector('dd')?.textContent`);
  assert(savedMoveCount === '1', 'オフライン操作を自動保存できません');
  await delay(650);
  await closePage(debugBaseUrl, firstOfflinePage);

  const reopenedOfflinePage = await openPage(debugBaseUrl, true);
  await navigate(reopenedOfflinePage.cdp, targetUrl);
  const hasContinue = await evaluate(reopenedOfflinePage.cdp, `document.body.innerText.includes('続きから')`);
  assert(hasContinue, 'オフライン再起動後に「続きから」がありません');
  const persistedElapsedTime = await evaluate(reopenedOfflinePage.cdp, `JSON.parse(
    localStorage.getItem('master-ten:session:v1')
  ).elapsedTime`);
  assert(persistedElapsedTime >= 500, 'ページを閉じる直前の経過時間が保存されていません');
  await evaluate(reopenedOfflinePage.cdp, `[...document.querySelectorAll('button')]
    .find((button) => button.textContent?.includes('続きから'))?.click()`);
  const restoredMoveCount = await evaluate(reopenedOfflinePage.cdp, `[...document.querySelectorAll('.stat-item')]
    .find((item) => item.querySelector('dt')?.textContent === '手数')?.querySelector('dd')?.textContent`);
  assert(restoredMoveCount === '1', 'オフライン再起動後の手数が一致しません');

  await evaluate(reopenedOfflinePage.cdp, `document.querySelector('[aria-label="前の画面へ戻る"]')?.click()`);
  await evaluate(reopenedOfflinePage.cdp, `[...document.querySelectorAll('button')]
    .find((button) => button.textContent?.trim() === '設定')?.click()`);
  const changedContrast = await evaluate(reopenedOfflinePage.cdp, `(() => {
    const row = [...document.querySelectorAll('.setting-row')]
      .find((candidate) => candidate.querySelector('strong')?.textContent === '高コントラスト');
    const input = row?.querySelector('input[type="checkbox"]');
    if (!input) return false;
    input.click();
    return document.documentElement.dataset.contrast === 'high';
  })()`);
  assert(changedContrast, 'オフラインで高コントラスト設定を変更できません');
  await navigate(reopenedOfflinePage.cdp, targetUrl);
  const settingPersisted = await evaluate(reopenedOfflinePage.cdp, `document.documentElement.dataset.contrast === 'high'`);
  assert(settingPersisted, 'オフラインで変更した設定が再読込後に復元されません');

  console.log(JSON.stringify({
    status: 'PASS',
    targetUrl,
    onlinePwa,
    offlineHome,
    offlineListCount,
    initialCells,
    savedMoveCount,
    persistedElapsedTime,
    restoredMoveCount,
    settingPersisted,
  }, null, 2));
  await closePage(debugBaseUrl, reopenedOfflinePage);
} finally {
  browser?.kill();
  await delay(500);
  const resolvedProfile = resolve(profileDirectory);
  const resolvedTemp = resolve(tmpdir());
  if (resolvedProfile.startsWith(`${resolvedTemp}${sep}`) && basename(resolvedProfile).startsWith(PROFILE_PREFIX)) {
    try {
      rmSync(resolvedProfile, { recursive: true, force: true });
    } catch {
      console.warn(`一時ブラウザプロファイルを削除できませんでした: ${resolvedProfile}`);
    }
  }
}
