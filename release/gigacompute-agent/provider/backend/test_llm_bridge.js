"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = __importDefault(require("ws"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const encryption_1 = require("../../shared/src/encryption");
const certsDir = path_1.default.resolve(process.cwd(), '../certs');
const SHARED_SECRET = 'GigaComputeZeroTrustSecret';
const ENCRYPTION_KEY = (0, encryption_1.deriveKey)(SHARED_SECRET);
const options = {
    ca: fs_1.default.readFileSync(path_1.default.join(certsDir, 'ca.crt')),
    cert: fs_1.default.readFileSync(path_1.default.join(certsDir, 'client.crt')),
    key: fs_1.default.readFileSync(path_1.default.join(certsDir, 'client.key')),
    rejectUnauthorized: true
};
const ws = new ws_1.default('wss://localhost:8080', options);
// LLM ブリッジテスト用 Wasm を読込
const llmWasm = fs_1.default.readFileSync(path_1.default.join(__dirname, '../test_llm.wasm'));
ws.on('open', () => {
    console.log('Requester connected to GigaCompute Secure Server.');
    ws.send(JSON.stringify({
        type: 'register',
        payload: { id: 'requester-1', type: 'dashboard', performanceScore: 0, rewardPoints: 0, trustScore: 100 }
    }));
    console.log('Encrypting LLM-Bridge Wasm payload (E2EE)...');
    const { encrypted, iv, authTag } = (0, encryption_1.encrypt)(llmWasm, ENCRYPTION_KEY);
    const task = {
        taskId: `task-llm-bridge-${Date.now()}`,
        type: 'wasm',
        payload: {
            wasm: encrypted.toString('base64'),
            functionName: 'test_llm',
            args: []
        },
        encryption: {
            iv: iv.toString('base64'),
            authTag: authTag.toString('base64')
        },
        requesterId: 'requester-1',
        secrets: {
            "OPENAI_API_KEY": "sk-not-used-for-mock",
            "GC_NODE_VAULT_ID": "bridge-test-vault"
        }
    };
    console.log(`Sending LLM-Bridge task: ${task.taskId}`);
    ws.send(JSON.stringify({ type: 'task_request', payload: task }));
});
ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'task_response' && msg.payload.taskId.startsWith('task-llm-bridge')) {
        console.log('--- Received response for LLM-Bridge task ---');
        console.log('Result:', msg.payload.result);
        console.log('✅ Autonomous Bridge Test Initial Step Success!');
        process.exit(0);
    }
});
ws.on('error', (err) => {
    console.error('WebSocket Error:', err);
});
setTimeout(() => {
    console.error('Test timed out.');
    process.exit(1);
}, 15000);
