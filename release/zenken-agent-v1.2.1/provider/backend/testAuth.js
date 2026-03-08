"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const https_1 = __importDefault(require("https"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const certsDir = path_1.default.resolve(__dirname, '../../certs');
const options = {
    hostname: 'localhost',
    port: 8081,
    key: fs_1.default.readFileSync(path_1.default.join(certsDir, 'client.key')),
    cert: fs_1.default.readFileSync(path_1.default.join(certsDir, 'client.crt')),
    ca: fs_1.default.readFileSync(path_1.default.join(certsDir, 'ca.crt')),
    rejectUnauthorized: false,
    headers: { 'Content-Type': 'application/json' }
};
async function request(apiPath, body) {
    return new Promise((resolve, reject) => {
        const req = https_1.default.request({ ...options, path: apiPath, method: 'POST' }, (res) => {
            let data = '';
            res.on('data', (d) => data += d);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                }
                catch (e) {
                    resolve(data);
                }
            });
        });
        req.on('error', reject);
        req.write(JSON.stringify(body));
        req.end();
    });
}
async function runTests() {
    console.log('--- Testing GigaID Authentication ---');
    // 1. Register
    console.log('\n[1] Registering test user...');
    const regResult = await request('/auth/register', {
        email: 'test' + Date.now() + '@example.com',
        password: 'password123',
        name: 'GigaWorker'
    });
    console.log('Register Result:', JSON.stringify(regResult, null, 2));
    if (regResult.token) {
        // 2. Login
        console.log('\n[2] Logging in with same user...');
        const loginResult = await request('/auth/login', {
            email: regResult.user.email,
            password: 'password123'
        });
        console.log('Login Result:', JSON.stringify(loginResult, null, 2));
        // 3. Distribute Points
        console.log('\n[3] Distributing promotion points...');
        const distResult = await request('/admin/distribute-points', {
            email: regResult.user.email,
            amount: 500
        });
        console.log('Distribution Result:', JSON.stringify(distResult, null, 2));
    }
}
runTests().catch(console.error);
