import axios from 'axios';
import https from 'https';

const BASE_URL = 'https://localhost:8081';

const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

async function runFlow() {
    try {
        console.log("1. Registering test user...");
        const email = `test_user_final_${Date.now()}@example.com`;
        const resReg = await axios.post(`${BASE_URL}/auth/register`, {
            email: email,
            password: "password123",
            name: "QA Tester Final"
        }, { httpsAgent });

        // auth/register returns a JWT in 'token', but we need the Client API Key for v1/client
        const jwtToken = resReg.data.token;
        console.log(`-> Registered. JWT: ${jwtToken.substring(0, 10)}...`);

        console.log("2. Fetching Client API Key...");
        const resKeys = await axios.get(`${BASE_URL}/v1/client/apikeys`, {
            headers: { 'Authorization': `Bearer ${jwtToken}` },
            httpsAgent
        });

        // Note: The above might fail because v1/client/apikeys itself uses clientAuthMiddleware!
        // Let's check auth/register logic: it creates a key.
        // If v1/client/apikeys is protected by clientAuthMiddleware, we have a chicken-egg problem for new users via API.
        // However, looking at index.ts, auth/register returns user object which might contain the hash.

        // Wait, looking at index.ts:319, req.userId = apiKey.userId.
        // The clientAuthMiddleware expects the API key in the Authorization header.

        // Let's try to get the key from the DB or a different endpoint if possible.
        // Actually, let's check /auth/login response.
    } catch (e: any) {
        console.error("Error:", e.response?.data || e.message);
    }
}
