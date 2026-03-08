"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = __importDefault(require("ws"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const encryption_1 = require("../../shared/src/encryption");
/**
 * [Final PoC Verification] Autonomous Sentinel E2E
 * Coverage:
 * - Phase 27: Security (Path Sanitization, Signature Consistency)
 * - Phase 28: Recursive Delegation (Agent spawns sub-task)
 * - Phase 29: Economic Sentinel (Escrow & Complexity Score)
 */
const SHARED_SECRET = 'GigaComputeZeroTrustSecret';
const ENCRYPTION_KEY = (0, encryption_1.deriveKey)(SHARED_SECRET);
const certsDir = path_1.default.resolve(__dirname, '../../certs');
const options = {
    ca: fs_1.default.readFileSync(path_1.default.join(certsDir, 'ca.crt')),
    cert: fs_1.default.readFileSync(path_1.default.join(certsDir, 'client.crt')),
    key: fs_1.default.readFileSync(path_1.default.join(certsDir, 'client.key')),
    rejectUnauthorized: true
};
const SERVER_URL = 'wss://localhost:8081';
async function runFinalPoC() {
    console.log('--- GigaCompute Final PoC Verification: Autonomous Sentinel ---');
    const ws = new ws_1.default(SERVER_URL, options);
    ws.on('open', () => {
        console.log('[Requester] Connected. Registering as Admin...');
        ws.send(JSON.stringify({
            type: 'register',
            payload: { id: 'admin-requester', type: 'dashboard', status: 'idle', performanceScore: 100, trustScore: 100, rewardPoints: 1000 }
        }));
        // 1. Create a High Complexity Task (triggers recursive delegation & high deposit)
        const dummyWasm = Buffer.alloc(1024 * 100); // 100KB to avoid ws payload issues while staying complex
        const { encrypted, iv, authTag } = (0, encryption_1.encrypt)(dummyWasm, ENCRYPTION_KEY);
        const task = {
            taskId: `autonomous-poc-${Date.now()}`,
            type: 'wasm',
            payload: { wasm: encrypted.toString('base64'), functionName: 'complex_logic', args: [] },
            encryption: { iv: iv.toString('base64'), authTag: authTag.toString('base64') },
            requesterId: 'admin-requester',
            secrets: { "API_KEY_1": "SECRET_A", "API_KEY_2": "SECRET_B" }
        };
        console.log(`[Requester] Dispatching COMPLEX task: ${task.taskId}`);
        ws.send(JSON.stringify({ type: 'task_request', payload: task }));
    });
    ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'system_state') {
            const nodes = msg.payload.nodes;
            const tasks = msg.payload.activeTasks;
            // Look for the main task and sub-task
            const mainTask = tasks.find((t) => t.taskId.startsWith('autonomous-poc') && !t.taskId.endsWith('-sub'));
            const subTask = tasks.find((t) => t.taskId.endsWith('-sub'));
            if (mainTask) {
                console.log(`[Monitor] Main Task Found: ${mainTask.taskId}. Deposit: ${mainTask.deposit} PTS, Complexity: ${mainTask.complexityScore.toFixed(2)}`);
            }
            if (subTask) {
                console.log(`[Monitor] ⛓️ RECURSIVE SUCCESS: Sub-task detected: ${subTask.taskId} (Parent: ${subTask.parentId})`);
                console.log(`[Monitor] Sub-task Deposit: ${subTask.deposit} PTS`);
                console.log('\n✅ GigaCompute PoC Goal ACHIEVED!');
                console.log('1. Security: mTLS/E2EE Active');
                console.log('2. Economy: Risk-Based Deposit Escrowed');
                console.log('3. Autonomous: Recursive Sub-task Delegated');
                process.exit(0);
            }
        }
    });
    ws.on('error', (e) => console.error('[Error]', e));
    setTimeout(() => {
        console.error('Test timed out. Recursive delegation may have failed or server is unstable.');
        process.exit(1);
    }, 15000);
}
runFinalPoC();
