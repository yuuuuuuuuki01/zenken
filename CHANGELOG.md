# ZEN KEN 開発ログ (CHANGELOG)

> **管理方針**: このファイルはGitなしでプロジェクトの変更履歴を詳細に記録します。
> AI（Antigravity）との作業セッション単位で記録し、再現性・追跡可能性を確保します。
> 最新の変更が一番上に来るように **降順** で記録してください。

---

## 📋 未実装タスク（WIP / やらなくてはならないこと）

> このセクションは常に最新の状態に保つこと。完了したら `[x]` にしてから変更履歴に移動する。

### 🔴 HIGH（システムが半動作のため優先）

- [x] **GCP 移行 / スケール準備（コンテナ化 & ログ構造化）**
  - Dockerhub / Cloud Run 向けの `Dockerfile` および `docker-compose.yml` の完成
  - BigQuery Streaming 連携を見据えた `pino` による構造化 JSON ログの実装

- [x] **`demander/frontend/dashboard.html` を新規作成・完全実装する**
  - Worker/Client 両対応のタブ UI をマウント
  - Client Console でのジョブ履歴表示、API キー管理（作成・削除）を実装
  - OS 別（Windows/Mac）の Agent ダウンロードリンクを有効化

- [x] **`POST /poc/init-data` エンドポイントを実装する**
  - LP 上の「結果をダッシュボードに保存」ボタンが動作可能になった

### 🟡 MEDIUM（UX・信頼性向上）

- [x] **エージェント配布パッケージ（ZIP）の完成 & 配信**
  - `bundle-agent.mjs` による ZIP 生成、`public/` への自動配置を実装
  - Client Portal に「Tools & Downloads」タブを新設し、ダウンロード導線を確立
- [x] **VSCodeプラグイン (`plugin/vscode-gigacompute/`) の疎通確認**
  - セルフサイン証明書下での通信エラーを修正し、APIキーによるタスク投入を確認
  - `vsce package` による `.vsix` 生成と配布環境を構築
- [x] **Admin ダッシュボードの拡張（システム管理機能）**
  - BigQuery 連携管理スイッチ、環境変数ビューア、ヘルスチェック (`/health`) の実装

### 🟢 LOW（本番化・ビジネス）

- [ ] **Stripe 本番キーへの切り替え**
  - 環境変数 `STRIPE_SECRET_KEY` を本番キー（`sk_live_...`）に差し替え
  - Webhook エンドポイントの本番URL設定

- [ ] **LP（ランディングページ）のコンテンツ完成**
  - `demander/frontend/index.html` のヒーロー画像差し替え・コピー最終調整
  - フッターのWhitepaper・GitHubリンクを有効にする

- [ ] **mTLS証明書の有効期限管理**
  - `scripts/gen-certs.mjs` で生成した証明書は有効期限1年
  - 期限切れ検知・更新フローの構築

---

## 2026-03-01 — Firebase 統合（Admin SDK・Firestore・App Check 認証）

**会話ID**: 記録なし（コードベースから逆引き補完）

### 追加
- **`server/src/middleware/adminAuth.ts`** [NEW] — Firebase ID Token + App Check 認証ミドルウェア
  - `Authorization: Bearer <Firebase ID Token>` を `admin.auth().verifyIdToken()` で検証
  - `x-firebase-appcheck` ヘッダーを `admin.appCheck().verifyToken()` で検証（本番環境で強制）
  - `SKIP_ADMIN_AUTH=true` 環境変数でローカル開発時のバイパスに対応
- **`server/src/utils/firestore.ts`** [NEW] — Firestoreリアルタイム同期サービス
  - `firestoreService.updateNode()` / `removeNode()`：ノード接続・切断をFirestoreの `nodes` コレクションへ反映
  - `firestoreService.updateTask()` / `removeTask()`：タスクライフサイクルを `activeTasks` コレクションへ反映
  - `FieldValue.serverTimestamp()` でサーバー側タイムスタンプを付与
- **Firebase Admin SDK 初期化** (`server/src/index.ts`)
  - 起動時に `server/serviceAccountKey.json` の存在を確認し、あれば `credential.cert()` で初期化
  - 未存在の場合は `admin.initializeApp()` のデフォルト認証（Cloud Run / GCE メタデータサーバー） にフォールバック
  - `import * as admin from 'firebase-admin'` をサーバー先頭で早期初期化（`!admin.apps.length` チェックで二重初期化を防止）
- **管理者ルーター認証の移行**
  - 旧: `X-Admin-Token` ヘッダーによるシークレットトークン認証（`ADMIN_TOKEN` 環境変数）
  - 新: `adminRouter.use(firebaseAdminAuth)` — Firebase ID Token + App Check の多重認証方式に完全移行
  - 後方互換のため変数 `ADMIN_TOKEN = "LEGACY_PHASED_OUT"` は残置（参照のみ、認証には不使用）
