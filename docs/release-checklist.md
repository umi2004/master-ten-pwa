# Master Ten リリースチェックリスト

最終更新: 2026-08-06

## 仕様・知的財産

- [x] 調査レポートを主要資料としてGit保存
- [x] 公式事実、観察、非公式、推測、独自仕様を区別
- [x] Master Ten独自ルールを版付きで文書化
- [x] 参考製品の名称・ロゴ・画像・音声・文章・問題・コードを不使用
- [x] 内部出典記号をREADME、UI、公開文書へ転記していない

## ルール・探索・問題

- [x] 決定論的・非破壊ルールエンジン
- [x] `SOLVED` / `UNSOLVABLE` / `UNKNOWN`を区別
- [x] 基準BFSとメモ化DFSの一致検査
- [x] 解手順の再生で勝利
- [x] 安全ヒントだけを提示し、`UNKNOWN`では無保証手を非提示
- [x] 30問全て`SOLVED`、`UNKNOWN` 0
- [x] 最小追加回数を全問証明
- [x] ID、seed、ハッシュ、構造署名が全件一意
- [x] 保存解と全局面安全ヒントを全問検証

## UI・保存

- [x] ホーム、ゲーム、一覧、遊び方、設定、クリア
- [x] ペア削除、数字追加、Undo、ヒント、リスタート
- [x] 無効ペアで盤面不変
- [x] 各操作後の自動保存と「続きから」
- [x] 保存schema・版・問題・ハッシュ・セル範囲検証
- [x] 旧schema移行と破損データ隔離
- [x] 日本語、ARIA、キーボード、focus、高コントラスト、reduced motion
- [x] 320/375/1024px相当で横溢れなし
- [x] セーブデータ削除と破壊操作確認

## PWA・公開

- [x] manifest、standalone、theme/background、独自アイコン
- [x] `/master-ten-pwa/`のbase、start URL、scope、SW
- [x] HTML network-first、資産cache-first、旧キャッシュ削除
- [x] 公開URL・CSS・JS・manifest・SW・全アイコンHTTP 200
- [x] Service Worker controllerとアプリシェルcache確認
- [x] 完全オフラインで再起動、一覧、開始、保存、再開、設定
- [x] GitHub Actionsで`npm ci`、テスト、ビルド、デプロイ成功
- [x] HTTPS強制、Pages workflow source

## 最終コマンド

- [x] `npm test`: 163/163
- [x] `npm run build`: 成功
- [x] `npm run validate:puzzles`: 30/30
- [x] `npm run verify:offline`: PASS
- [x] `git diff --check`: 成功
- [x] origin/mainとローカルSHA一致を確認

## 実機受入で残す項目

- [ ] iPhone実機: Safari共有 → ホーム画面に追加 → オフライン起動
- [ ] iPad実機: 縦横、中央配置、safe area、キーボード
- [ ] Android実機: Chromeインストール → オフライン起動
- [ ] 実機: 効果音、振動、文字拡大、画面回転、長時間プレイ

上記4項目は実機未所有のため未確認。公開を妨げる既知のコード不具合はない。実機で問題が見つかった場合は、再現条件、端末、OS、ブラウザ版を記録し、テスト追加後に修正する。
