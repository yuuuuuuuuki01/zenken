import axios from 'axios';
import https from 'https';

const BASE_URL = 'https://localhost:8081';

const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

async function runFlow() {
    try {
        const email = `test_bot_${Date.now()}@example.com`;
        const password = "password123";

        console.log("1. Creating test user...");
        await axios.post(`${BASE_URL}/auth/register`, {
            email, password, name: "Automation Bot"
        }, { httpsAgent });

        console.log("2. Logging in via login-simple to get the API Key...");
        const resLogin = await axios.post(`${BASE_URL}/auth/login-simple`,
            `email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                },
                httpsAgent,
                maxRedirects: 0,
                validateStatus: (status) => status < 400
            }
        );

        let apiKey = resLogin.data.key;
        if (!apiKey) {
            const location = resLogin.headers.location;
            if (location && location.includes('/u/')) {
                apiKey = location.split('/u/')[1].split('?')[0];
            }
        }

        if (!apiKey) throw new Error("API Key not found");
        console.log(`-> Obtained API Key: ${apiKey}`);

        console.log("3. Funding account via Mock Payment...");
        const resCheckout = await axios.post(`${BASE_URL}/v1/client/payments/checkout`,
            { amountPts: 5000 },
            { headers: { 'Authorization': `Bearer ${apiKey}` }, httpsAgent }
        );

        // clientSecret looks like "pi_123_secret_abc..." or "mock_secret_pi_test_mock_..."
        // The endpoint needs the pure Intent ID (pi_...)
        const clientSecret = resCheckout.data.clientSecret;
        let intentId = "";

        if (clientSecret.startsWith('mock_secret_')) {
            intentId = clientSecret.replace('mock_secret_', '');
        } else {
            // For real Stripe: client_secret is "pi_XXX_secret_YYY"
            intentId = clientSecret.split('_secret_')[0];
        }

        console.log(`-> Extracted Intent ID: ${intentId}`);

        await axios.post(`${BASE_URL}/v1/client/payments/verify`,
            { payment_intent_id: intentId },
            { headers: { 'Authorization': `Bearer ${apiKey}` }, httpsAgent }
        );
        console.log("-> Account funded with 5000 PTS.");

        console.log("4. Submitting Task...");
        const resTask = await axios.post(`${BASE_URL}/v1/client/task/submit`, {
            type: 'compile_code',
            payload: JSON.stringify({ isChunked: true, chunks: [{ instruction: "Automation Final Test", code: "new Date().toISOString()" }] }),
            region: 'any'
        }, { headers: { 'Authorization': `Bearer ${apiKey}` }, httpsAgent });

        console.log(`-> Task Submitted! Job ID: ${resTask.data.jobId}`);
        console.log(`\n✅ END-TO-END FLOW VERIFIED.`);

    } catch (e: any) {
        console.error("Error:", e.response?.data || e.message);
    }
}

runFlow();
