import axios from 'axios';
import WebSocket from 'ws';

const HTTP_URL = 'https://gigacompute-fleet.web.app/v1/version';
const WS_URL = 'wss://gigacompute-fleet.web.app';

async function verify() {
    console.log(`[HTTP Test] Checking ${HTTP_URL}...`);
    try {
        const res = await axios.get(HTTP_URL);
        console.log(`[HTTP Test] Success! Version: ${JSON.stringify(res.data)}`);
    } catch (e) {
        console.error(`[HTTP Test] Failed: ${e.message}`);
    }

    console.log(`\n[WS Test] Connecting to ${WS_URL}...`);
    const ws = new WebSocket(WS_URL);

    const timeout = setTimeout(() => {
        console.error('[WS Test] Connection timed out (10s)');
        process.exit(1);
    }, 10000);

    ws.on('open', () => {
        console.log('[WS Test] Connected successfully!');
        clearTimeout(timeout);
        ws.close();
        process.exit(0);
    });

    ws.on('error', (err) => {
        console.error(`[WS Test] Error: ${err.message}`);
        clearTimeout(timeout);
        process.exit(1);
    });
}

verify();
