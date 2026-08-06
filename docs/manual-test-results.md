# Master Ten 手動・公開検証結果

検証日: 2026-08-06（America/Toronto）

## 1. 検証環境

- Windows、Node.js `v24.14.1`、npm `11.11.0`
- Microsoft Edge `151.0.4129.59`（既存インストール、一時プロファイル）
- Codexアプリ内ブラウザ
- 公開URL: `https://umi2004.github.io/master-ten-pwa/`
- Pages設定: `build_type=workflow`、HTTPS強制

ブラウザや巨大テストパッケージは追加インストールしていない。利用不能だった任意のagent-browser CLIは追加入手せず、既存ブラウザで代替した。

## 2. 自動テスト・ビルド

| 項目 | 結果 |
|---|---|
| `npm test` | PASS、10ファイル、163テスト |
| `npm run build` | PASS、TypeScript検査・Vite本番ビルド |
| `npm run validate:puzzles` | PASS、30/30問 |
| 実行時依存 | 0 |
| console error | 0 |

## 3. 公開HTTP検査

公開HTMLから参照される資産と追加PWA資産を走査した。

| 資産 | HTTP | Content-Type |
|---|---:|---|
| `/master-ten-pwa/` | 200 | `text/html` |
| ハッシュ付きJavaScript | 200 | `application/javascript` |
| ハッシュ付きCSS | 200 | `text/css` |
| `manifest.webmanifest` | 200 | `application/manifest+json` |
| `sw.js` | 200 | `application/javascript` |
| SVGアイコン | 200 | `image/svg+xml` |
| 180/192/512px PNGアイコン | 200 | `image/png` |

404は0件。HTML、CSS、JavaScriptは`/master-ten-pwa/`配下を参照していた。

## 4. 公開UI実操作

| 操作 | 結果 |
|---|---|
| ホーム表示 | PASS、日本語本文・主要導線・プライバシー表示 |
| 問題一覧 | PASS、30件、状態・難度・開始ボタン |
| 問題開始 | PASS、9列盤面・統計・自動保存表示 |
| 無効ペア | PASS、手数0・生存20のまま、理由を日本語表示 |
| 有効ペア | PASS、生存20→18、手数0→1、空行8→7 |
| Undo | PASS、生存20・手数0へ復元、Undo 1 |
| 安全ヒント | PASS、問題1で検証経路の2セルだけを強調 |
| リロード復元 | PASS、ホームの「続きから」→問題1・1手・生存18 |
| 数字追加 | PASS、問題3の安全経路で1回実行 |
| クリア | PASS、問題3を18手・追加1回で完走 |
| 設定保存 | PASS、高コントラストを再読込後も復元 |
| キーボード | PASS、右矢印で次セルへ移動し実線focus outline |

問題3はヒントエンジンが示す18手を実操作し、ペア17回と数字追加1回でクリアした。全局面で無保証の手は使っていない。

## 5. レスポンシブ実測

| Viewport | 標準セル | ページ横溢れ | 盤面横溢れ | 備考 |
|---:|---:|---|---|---|
| 320×568相当 | 29.77px | なし | なし | Windows型15pxスクロールバー込みclient幅305px |
| 375×812相当 | 32.55px | なし | なし | 操作ボタン最小52px |
| 1024×768相当 | 42px | なし | なし | 盤面外枠440px、中央配置 |

初回公開検査で375px盤面内スクロールを発見し、セル計算、最狭幅、SWキャッシュ版を修正した。再デプロイ後に同じ条件で解消を確認した。標準セルは44px未満になる設計例外であり、「大きく表示」は48pxとパンを使う。

## 6. 完全オフライン再起動

`npm run verify:offline`を公開URLに対して実行しPASSした。

1. 新規一時Edgeプロファイルでオンライン表示
2. Service Worker ready、scope、controllerを確認
3. `master-ten-shell-v4`キャッシュを確認
4. タブを閉じる
5. 新規タブをネットワーク完全オフラインにして公開URLを起動
6. ホームと30問一覧を表示
7. 問題1を開始して1ペア削除、手数1を保存
8. タブを閉じ、別のオフラインタブで再起動
9. 「続きから」で手数1を復元
10. オフラインで高コントラストを変更し、再読込後も復元

実測値: `controlled=true`、cache=`master-ten-shell-v4`、問題一覧30、初期生存20、保存手数1、ページ終了時の経過時間保存、復元手数1、設定復元true。

## 7. GitHub Actions・Pages

- workflow: `Test, build, and deploy Pages`
- `npm ci`、全テスト、ビルド、Pages構成、artifact upload、deployが成功
- 最終アプリ版のrun `31075097000`: build 36秒、deploy 10秒、success
- GitHub公式`configure-pages@v5`とその内部artifact actionについてNode.js 20非推奨警告が出る場合があるが、GitHubホストrunnerがNode.js 24で実行し、jobは成功している。公式メジャー版更新時に追随する。

## 8. 実機で未確認の項目

- 実機iPhone / iPad Safariでの視覚、safe area、ホーム画面追加、standalone起動
- 実機Android Chromeでのインストール、standalone起動
- 実機の効果音、振動、OS文字拡大との組合せ
- 長時間プレイ時の電池・熱・メモリ

これらは環境に実機がないため未確認であり、成功と偽っていない。公開PWAのmanifest、scope、アイコン、オフライン再起動、各レスポンシブ幅は自動化済み。実機確認手順は[`release-checklist.md`](release-checklist.md)に残す。
