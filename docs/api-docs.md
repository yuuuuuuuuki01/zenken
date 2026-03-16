# ZEN KEN Developer API Documentation (Draft v0.1)

> 復旧手順・起動順はまず [`RUNBOOK.md`](../RUNBOOK.md) を参照してください。

ZEN KEN ネットワークを外部アプリケーションから利用するための API 仕様書です。

## 1. Authentication
全ての API リクエストは Firebase Authentication の ID Token を必要とします。

```http
Authorization: Bearer <ID_TOKEN>
x-firebase-appcheck: <APP_CHECK_TOKEN>
```

## 2. REST API

### ジョブの投入 (Submit Job)
計算タスク（ジョブ）をネットワークに投入します。

- **URL**: `/v1/client/jobs`
- **Method**: `POST`
- **Payload**:
  ```json
  {
    "type": "llm_inference",
    "input": "...",
    "rewardPerChunk": 1.0
  }
  ```

### ジョブの状態取得 (Get Job Status)
- **URL**: `/v1/client/jobs/:jobId`
- **Method**: `GET`

## 3. WebSocket API

### リアルタイム統計 (Real-time Stats)
ネットワーク全体の計算力やノードの状態を購読します。

- **URL**: `wss://api.zenken.jp/v1/stats`
- **Events**:
  - `system_state`: ネットワーク全体の TFLOPS、ノード数、アクティブタスク数を含む状態更新。
