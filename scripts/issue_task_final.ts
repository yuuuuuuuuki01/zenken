import axios from 'axios';
import https from 'https';

const BASE_URL = 'https://localhost:8081';

const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

async function runFlow() {
    try {
        console.log("1. Creating a common test user...");
        const email = `test_bot_${Date.now()}@example.com`;
        const password = "password123";

        // Register via standard auth to create the user
        await axios.post(`${BASE_URL}/auth/register`, {
            email: email,
            password: password,
            name: "Automation Bot"
        }, { httpsAgent });

        console.log("2. Logging in via login-simple to get the API Key...");
        const resLogin = await axios.post(`${BASE_URL}/auth/login-simple`,
            `email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                },
                httpsAgent
            }
        );

        const apiKey = resLogin.data.key;
        if (!apiKey) throw new Error("API Key not found in login response");
        console.log(`-> Obtained API Key: ${apiKey}`);

        console.log("3. Adding points via Mock Payment...");
        const resCheckout = await axios.post(`${BASE_URL}/v1/client/payments/checkout`, {
            amountPts: 5000
        }, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
            httpsAgent
        });

        const clientSecret = resCheckout.data.clientSecret;
        if (!clientSecret || !clientSecret.startsWith('mock_')) {
            throw new Error(`Unexpected clientSecret: ${clientSecret}`);
        }

        const mockIntentId = clientSecret.replace('mock_secret_', '');
        console.log(`-> Mock Intent ID: ${mockIntentId}`);

        const resVerify = await axios.post(`${BASE_URL}/v1/client/payments/verify`, {
            payment_intent_id: mockIntentId
        }, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
            httpsAgent
        });

        console.log(`-> Payment Verified. Status: ${resVerify.data.message || 'Success'}. Added: ${resVerify.data.added} PTS`);

        console.log("4. Submitting Task...");
        const resTask = await axios.post(`${BASE_URL}/v1/client/task/submit`, {
            type: 'compile_code',
            payload: JSON.stringify({
                isChunked: true,
                chunks: [
                    { instruction: "Hello World Task", code: "console.log('Test');" }
                ]
            }),
            region: 'any'
        }, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
            httpsAgent
        });

        console.log(`-> Task Submitted! Job ID: ${resTask.data.jobId}`);
        console.log(`\n✅ TEST SUCCESSFUL.`);
        console.log(`-> You can now view the results at: ${BASE_URL}/client-portal/u/${apiKey}`);

    } catch (e: any) {
        console.error("Error:", e.response?.data || e.message);
    }
}

runFlow();
