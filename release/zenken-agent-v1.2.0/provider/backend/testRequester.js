"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = __importDefault(require("ws"));
const crypto_1 = __importDefault(require("crypto"));
const encryption_1 = require("../../shared/src/encryption");
// Mock the environment variable for standalone testing without dotenv
process.env.DECRYPTION_KEY = crypto_1.default.randomBytes(32).toString('base64');
const ws = new ws_1.default('wss://127.0.0.1:8081', { rejectUnauthorized: false });
ws.on('open', () => {
    console.log('Requester connected to GigaCompute Secure Server...');
    // 1. Authenticate / Register as a Dashboard client
    ws.send(JSON.stringify({
        type: 'register',
        payload: { id: 'admin-requester', type: 'dashboard', performanceScore: 0, rewardPoints: 0, trustScore: 100 }
    }));
    // [Wait for agent to register BEFORE sending task]
    setTimeout(async () => {
        try {
            console.log('Preparing to send simulated task...');
            const wasmCode = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
            // Generate dummy encryption key
            const dummyKey = crypto_1.default.randomBytes(32);
            // [Phase 26] Encrypt Wasm
            const { encrypted, iv, authTag } = (0, encryption_1.encrypt)(Buffer.from(wasmCode), dummyKey);
            const task = {
                taskId: `task-e2ee-${Date.now()}`,
                type: 'simulation',
                payload: {
                    wasm: encrypted.toString('base64'),
                    functionName: 'add',
                    args: [15, 25]
                },
                encryption: {
                    iv: iv.toString('base64'),
                    authTag: authTag.toString('base64')
                },
                requesterId: 'admin-requester',
                secrets: {
                    "OPENAI_API_KEY": "sk-dummy-key-for-isolated-inference",
                    "GC_NODE_VAULT_ID": "vault-777"
                }
            };
            // [Phase 29] Risk-Based Pricing Engine
            const wasmSizeMB = wasmCode.length / (1024 * 1024);
            const secretsCount = Object.keys(task.secrets || {}).length;
            const complexityScore = 0.2;
            const deposit = 50;
            task.complexityScore = complexityScore;
            task.deposit = deposit;
            console.log(`Sending ENCRYPTED task: ${task.taskId}`);
            console.log(`[EconomicSentinel] Risk Score: ${complexityScore.toFixed(2)}, Deposit Escrowed: ${deposit} PTS`);
            ws.send(JSON.stringify({ type: 'task_request', payload: task }));
            console.log('Task payload sent successfully!');
        }
        catch (error) {
            console.error('FAILED TO PREPARE TASK:', error.stack || error.message);
        }
    }, 5000); // 5 seconds extra wait
});
ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    console.log('--- Received Message ---');
    console.log(JSON.stringify(msg, null, 2));
    if (msg.type === 'task_response' && msg.payload.taskId.startsWith('task-e2ee')) {
        console.log('--- Received response for encrypted task ---');
        console.log('Result:', msg.payload.result);
        if (msg.payload.result && msg.payload.result.startsWith('Result from ')) {
            console.log('✅ Phase 20 Verification Success: Received simulation result from test worker!');
            process.exit(0);
        }
        else {
            console.error('❌ Result mismatch!');
            process.exit(1);
        }
    }
});
ws.on('error', (err) => {
    console.error('WebSocket Error:', err);
});
setTimeout(() => {
    console.error('Test timed out. No response received within 30 seconds.');
    process.exit(1);
}, 30000);
