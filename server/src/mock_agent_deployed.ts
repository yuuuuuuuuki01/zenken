import WebSocket from 'ws';

async function runMockAgent() {
    const token = process.argv[2] || 'DEMO_TOKEN_123';

    const agentId = `mock-agent-deployed-${Math.random().toString(36).substring(7)}`;
    const serverUrl = 'wss://api-rlhftuaqaa-uc.a.run.app';

    console.log(`[MockAgent] Connecting to ${serverUrl}...`);
    const ws = new WebSocket(serverUrl);

    ws.on('open', () => {
        console.log(`[MockAgent] Connected to deployed server as ${agentId}`);
        ws.send(JSON.stringify({
            type: 'register',
            payload: {
                id: agentId,
                type: 'agent',
                token: token,
                publicKey: 'dummy_public_key',
                performanceScore: 98,
                trustScore: 100,
                capabilities: ['image_generation', 'data_analysis']
            }
        }));
    });

    ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        // console.log(`[MockAgent] Received:`, message.type);

        if (message.type === 'auction_invite') {
            console.log(`[MockAgent] Auction invite received for task ${message.payload.taskId}. Bidding...`);
            ws.send(JSON.stringify({
                type: 'bid',
                payload: {
                    taskId: message.payload.taskId,
                    bidPrice: 0.05,
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
                        result: { message: 'Deployed Task Execution Success', environment: 'Cloud Run' },
                        workerId: agentId
                    }
                }));
            }, 3000);
        }
    });

    ws.on('close', () => console.log('[MockAgent] Connection closed'));
    ws.on('error', (err) => console.error('[MockAgent] WS error:', err));
}

runMockAgent();
