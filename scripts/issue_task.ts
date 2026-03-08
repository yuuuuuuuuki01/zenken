import axios from 'axios';
import https from 'https';

const BASE_URL = 'https://localhost:8081';

const httpsAgent = new https.Agent({
    rejectUnauthorized: false // 自己署名証明書を許可
});

async function issueTask() {
    try {
        console.log("1. Registering/Logging in as a test client...");
        const email = `test_client_${Date.now()}@example.com`;
        const resReg = await axios.post(`${BASE_URL}/auth/register`, {
            email: email,
            password: "password123",
            name: "Automated Test Client"
        }, { httpsAgent });

        const token = resReg.data.token;
        const user = resReg.data.user;
        console.log(`-> Registered successfully. User ID: ${user.id}, Token: ${token.substring(0, 20)}...`);

        // Force add points to the user (Server has internal DB, we use the API if possible, 
        // or just rely on the fact that this script is for testing).
        // Since the UI blocked us, we'll try to submit a task directly.

        console.log("2. Submitting a task via API...");
        const taskPayload = {
            taskId: `test-task-${Date.now()}`,
            type: 'hello_world',
            payload: {
                message: "Hello from direct API task issuance!",
                timestamp: new Date().toISOString()
            }
        };

        const resTask = await axios.post(`${BASE_URL}/v1/client/task/submit`, taskPayload, {
            headers: { 'Authorization': `Bearer ${token}` },
            httpsAgent
        });

        console.log("-> Task submitted successfully!");
        console.log("Job ID:", resTask.data.jobId);
        console.log("\nNext steps: Check the Agent Cockpit or server logs to see the task being processed.");

    } catch (error: any) {
        console.error("Error issuing task:", error.response?.data || error.message);
    }
}

issueTask();