- **Firebase Hosting / Functions 設定** [NEW]
  - `firebase.json`：`server/public` を Firebase Hosting の公開ディレクトリに設定、`/admin/**` への SPAリライトと `/api/**` の Cloud Functions ルーティングを定義
  - `.firebaserc`：プロジェクト `gigacompute-alpha` をデフォルトターゲットとして設定

---

## 2026-03-01 — GCP スケール準備 & 開発者ツール配布基盤 完了

### 🚀 追加・修正
- **エージェント UX の高度化（リソース制御 & 収益可視化）**:
  - **リソース割当スライダー**: CPU コア数、メモリ容量を指定可能にし、論理的な推奨値と現状の「スペック差分」をリアルタイム表示。
  - **収益予測シミュレーター**: 数学的収益モデルに基づき、割当リソース量から月間予想収益を算出・表示。
  - **タスク実行リソースの記録**: 完了したタスクが「どの程度のリソース（CPU/Mem）で実行されたか」を履歴に永続化し、GUI に詳細表示。
- **管理画面 (Admin Panel) のメンテナンス機能強化**:
  - **証明書管理**: `ca.crt`, `server.crt`, `client.crt` の有効期限・残日数を監視し、期限切れ前の警告とワンクリック更新機能を実装。
  - **データベース管理**: 管理画面から `db.json` のバックアップ（ダウンロード）を可能に。
  - **配布資産メタデータ**: `agent.zip` や VSCode 拡張のサイズ・最終更新日を管理画面で一元把握。
- **TypeScript ビルドエラーの解消**: `@types/ws`, `@types/cors` 関連の型定義不一致を `require` への一時切り替えと型注釈の追加により解決。

### 🚀 追加・修正
- **コンテナ化 (Docker)**:
  - マルチステージビルドを採用した `Dockerfile` と、開発・DB 用の `docker-compose.yml` を作成。
  - PostgreSQL 連携および Prisma の `postgresql` DataSource への切り替えを完了。
- **BigQuery 連携 & 構造化ロギング**:
  - `pino` による JSON ロギングを導入。タスク完了や残高変動などの重要イベントを構造化。
  - 管理者画面から BigQuery 連携を制御できる Settings API と UI を実装。
- **エージェント配布パッケージング**:
  - `scripts/bundle-agent.mjs` により、Windows/Mac(CLI)/Linux 用の ZIP パッケージ自動生成を実装。
  - 生成された ZIP を `server/public/` に自動配置し、Client Portal からの配布を実現。
- **VSCode 拡張機能連携**:
  - API キーによる認証ミドルウェア (`clientAuthMiddleware`) を実装。
  - HTTPS（自己署名証明書）回避ロジックをプラグインに追加し、タスク投入の疎通を確認。
  - `vsce package` による `.vsix` 配布用ファイルの生成。
- **Client Portal 改善**:
  - 「Tools & Downloads」タブを新設。バイナリ（ZIP/VSIX）のダウンロード導線を構築。
- **DB 修正**:
  - `db.ts` のモック DB において、API キーの一部一致検索バグを修正。

---

## 2026-03-01 — システム統合完了: フル機能ダッシュボード & Mac対応

**会話ID**: `562149a2-2cfc-4090-8240-f4b48c6f81c3`

### 🚀 追加・修正
- **フル機能ダッシュボード (`dashboard.html`)**:
  - Worker/Client 両対応のタブ UI を実装。
  - クライアント側機能として、ジョブ履歴の動的リスト、API キー管理（生成・削除・一覧）を完全マウント。
  - OS 別（Windows/Mac）のエージェントダウンロードリンクを有効化。
- **エージェントの macOS 互換性向上**:
  - macOS でのバックグラウンド実行（Stealth モード相当）を `detached spawn` により実現。
  - デスクトップに `.command` スクリプトを自動生成し、ブラウザを "--app" モードで起動するショートカット機能を実装。
  - `--debug` フラグ使用時の引数解析バグを修正。
- **インフラ & ルーティング**:
  - `server/src/index.ts` にて `demander/frontend` をルート (`/`) での静的配信に設定。
  - `/v1/worker/task/fetch`, `/v1/worker/task/result` 等の Worker 用 API を有効化。
  - `/poc/init-data` によるデモデータ同期を完了。
- **記録の補完 (Invisible Core)**:
  - `MarketEngine` や `WasmRuntime` に秘められていた高度な機能を CHANGELOG に明文化（以下のセクションに詳述）。

---

## 🛰️ GigaCompute Advanced Core Features (Invisible Core / 記録補完)

コードベースに実装済みであるが、これまで詳細な記録が不足していた「隠れた中核機能」を以下の通り公式にドキュメント化します。

