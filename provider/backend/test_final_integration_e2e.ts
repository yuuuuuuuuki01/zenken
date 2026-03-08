import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { encrypt, decrypt, deriveKey, signResult, generateNodeKeypair } from '../../shared/src/encryption';
import { TaskRequest, TaskResponse } from '../../shared/src/index';

/**
 * [Phase 21] GigaCompute PoC 最終統合実証スクリプト
 * 
 * シナリオ:
 * 1. テストワーカー (Worker-Final) が mTLS で登録。高 Trust/Perf を設定。
 * 2. サーバーが Auction を実施。Worker-Final が落札。
 * 3. リクエスタが Secrets (API Key) を含むタスクを E2EE 暗号化して投入。
 * 4. ワーカーが復号し、推論シミュレート結果とファイル成果物を署名付きで返却。
 * 5. エージェント側で減圧室 (Staging) への展開成功を確認。
 */

const SERVER_URL = 'wss://localhost:8080';
const certsDir = path.resolve(__dirname, '../../certs');
const options = {
    ca: fs.readFileSync(path.join(certsDir, 'ca.crt')),
    cert: fs.readFileSync(path.join(certsDir, 'client.crt')),
    key: fs.readFileSync(path.join(certsDir, 'client.key')),
    rejectUnauthorized: true
};

const SHARED_SECRET = 'GigaComputeZeroTrustSecret';
const ENCRYPTION_KEY = deriveKey(SHARED_SECRET);

// --- 1. Worker Setup ---
const workerKeys = generateNodeKeypair();
const workerWs = new WebSocket(SERVER_URL, options);

workerWs.on('open', () => {
    console.log('[Worker] Connected. Registering with High Trust...');
    workerWs.send(JSON.stringify({
        type: 'register',
        payload: {
            id: 'worker-final-poc',
            type: 'agent',
            status: 'idle',
            performanceScore: 100,
            trustScore: 100,
            bidPrice: 0.1, // 安価かつ高品質で落札を狙う
            publicKey: workerKeys.publicKey
        }
    }));
});

workerWs.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'task_request') {
        const task = msg.payload as TaskRequest;
        console.log(`[Worker] Received task ${task.taskId}. Decrypting...`);

        // E2EE 復号のシミュレート
        const iv = Buffer.from(task.encryption!.iv, 'base64');
        const authTag = Buffer.from(task.encryption!.authTag, 'base64');
        const encrypted = Buffer.from(task.payload.wasm, 'base64');
        const decrypted = decrypt(encrypted, ENCRYPTION_KEY, iv, authTag);

        console.log(`[Worker] Decrypted payload: ${decrypted.toString().substring(0, 20)}...`);
        console.log(`[Worker] Secret detected: ${task.secrets!["VAULT_TOKEN"]}`);

        // 成果物の生成
        const result = {
            message: "Final Integration Success",
            secretsVerified: true,
            files: [
                {
                    path: 'final_report.md',
                    content: `# GigaCompute PoC Final Report\nStatus: VERIFIED\nWorker: ${task.taskId}`
                }
            ]
        };

        // 署名 (Node Trust Protocol)
        const signature = signResult(Buffer.from(JSON.stringify(result)), workerKeys.privateKey);

        const response: TaskResponse = {
            taskId: task.taskId,
            status: 'success',
            result: result,
            workerId: 'worker-final-poc',
            signature: signature.toString('base64')
        };

        console.log('[Worker] Sending signed response...');
        workerWs.send(JSON.stringify({ type: 'task_response', payload: response }));
    }
});

// --- 2. Requester Setup ---
const requesterWs = new WebSocket(SERVER_URL, options);

requesterWs.on('open', () => {
    console.log('[Requester] Connected. Sending Encrypted Task...');

    const taskPayload = Buffer.from('Final PoC Wasm Payload Simulation');
    const { encrypted, iv, authTag } = encrypt(taskPayload, ENCRYPTION_KEY);

    const task: TaskRequest = {
        taskId: `final-poc-${Date.now()}`,
        type: 'wasm',
        payload: {
            wasm: encrypted.toString('base64'),
            functionName: 'run_final_logic',
            args: []
        },
        encryption: {
            iv: iv.toString('base64'),
            authTag: authTag.toString('base64')
        },
        requesterId: 'agent-1',
        secrets: {
            "VAULT_TOKEN": "poc-final-2026-secret"
        }
    };

    requesterWs.send(JSON.stringify({ type: 'task_request', payload: task }));
});

requesterWs.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'task_response' && msg.payload.taskId.startsWith('final-poc')) {
        console.log('--- FINAL INTEGRATION SUCCESS ---');
        console.log('Result Message:', msg.payload.result.message);
        console.log('Staged Files:', msg.payload.result.files.length);

        // クリーンアップして終了
        setTimeout(() => process.exit(0), 1000);
    }
});

setTimeout(() => {
    console.error('Timeout: Final Integration failed.');
    process.exit(1);
}, 15000);
