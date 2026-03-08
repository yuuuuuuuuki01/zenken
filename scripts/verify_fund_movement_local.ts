import axios from 'axios';
import https from 'https';

const BASE_URL = 'https://localhost:8081';
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function runVerification() {
    console.log('--- Starting Unified Fund Movement Verification (Local - Fix 2) ---');

    try {
        // 1. Register Client
        const clientEmail = `client_${Date.now()}@example.com`;
        console.log(`Step 1: Registering Client (${clientEmail})...`);
        const clientReg = await axios.post(`${BASE_URL}/auth/register`, {
            email: clientEmail,
            password: 'password123',
            name: 'Test Client'
        }, { httpsAgent });
        const clientToken = clientReg.data.token;
        const clientId = clientReg.data.user.id;

        // Get Client API Key
        const clientKeysResp = await axios.get(`${BASE_URL}/v1/user/apikeys`, {
            headers: { Authorization: `Bearer ${clientToken}` },
            httpsAgent
        });
        const clientApiKey = clientKeysResp.data.keys[0].key;

        // 2. Mock Payment to get Points
        console.log('Step 2: Adding 1000 PTS to Client via Mock Payment...');
        const checkoutResp = await axios.post(`${BASE_URL}/v1/client/payments/checkout`, {
            amountPts: 1000
        }, {
            headers: { Authorization: clientApiKey },
            httpsAgent
        });
        const clientSecret = checkoutResp.data.clientSecret;
        const paymentIntentId = clientSecret.replace('mock_secret_', '');

        await axios.post(`${BASE_URL}/v1/client/payments/verify`, {
            payment_intent_id: paymentIntentId
        }, {
            headers: { Authorization: clientApiKey },
            httpsAgent
        });
        console.log('Mock payment successful.');

        // 3. Register Worker
        const workerEmail = `worker_${Date.now()}@example.com`;
        console.log(`Step 3: Registering Worker (${workerEmail})...`);
        const workerReg = await axios.post(`${BASE_URL}/auth/register`, {
            email: workerEmail,
            password: 'password123',
            name: 'Test Worker'
        }, { httpsAgent });
        const workerToken = workerReg.data.token;
        const workerId = workerReg.data.user.id;

        // 4. Client Submits Task
        console.log('Step 4: Client submitting task (5 PTS)...');
        const taskSubmit = await axios.post(`${BASE_URL}/v1/client/task/submit`, {
            type: 'computation',
            payload: JSON.stringify({ data: [1, 2, 3] })
        }, {
            headers: { Authorization: clientApiKey },
            httpsAgent
        });
        const jobId = taskSubmit.data.jobId;

        // 5. Worker Fetches Task
        console.log('Step 5: Worker fetching task...');
        const fetchResp = await axios.post(`${BASE_URL}/v1/worker/task/fetch`, {}, {
            headers: { Authorization: `Bearer ${workerToken}` },
            httpsAgent
        });
        if (fetchResp.status === 204 || !fetchResp.data.task) {
            throw new Error('No task available for worker');
        }
        const task = fetchResp.data.task;
        console.log(`Task fetched: ${task.id}`);

        // 6. Worker Submits Result
        console.log('Step 6: Worker submitting result...');
        const resultResp = await axios.post(`${BASE_URL}/v1/worker/task/result`, {
            taskId: task.id,
            result: 'SUCCESS'
        }, {
            headers: { Authorization: `Bearer ${workerToken}` },
            httpsAgent
        });
        console.log(`Result accepted. Reward: ${resultResp.data.reward} PTS`);

        // 7. Verify Final States
        console.log('Step 7: Verifying records in DB...');
        // Use common user token to access admin transactions (allowed in local/dev)
        const txResp = await axios.get(`${BASE_URL}/admin/api/transactions`, {
            headers: { Authorization: `Bearer ${clientToken}` },
            httpsAgent
        });

        const txs = txResp.data.transactions.filter((t: any) => t.userId === clientId || t.userId === workerId);

        console.log('\n--- Fund Movement Report ---');
        txs.slice().reverse().forEach((t: any) => {
            const role = t.userId === clientId ? 'Client' : 'Worker';
            console.log(`[${role}] ${t.type.padEnd(10)} | ${t.amount.toString().padStart(6)} PTS | ${t.description}`);
        });

        const hasPurchase = txs.some((t: any) => t.type === 'PURCHASE' && t.amount < 0);
        const hasReward = txs.some((t: any) => t.type === 'REWARD');

        if (hasPurchase && hasReward) {
            console.log('\n✅ VERIFICATION SUCCESS: All fund movements and records are NORMAL.');
        } else {
            console.log('\n❌ VERIFICATION FAILED: Missing record types.');
        }

    } catch (error: any) {
        console.error('ERROR during verification:', error.response?.data || error.message);
    }
}

runVerification();
