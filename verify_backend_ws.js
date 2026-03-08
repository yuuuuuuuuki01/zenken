const WebSocket = require('c:/agent/gigacompute/provider/backend/node_modules/ws/index.js');

const wsUrl = 'wss://api-rlhftuaqaa-uc.a.run.app';
console.log(`Connecting to ${wsUrl}...`);

const ws = new WebSocket(wsUrl);

ws.on('open', () => {
    console.log('✅ WebSocket Connected Successfully!');
    process.exit(0);
});

ws.on('error', (err) => {
    console.error('❌ WebSocket Connection Failed:', err.message);
    process.exit(1);
});

ws.on('close', (code, reason) => {
    console.log(`Connection closed (Code: ${code}, Reason: ${reason})`);
    process.exit(1);
});

setTimeout(() => {
    console.log('⌛ Connection timed out after 10s');
    process.exit(1);
}, 10000);