### 🛡️ セキュリティ & 隔離
- **Stealth Mode (Windows)**: `pkg` ビルド時にコンソールを隠し、`GIGA_HIDDEN` 環境変数を用いてバックグラウンドで自己再起動する潜伏機能を実装。
- **Hard-Kill Watchdog**: Wasm 実行時間を worker_threads で監視し、5秒（TIMEOUT_MS）を超過した場合は物理的にプロセスを KILL する暴走防止機構。
- **Local Auditor**: Wasm バイナリをロード直後にスキャンし、`socket`, `fetch`, `process` 等の危険な命令セットが含まれていないか予備検問する機能を実装。
- **Signed Heartbeat**: Ed25519 署名付きのステータス更新を30秒ごとに送信。サーバー側でのなりすまし判定を数学的に担保。

### 🔄 分散処理 & 委譲
- **Recursive Delegation (孫請け)**: タスクの `complexityScore` が 0.3 を超える場合、エージェントが自律的にサブタスクを切り出し、再度ネットワークへ発注する再帰構造を実装。
- **Cascading Delegation (スマホ委譲)**: メインPCからさらに下位のノード（スマートフォン等の軽量デバイス）へ、`subcontractor.ts` を通じて処理を委譲する階層型供給モデル。
- **Distributed Task Polling (Chunk Pool)**: WebSocket 断絶時や並列処理効率化のため、HTTP経由でタスクのチャンクを自律取得するポーリングループを実装。

### 💰 経済 & ROI
- **Autonomous Market Engine**: 外部案件（Akash/Render等）を収集し、「地産地消プレミアム (1.5x)」「国産主権/機密計算プレミアム (2.2x)」を動的に付与して日本国内ノードへ優先配分する最適化アルゴリズム。
- **ROI Cost Estimation Engine**: 性能スコアに基づき、消費電力（W）から電気代（円）およびミリ秒単位の推論コスト（USD/PTS）を動的に算出する経済性計算エンジンを内蔵。
- **Wasm Economy Integration**: Wasm 実行中に発生したサードパーティ API コストを `wallet.ts` に記録し、タスクのデポジットから即時相殺するリアルタイム課金ロジック。


### 🎨 ユーザー体験
- **Edge App Mode GUI**: 初回起動時に Microsoft Edge の `--app` モードを用いて、ブラウザのアドレスバーがない「ネイティブアプリ風」のコックピットを自動起動。
- **Desktop Shortcut Auto-creation**: Windows デスクトップに `GigaComputeCockpit.lnk` を自動生成し、ブラウザを介さない直接アクセスを支援。

---



## 2026-02-28 — Phase 29 完了: セキュリティ最終検証 & stagingManager バグ修正

**会話ID**: `562149a2-2cfc-4090-8240-f4b48c6f81c3`

### 検証
- **Phase 29: Security Final Verification** — 前会話 task.md で唯一残っていた未完了タスクを解決
- **攻撃テスト3種のポート修正**: `exploit_dos.ts`, `exploit_signature.ts`, `exploit_traversal.ts`
  - 旧 `wss://localhost:8080` → 現行 `wss://localhost:8081` に修正
- **`verify_security_hardening_v2.ts` 実行結果**:
  ```
  ✅ SECURITY SUCCESS: Blocked malicious taskId with error:
     "Invalid taskId (Security Violation): \"../staging-secret\" escapes staging boundary"
  ✅ VERIFIED: No leak file created.
  ```

### 修正
- **`provider/backend/stagingManager.ts` — Path Traversal 防御バグ**
  - ❌ 旧: `path.normalize(taskId).replace(/^(\.\.(\/|\\|$))+/, '')` でサニタイズ
    → `../staging-secret` が `staging-secret` になりエラーを投げず通過してしまっていた
  - ✅ 新: 正規化後の絶対パスが `stagingDir` 外を指していれば即 `throw new Error()` する方式に変更
  - この修正により `test.md` の `[ ] Security Final Verification` が **完了** となった

---

## 2026-02-28 — 管理者ダッシュボード新規実装・起動バグ記録


**会話ID**: `562149a2-2cfc-4090-8240-f4b48c6f81c3`

### 追加
- **`server/public/admin/`** [NEW] 管理者ダッシュボード（3ファイル構成）
  - `index.html`：認証オーバーレイ＋5ビュー（Overview・ノード管理・タスク・ユーザー・取引履歴）
  - `style.css`：サイバーパンク系ダークUI（CSS変数・グリッド・glow アニメーション）
  - `app.js`：10秒ポーリング・全ビュー自動更新・ノードkick操作
- **`server/src/index.ts` — adminRouter 実装**
  - `GET  /admin/api/stats`：接続ノード数・キュー状態・uptime
  - `GET  /admin/api/nodes`：全ノード一覧（TrustScore・WS状態付き）
  - `GET  /admin/api/users`：全ユーザー（PTS残高）
  - `GET  /admin/api/jobs`：全クライアントジョブ
  - `GET  /admin/api/transactions`：PTS取引履歴（最新100件）
  - `GET  /admin/api/active-tasks`：アクティブタスク状態
  - `POST /admin/api/kick/:nodeId`：ノード強制切断
  - 認証: `X-Admin-Token` or `?admin_token=`（env: `ADMIN_TOKEN`, デフォルト `giga_admin_secret`）

