import axios from 'axios';
import https from 'https';
import { spawn } from 'child_process';

const BASE_URL = 'https://localhost:8081';
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function startAgent() {
    try {
        console.log("1. Registering worker user...");
        const email = `worker_bot_${Date.now()}@example.com`;
        const res = await axios.post(`${BASE_URL}/auth/register`, {
            email, password: "password123", name: "Mock Worker Agent"
        }, { httpsAgent });

        const token = res.data.token;
        console.log(`-> Worker registered. Token: ${token.substring(0, 10)}...`);

        console.log("2. Starting Mock Agent process...");
        // Use ts-node to run the existing mock_agent.ts in the server src directory
        const child = spawn('npx', ['ts-node', 'src/mock_agent.ts', token], {
            cwd: 'c:/agent/gigacompute/server',
            stdio: 'inherit',
            shell: true
        });

        child.on('error', (err) => {
            console.error('Failed to start child process.', err);
        });

        child.on('exit', (code) => {
            console.log(`Mock Agent process exited with code ${code}`);
        });

    } catch (e: any) {
        console.error("Error:", e.response?.data || e.message);
    }
}

startAgent();
