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

        console.log("2. Logging in via login-simple with maxRedirects: 0...");
        // axios usually follows redirects by default. We want the JSON response we added.
        const resLogin = await axios.post(`${BASE_URL}/auth/login-simple`,
            `email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                },
                httpsAgent,
                maxRedirects: 0, // Prevent falling into the HTML redirect
                validateStatus: (status) => status < 400 // Accept 2xx and 3xx
            }
        );

        let apiKey = resLogin.data.key;
        if (!apiKey) {
            console.log("-> JSON 'key' not found in body, checking if redirected to a URL containing the key...");
            const location = resLogin.headers.location;
            if (location && location.includes('/u/')) {
                apiKey = location.split('/u/')[1].split('?')[0];
            }
        }

        if (!apiKey) throw new Error("API Key not found in login response or redirect location");
        console.log(`-> Obtained API Key: ${apiKey}`);

        console.log("3. Funding account via Mock Payment...");
        const resCheckout = await axios.post(`${BASE_URL}/v1/client/payments/checkout`,
            { amountPts: 5000 },
            { headers: { 'Authorization': `Bearer ${apiKey}` }, httpsAgent }
        );

        const mockIntentId = resCheckout.data.clientSecret.replace('mock_secret_', '');
        await axios.post(`${BASE_URL}/v1/client/payments/verify`,
            { payment_intent_id: mockIntentId },
            { headers: { 'Authorization': `Bearer ${apiKey}` }, httpsAgent }
        );
        console.log("-> Account funded with 5000 PTS.");

        console.log("4. Submitting Task...");
        const resTask = await axios.post(`${BASE_URL}/v1/client/task/submit`, {
            type: 'compile_code',
            payload: JSON.stringify({ isChunked: true, chunks: [{ instruction: "Automation Test", code: "Date.now()" }] }),
            region: 'any'
        }, { headers: { 'Authorization': `Bearer ${apiKey}` }, httpsAgent });

        console.log(`-> Task Submitted! Job ID: ${resTask.data.jobId}`);
        console.log(`\n✅ FINAL VERIFICATION SUCCESSFUL.`);

    } catch (e: any) {
        console.error("Error:", e.response?.data || e.message);
    }
}

runFlow();