### 修正
- **`server/src/index.ts` — adminの静的ファイルパスバグ**
  - ❌ 誤: `path.join(__dirname, '../../public/admin')` → ルート配下の存在しないパスを参照
  - ✅ 正: `path.join(__dirname, '../public/admin')` → `server/src` から1段上が正しい
  - **原因**: `__dirname = server/src/`。`../` → `server/`。`../../` → プロジェクトルート（NG）

---

## ⚠️ サーバー起動の詰まりポイント集（随時更新）

### 1. 静的ファイルが404 / adminが開けない
- **原因**: `express.static()` のパスが `../../` になっている（`../` が正しい）
- **確認**: `__dirname` = `server/src/` → `../public/admin` = `server/public/admin` ✅
- **対処**: パスを `path.join(__dirname, '../public/admin')` に修正して再起動

### 2. mTLS証明書が見つからない
- **症状**: `ENOENT: .../certs/server.key`
- **対処**: `node scripts/gen-certs.mjs`（初回のみ。`certs/` が空の場合）

### 3. ブラウザで `ERR_CERT_AUTHORITY_INVALID`
- **症状**: `https://localhost:8081` でSSL警告が出て止まる（自己署名証明書のため）
- **対処**: Chrome/Edgeで「詳細設定」→「localhost:8081にアクセスする（安全でない）」をクリック

### 4. `ts-node` が認識されない
- **対処**: `cd server && npm install`

### 5. `localhost` 接続拒否（IPv6問題）
- **症状**: `ECONNREFUSED` が発生
- **原因**: Windowsで`localhost` → `::1`（IPv6）に解決されるが、サーバーはIPv4待ち
- **対処**: `127.0.0.1` を明示するか、ローカルIPアドレスを使う

### 6. `git` がPowerShellで認識されない
- **対処**: VS Codeターミナル or Git Bash から実行

### 起動手順（正常系）
```powershell
# 初回のみ証明書生成
node C:\agent\gigacompute\scripts\gen-certs.mjs

# サーバー起動
cd C:\agent\gigacompute\server
npx ts-node src/index.ts

# ブラウザ（SSL警告を一度許可すれば次回から不要）
# https://localhost:8081/admin/           ← 管理者（Token: giga_admin_secret）
# https://localhost:8081/client-portal/   ← クライアント
# https://localhost:8081/worker-portal/   ← ワーカー
# https://192.168.1.13:8081/admin/       ← LAN経由（代替）
```

---

（現時点）

```
gigacompute/
├── server/src/
│   ├── index.ts        # メインサーバー: Express + WSS + mTLS (637行)
│   ├── db.ts           # GigaDB: Prisma互換 JSON永続化エンジン (251行)
│   ├── auth.ts         # JWT認証・bcryptパスワードハッシュ
│   ├── taskQueue.ts    # タスクキュー管理
│   └── marketEngine.ts # マーケット価格エンジン
├── server/public/
│   ├── client-portal/  # クライアント向けポータルUI
│   └── worker-portal/  # ワーカー向けポータルUI
├── agent/              # エージェント本体（ローカル稼働・GUI付き）
├── shared/src/         # 共通型定義・暗号化ユーティリティ（Ed25519）
├── plugin/             # VSCode等プラグイン連携
├── demander/           # タスク発注者UI
├── provider/           # プロバイダー設定
├── scripts/            # ユーティリティスクリプト
├── certs/              # mTLS証明書（CA, server, client）
└── system_overview.md  # 非エンジニア向け解説書
```

### 主要APIエンドポイント

| メソッド | パス | 認証 | 説明 |
|:---|:---|:---|:---|
| POST | `/auth/register` | なし | ユーザー登録 |
| POST | `/auth/login` | なし | ログイン・JWT発行 |
| GET  | `/v1/client/dashboard` | JWT | ポイント残高・ジョブ統計 |
| GET  | `/v1/client/apikeys` | JWT | APIキー一覧 |
| POST | `/v1/client/apikeys` | JWT | APIキー新規発行 |
| PUT  | `/v1/client/apikeys/:key` | JWT | APIキー名前変更 |
| DELETE | `/v1/client/apikeys/:key` | JWT | APIキー削除 |
| POST | `/v1/client/payments/checkout` | JWT | Stripe決済セッション作成 |
| POST | `/v1/client/payments/verify` | JWT | 決済完了・PTS付与 |
| POST | `/v1/client/task/submit` | JWT | タスク投入（PTS消費） |
| POST | `/v1/worker/task/fetch` | JWT | タスク払い出し |
| POST | `/v1/worker/task/result` | JWT | タスク結果送信・PTS獲得 |
| POST | `/v1/dev/payment/checkout` | JWT | 開発者用決済 |
| POST | `/v1/dev/task/submit` | JWT | 開発者用タスク投入 |

---

## [未リリース] — 開発中

### 追加予定
- LP（ランディングページ）の設計・実装
- Stripe本番キーへの切り替えと決済フロー本番対応
- エージェント配布パッケージ（ZIPまたはpkg）の安定化

