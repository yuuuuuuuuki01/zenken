import WebSocket from 'ws';

const ws = new WebSocket('wss://localhost:8081', {
    rejectUnauthorized: false
});

ws.on('open', () => {
    console.log('Connected to server. Sending test task...');

    const taskRequest = {
        type: 'task_request',
        payload: {
            taskId: `test-task-${Date.now()}`,
            type: 'typescript-compile',
            payload: { file: 'main.ts' },
            requesterId: 'test-user-id',
            isHighLoad: process.argv.includes('--high')
        }
    };

    ws.send(JSON.stringify(taskRequest));

    // サーバーが処理してレスポンスを放送するのを待つために少し待機
    setTimeout(() => {
        console.log('Task sent. Check the dashboard!');
        ws.close();
    }, 1000);
});

ws.on('error', (err) => {
    console.error('Failed to connect:', err.message);
});
