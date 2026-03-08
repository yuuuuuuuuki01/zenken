import WebSocket from 'ws';

async function runMockAgent() {
    const token = process.argv[2];
    if (!token) {
        console.error('Usage: ts-node mock_agent.ts <TOKEN>');
        process.exit(1);
    }

    const agentId = `mock-agent-${Math.random().toString(36).substring(7)}`;
    const ws = new WebSocket('wss://localhost:8081', {
        rejectUnauthorized: false
    });

    ws.on('open', () => {
        console.log(`[MockAgent] Connected to server as ${agentId}`);
        ws.send(JSON.stringify({
            type: 'register',
            payload: {
                id: agentId,
                type: 'agent',
                token: token,
                publicKey: 'dummy_public_key',
                performanceScore: 95,
                trustScore: 100,
                capabilities: ['image_generation', 'data_analysis']
            }
        }));
    });

    ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        console.log(`[MockAgent] Received message:`, JSON.stringify(message, null, 2));

        if (message.type === 'auction_invite') {
            console.log(`[MockAgent] Auction invite received for task ${message.payload.taskId}. Bidding...`);
            ws.send(JSON.stringify({
                type: 'bid',
                payload: {
                    taskId: message.payload.taskId,
                    bidPrice: 0.1,
                    workerId: agentId
                }
            }));
        }

        if (message.type === 'task_assignment') {
            console.log(`[MockAgent] Task ${message.payload.taskId} assigned! Executing...`);
            setTimeout(() => {
                console.log(`[MockAgent] Task ${message.payload.taskId} completed. Sending result.`);
                ws.send(JSON.stringify({
                    type: 'task_result',
                    payload: {
                        taskId: message.payload.taskId,
                        status: 'success',
                        result: { message: 'Mock execution complete', data: [1, 2, 3] },
                        workerId: agentId
                    }
                }));
            }, 2000);
        }
    });

    ws.on('close', () => {
        console.log('[MockAgent] Connection closed');
    });

    ws.on('error', (err) => {
        console.error('[MockAgent] WS error:', err);
    });
}

runMockAgent();