---

## 2026-02-28 — Web管理画面 Feature Parity・ROIダッシュボード・VSCode拡張機能

**会話ID**: `6f8f9e5d-dd18-401e-8abd-6696f6321560`

### 追加
- **Webポータル: 報酬引き出し申請（Withdrawal）**
  - ダッシュボードの生涯収益欄に「出金申請」ボタンを追加
  - 指定額と送金先ウォレットを入力してモーダルUIから `POST /v1/worker/dashboard/withdraw` を送信
- **Webポータル: 新規ノード用ペアリングトークン発行**
  - ノード一覧ヘッダーに「➕ 新規ノード用トークン発行」ボタンを新設
  - クリックで自身のGigaIDに紐づいたJWTペアリングトークンを即時生成・クリップボードコピー
- **AIプラットフォーム APIキーの集中管理**
  - Prismaスキーマに `User.openAiKey` フィールドを追加（Prisma v5 固定で互換性問題を解決）
  - Webポータルのプロフィール設定画面に AI API Key 設定UI を新設
  - ローカルApp（ワーカー・コクピット）のヘッダーに「⚙️ 設定」メニューを追加
  - ローカルAppからの AI API Key 登録 → 認証済みJWTで中央サーバーDBへ即時同期
- **投資型ROIダッシュボード（ローカルApp）**
  - `agent/src/index.ts`：電気代（消費電力 × 単価）・外部API推論コスト・純利益・秒間利益率・月間予測値の計算ロジックを実装
  - `agent/src/guiServer.ts`：`init` / `update` ペイロードにROIデータを追加
  - `server/public/worker/index.html`：コスト・純利益・稼働時間・月間予測のUIパーツを追加
  - `ui.js` / `ticker.js`：ROIデータをリアルタイム反映するレンダリングロジックを実装
- **VSCode拡張機能 (`plugin/vscode-gigacompute/`)** — 主要実装完了
  - `extension.ts`：GigaCompute API Keyの保存（`vscode.SecretStorage`）と呼び出し機能
  - エディタ上の選択コードを `/v1/client/task/submit` へ送信するコマンド `gigacompute.submitSelection` を実装
  - `utils/chunker.ts`：選択範囲を最大2,000文字のチャンクに分割して並列投入するロジックを実装
  - `axios` + `rejectUnauthorized: false` でHTTPS（自己署名証明書）通信を確立
  - 進捗通知（`vscode.ProgressLocation.Notification`）と出力チャンネルへのジョブIDログ出力を実装

### 変更
- `server/src/db.ts`：`clientApiKey.update()` / `clientApiKey.delete()` メソッドを追加（Rename・Delete APIの裏側で使用）

---

## 2026-02-28 — Phase 37/38: APIキー複雑化・管理機能 & Stripe統合（クライアントポータル強化）

**会話ID**: `6f8f9e5d-dd18-401e-8abd-6696f6321560`

### 追加
- **APIキー生成の強化** (`server/src/index.ts` `POST /v1/client/apikeys`)
  - プレフィックス `gcp_live_` + `crypto.randomBytes(32).toString('base64url')` による高エントロピーキー生成
  - 旧来の短いキー形式から安全な43文字超のフォーマットへ刷新
- **APIキー名前変更** `PUT /v1/client/apikeys/:key`
  - ユーザーごとのキー管理UXを向上
- **APIキー削除** `DELETE /v1/client/apikeys/:key`
  - GigaDB の `clientApiKey.delete()` を呼び出しハードデリート
- **Stripe決済統合** (`server/src/index.ts`)
  - `POST /v1/client/payments/checkout`：Stripe Checkout セッション作成（JPY建て、1PTS = 1円）
  - `POST /v1/client/payments/verify`：決済完了後のPTS付与（`stripeSessionId`による2重付与防止）
  - `STRIPE_SECRET_KEY` 未設定時→モックURLを返すフォールバック実装
  - `PointTransaction` テーブルへ `DEPOSIT` レコードを記録
- **クライアントポータルUI更新**
  - ポイント購入ボタン・残高表示・APIキー管理UI (`server/public/client-portal/style.css`)

### 変更
- `server/src/index.ts`：`import Stripe from 'stripe'` 追加、Stripe初期化をトップレベルで実行
- `server/src/db.ts`：`clientApiKey.update()` / `clientApiKey.delete()` メソッド追加

---

## 2026-02-28 — LP構成の調査・検討

**会話ID**: `37da1940-056a-4983-a947-d1de7ee5edec`

### 調査・分析
- プロジェクト全体構成（agent/server/shared/plugin/demander/provider）をレビュー
- LPに盛り込むべき要素の整理：分散コンピューティングの概念説明・エージェント参加メリット・セキュリティモデルの可視化・参加フロー

---

## 2026-02-25 — Phase 34/35: 日本語化・ZIPパッケージ・オンボーディングウィザード & pkgバグ修正

