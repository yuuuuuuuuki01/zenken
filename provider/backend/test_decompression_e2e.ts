import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { signResult, generateNodeKeypair } from '../../shared/src/encryption';

/**
 * [Phase 20] 減圧室（Decompression Chamber）の E2E 実証スクリプト
 * 
 * シナリオ:
 * 1. テストワーカーとしてサーバーに接続
 * 2. サーバーから task_request が来るのを待つ（または手動でトリガー）
 * 3. 成果物（files）を含む task_response を送信
 * 4. リクエスタ側エージェントが Staging 領域に保存し、UI に表示されることを確認する
 */

const SERVER_URL = 'wss://localhost:8080';
const certsDir = path.resolve(__dirname, '../../certs');
const agentOptions = {
    ca: fs.readFileSync(path.join(certsDir, 'ca.crt')),
    cert: fs.readFileSync(path.join(certsDir, 'client.crt')),
    key: fs.readFileSync(path.join(certsDir, 'client.key')),
    rejectUnauthorized: true
};

const ws = new WebSocket(SERVER_URL, agentOptions);

// Node Trust Protocol: キーペアの生成
const nodeKeys = generateNodeKeypair();

ws.on('open', () => {
    console.log('[TestWorker] Connected to server.');
    ws.send(JSON.stringify({
        type: 'register',
        payload: {
            id: 'test-worker-v20',
            type: 'agent',
            status: 'idle',
            capabilities: ['wasm', 'staging-test'],
            performanceScore: 100,
            rewardPoints: 1000,
            trustScore: 10000,
            bidPrice: 0.01,
            publicKey: nodeKeys.publicKey
        }
    }));
});

ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'task_request') {
        const task = msg.payload;
        console.log(`[TestWorker] Received task: ${task.taskId}. Sending response with staged files...`);

        const response = {
            taskId: task.taskId,
            status: 'success',
            workerId: 'test-worker-v20',
            result: {
                message: "Simulation successful",
                files: [
                    {
                        path: 'staged_result.txt',
                        content: `Verified Result for Task ${task.taskId}\nGenerated at: ${new Date().toISOString()}\nStatus: SUCCESS`
                    },
                    {
                        path: 'subdir/test.log',
                        content: 'Log from remote worker.'
                    }
                ]
            }
        };

        // Node Trust Protocol: 署名の追加
        console.log('[TestWorker] Signing result...');
        const signature = signResult(Buffer.from(JSON.stringify(response.result)), nodeKeys.privateKey);

        ws.send(JSON.stringify({
            type: 'task_response',
            payload: {
                ...response,
                signature: signature.toString('base64')
            }
        }));
        console.log('[TestWorker] Response sent.');
    }
});
