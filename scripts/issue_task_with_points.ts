import axios from 'axios';
import https from 'https';

const BASE_URL = 'https://api-rlhftuaqaa-uc.a.run.app';

const httpsAgent = new https.Agent({
    rejectUnauthorized: true
});

async function runFlow() {
    try {
        console.log("1. Registering test user...");
        const email = `test_user_${Date.now()}@example.com`;
        const resReg = await axios.post(`${BASE_URL}/auth/register`, {
            email: email,
            password: "password123",
            name: "QA Tester"
        }, { httpsAgent });

        const token = resReg.data.token;
        console.log(`-> Logged in. Token: ${token.substring(0, 10)}...`);

        console.log("1b. Fetching API Key via JWT...");
        const resKeys = await axios.get(`${BASE_URL}/v1/user/apikeys`, {
            headers: { 'Authorization': `Bearer ${token}` },
            httpsAgent
        });
        const apiKey = resKeys.data.keys[0]?.key;
        if (!apiKey) throw new Error("No API Key found for user");
        console.log(`-> API Key found: ${apiKey.substring(0, 10)}...`);

        console.log("2. Adding points via Mock Payment...");
        const resCheckout = await axios.post(`${BASE_URL}/v1/client/payments/checkout`, {
            amountPts: 1000
        }, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
            httpsAgent
        });

        const clientSecret = resCheckout.data.clientSecret;
        const mockIntentId = clientSecret.replace('mock_secret_', '');
        console.log(`-> Mock Intent ID: ${mockIntentId}`);

        const resVerify = await axios.post(`${BASE_URL}/v1/client/payments/verify`, {
            payment_intent_id: mockIntentId
        }, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
            httpsAgent
        });

        console.log(`-> Payment Verified. Added: ${resVerify.data.added} PTS`);

        console.log("3. Submitting Task...");
        const resTask = await axios.post(`${BASE_URL}/v1/client/task/submit`, {
            type: 'llm_inference',
            payload: '{"instruction": "Hello from automation!", "data": "Test"}',
            region: 'tokyo'
        }, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
            httpsAgent
        });

        console.log(`-> Task Submitted! Job ID: ${resTask.data.jobId}`);
        console.log(`-> View in Dashboard (Hashed Link): ${BASE_URL}/client-portal/u/${token}`);

    } catch (e: any) {
        console.error("Error:", e.response?.data || e.message);
    }
}

runFlow();