**会話ID**: `4b12de32-06b8-47af-ab5f-1e7488e20fd3`

### 追加
- **UI完全日本語化**
  - Worker Cockpit（エージェント制御パネル）と開発者ポータルの全表示を日本語化
  - 専門用語を平易な表現に置き換え、一般ユーザー向けUXを確立
- **堅牢なZIP配布パッケージ**
  - 単一バイナリ（pkg）で発生していた依存関係未解決エラーの根本対策
  - フロントエンドアセット・依存ライブラリを物理同梱したZIP形式を採用
  - Windows向け実行ファイル名を `START_GIGACOMPUTE.exe` に改名
  - ダウンロードボタンのアニメーション＋トースト通知でパッケージ生成中の待機UXを改善
- **高度なオンボーディングウィザード** (`agent/src/guiServer.ts` 等)
  - 利用規約・免責事項の合意フロー（同意なし進行不可）
  - 環境自動チェック（CPU/GPU・ネットワーク遅延の可視化）
  - GigaIDポータルとのID紐付けをウィザード内で完結
  - アドレスバーなしの専用アプリウィンドウ（ショートカット作成機能）

### 修正
- **`guiServer.ts` アセットパス解決バグ**
  - `pkg` バンドル環境で `__dirname` が正しく解決されず「File Not Found」になる問題を修正
  - `process.pkg` の有無を条件分岐として使用し、実行時パスを動的に決定
- **E2E通信の最終デバッグ**
  - サーバーが `task_response` を依頼元（Requester）へ転送しないバグを修正
  - `localhost` が IPv6 (`::1`) に解決され接続拒否される問題を `127.0.0.1` 統一で解決
  - テストスクリプトのタイムアウト延長（30秒）・依存関係モック化
# Changelog

## [1.2.1] - 2026-03-02
### Added
- **macOS .app Bundle Support**: `.command` 形式からアイコン付きの `.app` 形式へアップグレード。
- **True Real-time 24H Task Count**: サーバーから演出なしの純粋な実行実数を取得。

### Changed
- **Hardware Spec Precision**: RAM/CPU の取得計算を `Math.round` に変更し実機数値を反映。
- **100% Pure Real-time Metrics**: LP上の統計データからデモ用のベース数値や乱数演出を完全に撤廃。
- **Windows Start Normalization**: 不安定だった Windows 版のバックグラウンド起動（ターミナル非表示）を廃止し、安定性のためにターミナルを表示する従来の方式に復帰。

### Fixed
- **UI Fallback Logic**: 設定画面でデフォルト値が実機スペックを上書きして表示される不具合を修正。
- **LP Stats Key Mismatch**: サーバーとLP間のキー名 (`activeNodes` 等) の不一致を解消。

## [1.2.0] - 2026-03-02
### Added
- **Brand Identity**: Rebranded from "GigaCompute" to "ZEN KEN".
- **Hardware Specs**: Real-time detection of CPU cores and RAM for recommended settings.
- **Onboarding**: Improved pairing wizard with status visualization and new user registration links.
- **Admin Update Flow**: Server-side version management (upload/approve/publish) and agent-side auto-check notification.
- **Desktop Excellence**: 
    - Standalone "App Mode" support for Windows (Edge) and Mac (Chrome).
    - Automatic desktop shortcut creation ("ZEN KEN Agent").
    - Background execution (Hidden Terminal) via VBScript to provide a seamless desktop experience.
    - Scrollable settings modal to prevent UI overflow on smaller screens.
    - **Robust Error Handling**: Added explicit checks for port 3001 conflicts (EADDRINUSE) with user-friendly guidance instead of a crash.

### 検証結果
```
✅ Phase 20 Verification Success: Received simulation result from test worker!
```
依頼 → サーバー → エージェント → 処理&署名 → サーバー → 依頼元 のコアサイクルをE2Eで実証

---

## 2026-02-24 — Phase 20: Decompression Chamber（減圧室）実装・検証

**会話ID**: `68bdbde6-afcd-4460-b3ca-a4ffb4e7a515`

### 追加
- **ホスト関数 `host_commit_file`** (`agent/src/wasmWorker.ts`)
  - Wasm隔離環境内からホスト側へファイルを「提出」するためのWasm-Hostブリッジ
- **`StagingManager`** (`agent/src/index.ts` 統合)
  - 実行直後に `.gigacompute/staging/<taskId>/` へファイルを自動展開
  - 自身が処理したWasm成果物も同様にStaging処理するよう強化
- **GUIの「DECOMPRESSION CHAMBER」セクション**
  - Staging中のタスクとパスを一覧表示
  - 「VERIFY & MERGE」ボタンで1クリックでホストルートへ安全に物理移動（マージ）

### 修正
- `wasmWorker.ts`：WASI型エラーを修正し、ファイル提出ブリッジを統合
- `wasmRuntime.ts`：実行結果に加えて生成ファイルリストを返すよう拡張

