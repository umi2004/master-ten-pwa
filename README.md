# Master Ten

[Master Tenをプレイ](https://umi2004.github.io/master-ten-pwa/) · [GitHubリポジトリ](https://github.com/umi2004/master-ten-pwa)

Master Tenは、同じ数字または合計10になる数字を消し、盤面を空にする日本語の高難易度数字パズルです。広告、課金、ログイン、ランキング、分析、外部ゲームサーバーはありません。30問を端末内だけで遊べ、自動保存とオフライン再起動に対応します。

名称、ルール詳細、問題、コード、文章、配色、画面、アイコン、効果音は本プロジェクト用の独自実装です。既存ゲームのコード、内部データ、画像、音声、問題配置は使用していません。

## 主な機能

- ソルバーで`SOLVED`を確認した固定Master問題30問
- 同じ数字または合計10、水平・垂直・斜め・読み順接続
- 手詰まり時だけ使える数字追加（問題ごとに0～3回）
- 検証済み完走経路上だけを示す安全ヒント
- Undo、リスタート、自動保存、「続きから」復元
- クリア、ノーアシスト、問題別進行状況の端末内記録
- 日本語UI、キーボード操作、ARIA、高コントラスト、動きの軽減
- iPhone、iPad、Android、Windowsブラウザ向けレスポンシブPWA
- GitHub Pagesの`/master-ten-pwa/`サブパスと完全オフライン再起動

詳しいルールは[`docs/game-spec.md`](docs/game-spec.md)、設計判断は[`docs/decisions.md`](docs/decisions.md)を参照してください。

## 技術構成

- Vite 7、TypeScript 5、HTML、CSS、Vanilla TypeScript
- Vitest（10ファイル、163テスト）
- 外部実行時依存0、UIフレームワーク0
- localStorage、Web Audio、Vibration API
- Web App Manifest、独自Service Worker、独自SVG/PNGアイコン
- GitHub Actions、GitHub Pages

## ローカル起動

Node.js 24とnpmを推奨します。

```bash
npm ci
npm run dev
```

ViteはGitHub Pages用baseを使用するため、表示URLは開発サーバーが案内する`/master-ten-pwa/`配下です。

## テストとビルド

```bash
npm test
npm run build
npm run preview
```

`npm test`は、ルール、正規化、数字追加、勝敗、三状態ソルバー、安全ヒント、30問全件、保存検証、移行、ゲームセッション、PWA資産を検査します。`npm run build`はTypeScript検査後に`dist/`を生成します。

## 問題生成と検証

問題は通常のアプリ起動時には生成・探索しません。開発時に独自テンプレートとseedから候補を作り、ソルバー、難易度特徴量、重複、保存解、安全ヒントを検証した固定データだけを公開します。

```bash
npm run generate:puzzles
npm run validate:puzzles
```

生成は[`src/puzzles/catalog.generated.ts`](src/puzzles/catalog.generated.ts)を更新します。生成後は必ずテストと検証を通し、`UNKNOWN`を公開データへ入れないでください。品質結果は[`docs/puzzle-validation.md`](docs/puzzle-validation.md)にあります。

アイコンも外部素材ではなく、次のスクリプトで再生成できます。

```bash
npm run generate:icons
```

## 完全オフライン検証

既存のEdgeまたはChromeを一時プロファイルで起動し、Service Worker登録後に回線を遮断して、再起動・一覧・プレイ・保存復元・設定保存を検査できます。ブラウザの追加インストールは行いません。

```bash
npm run verify:offline
```

自動検出できない場合だけ`MASTER_TEN_BROWSER_PATH`で実行ファイルを指定します。検証用プロファイルはOSの一時ディレクトリへ作成し、終了時に削除します。

## GitHub Pages公開

`main`へのpushで[Pages workflow](.github/workflows/deploy-pages.yml)が次を実行します。

1. `npm ci`
2. `npm test`
3. `npm run build`
4. `dist/`をPages artifactとしてアップロード
5. `https://umi2004.github.io/master-ten-pwa/`へデプロイ

Vite base、manifestの`id`・`start_url`・`scope`、Service Worker scopeはすべて`/master-ten-pwa/`です。

## PWAインストール

- iPhone / iPad: Safariで公開URLを開き、共有ボタン →「ホーム画面に追加」→「追加」
- Android: Chromeで公開URLを開き、メニュー →「アプリをインストール」または「ホーム画面に追加」
- Windows: EdgeまたはChromeで公開URLを開き、アドレスバーのインストールアイコンを選択

初回だけオンラインで公開URLを最後まで開いてください。その後は問題データを含むアプリシェルがキャッシュされ、オフラインで起動できます。

## プロジェクト構成

```text
src/core       純粋なルールエンジン
src/solver     基準BFSと実用メモ化DFS
src/hints      解経路限定ヒント
src/generator  決定論的問題生成・評価
src/puzzles    検証済み固定30問
src/storage    保存、検証、移行、隔離
src/ui         ゲームセッションとDOM UI
src/pwa        Service Worker登録
scripts        問題・アイコン・オフライン検証
tests          単体・統合・問題・PWAテスト
public         manifest、Service Worker、アイコン
docs           仕様、設計、検証、公開記録
```

## セーブデータ

進行中盤面、論理長、追加残数、履歴、手数、ヒント、Undo、時間、設定、クリア記録をlocalStorageへ各操作後に保存します。schema、各バージョン、問題ID、盤面ハッシュ、配列長、セル範囲を読込時に検証します。不正または移行不能な保存はMaster Ten用の隔離キーへ移し、アプリ全体は起動を継続します。

個人情報やプレイ記録を外部へ送信しません。詳細は[`docs/privacy.md`](docs/privacy.md)を参照してください。

## 既知の制限

- 9列を320px級の画面へ横スクロールなしで収めるため、標準セルは約30pxとなり44px目標の例外です。「大きく表示」は48pxセルと横パンを使います。
- 最小数字追加回数は全30問で証明済みですが、総手数の最短性を示す`provenOptimal`は原則falseです。
- Master難度は特徴量による初期モデルであり、人間の長期プレイ結果による再調整余地があります。
- 実機iPhone、iPad、Androidでの最終視覚・音・振動・インストール操作は未実施です。自動化と手順は[`docs/manual-test-results.md`](docs/manual-test-results.md)に記録しています。

参考製品と同一化していない点は[`docs/known-differences.md`](docs/known-differences.md)、現在のリリース判定は[`docs/release-checklist.md`](docs/release-checklist.md)を参照してください。
