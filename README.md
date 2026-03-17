# ZenKen

復旧・再開の入口は以下です。

1. **最初に読む**: [`RUNBOOK.md`](./RUNBOOK.md)
2. 全体像: [`system_overview.md`](./system_overview.md)
3. APIの草案: [`docs/api-docs.md`](./docs/api-docs.md)
4. 変更履歴と詰まりポイント: [`CHANGELOG.md`](./CHANGELOG.md)

## 開発時の基本方針

- 正本コードを編集する（`server/src`, `provider/backend`, `shared/src`, `plugin/src`, `scripts`）
- `release/**` は生成物として扱い、直接編集しない
- 復旧フェーズでは「最小フロー（投入→受信→完了）」を優先
- すぐに復旧確認したい場合は `npm run recovery:smoke` を実行する