### 技術的概念
- **Decompression Chamber**：生成されたファイルを直接本番へマージせず、隔離領域で人間が最終検証できる「防波堤」アーキテクチャ（Human-in-the-Loop）

---

## 2026-02-23 — Phase 33: タスクフロー可視化（GigaTimeline / 光るタイムライン）

**会話ID**: `4ae5cca0-211f-412f-9a43-c399511436c7`

### 追加
- **`TaskStep` 型定義** (`shared/src/index.ts`)
  - `submitted` | `auctioned` | `assigned` | `processing` | `staged` | `verified` | `accepted` の7段階
- **`ActiveTaskState` 型** (`server/src/index.ts`)
  - `{ taskId, requesterId, step, lastUpdate, details }` でタスクライフサイクルをサーバーに常駐管理
- **`updateTaskStep()` 関数** (`server/src/index.ts`)
  - 各ステップ変化時に `broadcastSystemState()` を発火してエージェントに同期
- **GigaTimeline UI**（エージェント制御パネル）
  - タスク投入〜受領の全ステップをリアルタイム可視化
  - 現在ステップが発光アニメーション（グロウエフェクト）で強調
  - 各ステップにAuction/Wasm/Bridgeの実行証跡を表示

### 変更
- `server/src/index.ts`：`activeTasks: Map<string, ActiveTaskState>` の管理ロジック強化

---

## 2026-02-22以前 — Phase 1〜32: PoCコアアーキテクチャ群

以下はGigaComputeのPoC全体の積み上げフェーズ記録です（古い順）。

---

### Phase 1〜16 — インフラ基盤と3層防御（コアアーキテクチャ確立）

**内容**：プロジェクトの根幹となるゼロトラスト通信基盤を確立

- **プレミアムUI刷新**（Cybernetic Sovereign）：サイバーパンク系ダークUIのデザインシステム構築
- **mTLS（相互TLS認証）**：CA・サーバー・クライアント証明書によるWebSocket通信保護（`certs/` 以下）
- **E2EE（エンドツーエンド暗号化）**：AES-GCMによる知的財産の完全秘匿
- **Wasm Sandbox（WASI Prison）**：ホストOSから隔離されたWebAssembly実行環境の構築
- **Proof of Truth & 報酬システム**：タスク完了検証と自動報酬付与の基本ロジック
- **不正エージェントの自動排除（Slashing）**：不正・不一致時に信頼スコアを削除、閾値以下で自動BAN

**主要ファイル**: `certs/`, `shared/src/encryption.ts`, `agent/src/wasmWorker.ts`

---

### Phase 17 — Node Trust Protocol & Reputation Layer

- **Node Trust Validator**：KYC相当の署名検証によりAPIレスポンスの正規性を保証
- **Reputation Algorithm**：成功報酬（+スコア）とSlashing（−30/回）を連動させた自動自浄ロジック
  - 信頼スコア閾値40未満 → 秘密情報の配布対象から自動除外
- **Functional Consensus**：AST/Hash値/テスト合格など「意味の合意」に基づくBFT多数決
- **3台構成の実機検証**：3エージェント間の多数決アルゴリズムを実機でパス確認

---

### Phase 18 — API Pass-through & Secret Vault

- **秘匿キーのWasm直送**：依頼者（Requester）のAPIキーをエージェントのメインプロセスに渡さず、WASIの環境変数またはメモリバッファへ直接注入
- **サンドボックス内完結**：推論ロジックをWasm内で完結させ、APIキー自体をホストOSやWorker IDに露出させない

---

### Phase 21 — Economic Optimization（GigaWallet / 家計簿機能）

- **Income（収入）**：タスク完了による報酬の自動計上（`wallet.json`）
- **Expense（支出）**：Wasm内からのAPI推論に伴うコストの動的減算
- **Local Control Panel**：ワーカーが自身のPCで収支をリアルタイム監視可能なダッシュボード

---

### Phase 22 — Delegated Reasoning 初期実装（Wasm Bridge 基盤）

- Wasm内での推論委譲のためのホスト関数 `ask_worker_llm` を定義
- Wasm/Host間のメッセージングプロトコルを設計

---

### Phase 23 — Autonomous Bridge（自律連携）

- **Real LLM Integration**：Wasmからワーカー側のOpenAI/Claude等APIを実際に呼び出し
- **Sync-Bridge Protocol**：Wasm-Host間の推論リクエスト同期・非同期ブリッジの確立
- **Secure Key Access**：ワーカー側APIキーを安全に管理して推論に使用
- **`agent/src/wasmWorker.ts`**：`ask_worker_llm` ホスト関数実装、プロンプト読み取り→推論→結果書き戻し
- **`agent/src/llmClient.ts`** [NEW]：各種AIプロバイダー（OpenAI/Anthropic等）への統一インターフェース

---

### Phase 24 — Dynamic Bidding & Economic Intelligence（動的入札）

