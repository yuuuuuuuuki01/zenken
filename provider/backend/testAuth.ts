import https from 'https';
import fs from 'fs';
import path from 'path';

const certsDir = path.resolve(__dirname, '../../certs');
const options = {
    hostname: 'localhost',
    port: 8081,
    key: fs.readFileSync(path.join(certsDir, 'client.key')),
    cert: fs.readFileSync(path.join(certsDir, 'client.crt')),
    ca: fs.readFileSync(path.join(certsDir, 'ca.crt')),
    rejectUnauthorized: false,
    headers: { 'Content-Type': 'application/json' }
};

async function request(apiPath: string, body: any): Promise<any> {
    return new Promise((resolve, reject) => {
        const req = https.request({ ...options, path: apiPath, method: 'POST' }, (res) => {
            let data = '';
            res.on('data', (d) => data += d);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
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
