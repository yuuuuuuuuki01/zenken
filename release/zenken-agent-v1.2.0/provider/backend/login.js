"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const https_1 = __importDefault(require("https"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const readline_1 = __importDefault(require("readline"));
const certsDir = path_1.default.resolve(__dirname, '../../certs');
const sessionDir = path_1.default.resolve(__dirname, '../../.session');
if (!fs_1.default.existsSync(sessionDir))
    fs_1.default.mkdirSync(sessionDir);
const rl = readline_1.default.createInterface({
    input: process.stdin,
    output: process.stdout
});
const options = {
    hostname: 'localhost',
    port: 8081,
    key: fs_1.default.readFileSync(path_1.default.join(certsDir, 'client.key')),
    cert: fs_1.default.readFileSync(path_1.default.join(certsDir, 'client.crt')),
    ca: fs_1.default.readFileSync(path_1.default.join(certsDir, 'ca.crt')),
    rejectUnauthorized: false,
    headers: { 'Content-Type': 'application/json' }
};
function ask(question) {
    return new Promise((resolve) => rl.question(question, resolve));
}
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
async function start() {
    console.log('--- GigaCompute Login ---');
    const mode = await ask('1: Login, 2: Register? [1/2]: ');
    const email = await ask('Email: ');
    const password = await ask('Password: ');
    let result;
    if (mode === '2') {
        const name = await ask('Display Name: ');
        result = await request('/auth/register', { email, password, name });
    }
    else {
        result = await request('/auth/login', { email, password });
    }
    if (result.token) {
        fs_1.default.writeFileSync(path_1.default.join(sessionDir, 'session.json'), JSON.stringify(result, null, 2));
        console.log('\n✅ Login successful! Session saved.');
        process.exit(0);
    }
    else {
        console.error('\n❌ Error:', result.error || 'Unknown error');
        process.exit(1);
    }
}
start().catch(console.error);