- **Bidding Engine**：価格・速度・信頼度（TrustScore）を統合した入札価格の自動算出
- **Winner-Takes-All Scoring**：サーバー側での「総合価値スコア」による落札者判定
- **`marketEngine.ts`**：リアルタイムマーケット価格変動ロジックの実装

---

### Phase 25 — Trust Evolution Protocol（信頼スコアの進化）

- **Logarithmic Hardening**：高スコア帯ほど成長を困難にする対数モデル（荒稼ぎ防止）
- **Liveness Factor**：連続稼働時間に応じたスコア成長ブーストの実装
- **Mentor Status**：スコア95以上のノードへの配当（後進育成枠）

---

### Phase 26 — PoC最終統合実証（E2E Zero-Trust シナリオ）

- **フルフロー完遂**：依頼（Secrets含む）→落札（Auction）→秘匿実行（Wasm+Bridge）→検問（Staging）の全工程をエンドツーエンドで実証
- **Grand Finale Demo**：Requester / Server / Worker の3役が協調動作するPoC最終成果の証明

---

### Phase 27 — 緊急セキュリティパッチ

- **Path Sanitization**：StagingManagerでのディレクトリ・トラバーサル攻撃防止
- **Canonical Serialization**（`canonicalStringify`）：署名検証の一貫性確保（`shared/src/index.ts`）
- **Resource Limits**：`MAX_PAYLOAD_SIZE = 10MB` などペイロードサイズ制限の導入（`server/src/index.ts`）
- **Rate Limiting**：`express-rate-limit`（15分/100リクエスト）をサーバーに適用

---

### Phase 28 — 再帰的委譲（孫請けプロトコル）

- **Task Hierarchy**：`parentId`フィールドによるタスクの親子関係管理
- **Recursive Auction**：処理中のエージェントが新規タスクをサブ依頼できる「孫請け」許可
- **Hierarchical Payout**：タスク階層に応じた報酬分配ロジック（親タスク→子タスクへの自動還元）

---

### Phase 29 — Economic Sentinel（経済的番人 / Karma Collector）

- **Risk-Based Pricing**：タスク複雑度に応じたデポジット自動算出ロジック（エージェント側）
- **Karma Collector Trigger**：リソース異常検知時のデポジット即時没収（サーバー側）
  - Wasmタイムアウト・署名不正・リソース暴走などのイベントで発動
  - `server/src/index.ts`：デポジット `= Math.ceil(base * (task.type === 'wasm' ? 1.2 : 1.0))`

---

### Phase 30 — Stripe決済統合（ポイント購入）

- **Stripe Checkout Integration**：サーバー側での支払いセッション作成
- **Webhook Listener**：支払い完了後のポイント自動付与ロジック
- **Promotion Support**：キャンペーンコードやポイント配布機能の基盤
- **Buy Points UI**：エージェント制御パネルへの購入ボタン実装

---

### Phase 31 — Stripe Connect統合（出金 / 実通貨払い出し）

- **Payout Logic**：獲得ポイントをStripe経由で実通貨（JPY）へ送金
- **Onboarding Flow**：ワーカーのStripeアカウント連携プロセス（Mock実装済み）
- **Withdraw UI**：エージェント制御パネルへの `POST /v1/worker/dashboard/withdraw` フロー実装

---

### Phase 32 — ユーザー管理システム（GigaID）

- **JWT Authentication**：`auth.ts` によるログイン・登録・トークン検証
- **GigaDB（JSON永続化）**：Prismaクライアント互換のインメモリ＋ JSONファイルDBの実装（`db.ts` 251行）
  - `users`, `nodes`, `transactions`, `clientApiKeys`, `clientJobs` の5コレクション
- **Ownership Model**：1ユーザーが複数ノードを所有・管理できる仕組み（`ownerId` フィールド）
- **Account Dashboard**：全ノードの合計収益・支払い履歴の統合表示
- **Demo Seed**：起動時に `demo@gigacompute.net` / `password123` のデモアカウントを自動生成

---

### Phase 36 — Client Portal API

- `GET /v1/client/dashboard`：ポイント残高・ジョブ統計・最近のジョブ取得
- `GET/POST /v1/client/apikeys`：APIキー一覧・新規発行
- `POST /v1/client/task/submit`：PTSを消費してタスク投入（5 PTS / タスク）
- `clientJob`, `pointTransaction` テーブルとの連携

---

### Phase 37 — Worker Task Execution Endpoints

- `POST /v1/worker/task/fetch`：ワーカーへのタスク払い出し（`TaskQueue.getNextTask()`）
- `POST /v1/worker/task/result`：結果受信・PTS付与（1チャンク = 1.0 PTS）
- `TaskQueue` (`server/src/taskQueue.ts`) との連携

---

## 記録ルール

このファイルへの記録は以下のフォーマットで追記してください（最新が先頭）：

```markdown
## YYYY-MM-DD — [作業内容の短い説明]

**会話ID**: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`（任意）

### 追加
- ...

### 変更
- ...

### 修正
- `ファイルパス`：...

### 削除
- ...
```
