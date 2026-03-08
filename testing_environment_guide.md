# GigaCompute 仮想テスト環境ガイド (PoC版)

知人との実機テストを円滑に進めるための、Dockerベースの仮想環境と外部公開の手順です。

---

## 1. ローカル仮想クラスターの起動 (Docker)

自分のPC内でサーバー1台と複数のエージェントをシミュレートします。

### 手順:
1.  **ビルドと起動**:
    ```bash
    docker-compose up --build -d
    ```
2.  **エージェントの増殖（スケール）**:
    例えば、5台のエージェントを一気に動かしたい場合：
    ```bash
    docker-compose up --scale agent=5 -d
    ```
3.  **ログの確認**:
    ```bash
    docker-compose logs -f
    ```

---

## 2. 知人を招待する（外部公開の手順）

知人が外からあなたのサーバーに接続するためには、ローカルで動いているサーバーをインターネットに公開する必要があります。

### 手法A: Ngrok を使用する (推奨 / 簡易)
1.  [ngrok](https://ngrok.com/) をインストール。
2.  サーバー（ポート 8081）を公開：
    ```bash
    ngrok http https://localhost:8081
    ```
3.  発行された `https://xxxx.ngrok-free.app` を知人に伝えます。

### 手法B: VPS (DigitalOcean / AWS / GCP) にデプロイ
1.  サーバーに Docker をインストール。
2.  このリポジトリを `git clone` し、`docker-compose up` を実行。

---

## 3. テスター（知人）側の操作

知人が自分のPCでエージェントを動かす際、以下の設定が必要です。

1.  **エージェントのダウンロード**: ビルド済みの実行ファイル、またはソースコードを共有。
2.  **接続先指定**:
    `SERVER_URL` をあなたの公開URLに設定して起動。
    ```bash
    set SERVER_URL=wss://xxxx.ngrok-free.app
    npm run dev
    ```
3.  **連携作業**:
    LPダッシュボードで発行した **OTC（ワンタイムコード）** を、エージェント側に入力してもらうことで、安全にデバイスが紐付けられます。

---

## 4. セキュリティ上の注意点

- **mTLS 証明書**: ポータル（サーバー）の `certs/client.crt` と `client.key` をテスターに安全な方法で共有する必要があります。
- **管理者権限**: テスト中は、不審なタスク（Shell等）が実行されないよう、`capabilities` を制限することを推奨します。

> [!TIP]
> まずは自分のPCで `docker-compose --scale agent=3` を実行し、ダッシュボードに3台のノードが正しく表示されるか確認するのが第一歩です！
