import https from 'https';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const certsDir = path.resolve(__dirname, '../../certs');
const sessionDir = path.resolve(__dirname, '../../.session');
if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const options = {
    hostname: 'localhost',
    port: 8081,
    key: fs.readFileSync(path.join(certsDir, 'client.key')),
    cert: fs.readFileSync(path.join(certsDir, 'client.crt')),
    ca: fs.readFileSync(path.join(certsDir, 'ca.crt')),
    rejectUnauthorized: false,
    headers: { 'Content-Type': 'application/json' }
};

function ask(question: string): Promise<string> {
    return new Promise((resolve) => rl.question(question, resolve));
}

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

async function start() {
    console.log('--- GigaCompute Login ---');
    const mode = await ask('1: Login, 2: Register? [1/2]: ');
    const email = await ask('Email: ');
    const password = await ask('Password: ');

    let result;
    if (mode === '2') {
        const name = await ask('Display Name: ');
        result = await request('/auth/register', { email, password, name });
    } else {
        result = await request('/auth/login', { email, password });
    }

    if (result.token) {
        fs.writeFileSync(path.join(sessionDir, 'session.json'), JSON.stringify(result, null, 2));
        console.log('\n✅ Login successful! Session saved.');
        process.exit(0);
    } else {
        console.error('\n❌ Error:', result.error || 'Unknown error');
        process.exit(1);
    }
}

start().catch(console.error);
