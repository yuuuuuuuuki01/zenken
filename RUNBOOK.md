# ZenKen Recovery Runbook

このランブックは「既存資産を参照しながら、安全に復旧して再開する」ための最短手順です。  
新機能追加の前に、まず **Client -> Server -> Agent** の最小フローを一本通すことを目的にします。

## 0. スコープ（正本）

- 編集対象（正本）
  - `server/src/**`
  - `provider/backend/**`
  - `shared/src/**`
  - `plugin/src/**`
  - `scripts/**`
- 原則として参照のみ
  - `release/**`（配布物アーカイブ）

## 1. 復旧のゴール

1. サーバーがローカル起動できる。
2. エージェントがサーバーへ接続できる。
3. タスク投入から受信・完了までログで追跡できる。

## 2. 事前チェック

```bash
node -v
npm -v
```

- サーバーは `node 20` 前提（`server/package.json`）
- `certs/` が無ければ証明書を生成する

```bash
node scripts/gen-certs.mjs
```

## 3. 起動手順（最小）

### 3-1. サーバー

```bash
cd server
npm install
npm run dev
```

- 期待: `8081` でサーバー起動
- 管理UI: `https://localhost:8081/admin/`

### 3-2. エージェント（バックエンド）

別ターミナルで:

```bash
cd provider/backend
npm install
npm run start
```

- 期待: WebSocket接続ログが出る
- `config.json` の `serverUrl` / `httpApiUrl` を確認

## 4. 疎通スモーク

### 4-1. API応答

```bash
curl -k https://localhost:8081/v1/version
```

- 期待: バージョンJSONが返る

### 4-1b. 復旧スモークを自動実行

```bash
npm run recovery:smoke
```

- `https://localhost:8081` に対して `version`・`/health/recovery`・主要UIエンドポイントを一括確認
- 別ホストを使う場合: `node scripts/recovery_smoke_check.mjs --base-url https://<host>:<port>`

### 4-2. タスク投入の最小確認

既存 `scripts/issue_task*.ts` 系を使う場合は、開発環境値（メール/パスワード/API URL）を先に揃える。

最低限、以下が追えることを確認する:

- サーバー側: 受信ログ
- エージェント側: タスク受信ログ
- サーバー側: 完了/失敗イベント

## 5. 変更管理ルール（復旧フェーズ）

1. 1PR = 1目的（例: 接続復旧のみ）
2. `server/src/index.ts` と `provider/backend/index.ts` の同時大改修を避ける
3. 仕様変更は先に `shared/src` の型を更新してから各実装へ反映
4. `release/**` は直接編集しない

## 6. まず着手する順番（推奨）

1. 接続安定化（WS再接続/認証）
2. タスクイベントの統一（投入・ACK・進捗・完了）
3. ブラウザUI / ローカルAPP の二系統を同一プロトコルで処理

## 7. つまずきポイント

- 証明書未生成: `ENOENT ... certs/*`
- 自己署名証明書警告: `https://localhost:8081` で一度許可が必要
- `localhost` のIPv6問題: `127.0.0.1` を明示

---

この手順で最小フローが通ったら、次に「トンネル機能」の仕様を固定する（イベント名とJSONスキーマ）。
