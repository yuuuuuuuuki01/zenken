import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';

const certsDir = path.resolve(__dirname, '../../certs');
const agentOptions = {
    ca: fs.readFileSync(path.join(certsDir, 'ca.crt')),
    cert: fs.readFileSync(path.join(certsDir, 'client.crt')),
    key: fs.readFileSync(path.join(certsDir, 'client.key')),
    rejectUnauthorized: false
};

const serverUrl = process.env.SERVER_URL || 'wss://localhost:8081';
const ws = new WebSocket(serverUrl, agentOptions);

ws.on('open', () => {
    console.log('--- Visualization Test Requester started ---');

    // 1. Register
    ws.send(JSON.stringify({
        type: 'register',
        payload: {
            id: 'visualization-requester-' + Math.random().toString(36).substr(2, 5),
            type: 'agent',
            token: 'mock-token'
        }
    }));

    setTimeout(() => {
        // 2. Submit a task using test_staging.wasm to trigger all steps including 'staged'
        const wasmPath = path.join(__dirname, '../test_staging.wasm');
        if (!fs.existsSync(wasmPath)) {
            console.error('Wasm file not found:', wasmPath);
            process.exit(1);
        }

        const task = {
            taskId: 'vis-flow-' + Date.now(),
            type: 'wasm',
            requesterId: 'visualization-requester',
            payload: {
                functionName: 'main',
                wasm: fs.readFileSync(wasmPath).toString('base64'),
                args: []
            },
            complexityScore: 0.5,
            deposit: 50
        };
        console.log(`[Requester] Submitting task ${task.taskId} to trigger full flow visualization.`);
        ws.send(JSON.stringify({ type: 'task_request', payload: task }));

        // [Phase 33] Wait even after submission to let visualization play out
        setTimeout(() => {
            console.log('[Requester] Staying alive for visualization...');
        }, 5000);
    }, 3000);
});

ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'task_response') {
        console.log('\n[Requester] Task Flow Completed Successfully!');
        console.log('Final Result Status:', msg.payload.status);
        setTimeout(() => process.exit(0), 1000);
    }
});

ws.on('error', (err) => console.error('WS Error:', err));
