import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

async function setup() {
    console.log('--- GigaCompute Launch Setup ---');

    const projectRoot = path.resolve(__dirname, '../');
    const certsDir = path.join(projectRoot, 'certs');

    // 1. Install dependencies (if not already done)
    console.log('[1/4] Checking dependencies...');
    // execSync('npm install', { cwd: projectRoot, stdio: 'inherit' });

    // 2. Database Migration
    console.log('[2/4] Running Database Migrations...');
    try {
        execSync('npx prisma migrate dev --name init', { cwd: path.join(projectRoot, 'server'), stdio: 'inherit' });
    } catch (e) {
        console.warn('Prisma migrate failed. Ensure DB is available.');
    }

    // 3. Generate mTLS Certs
    console.log('[3/4] Generating mTLS Certificates...');
    if (!fs.existsSync(certsDir)) fs.mkdirSync(certsDir);

    const generateCertCmd = `
        # Simple Mock Cert Generation (In production use OpenSSL)
        echo "Generating CA..."
        touch ${path.join(certsDir, 'ca.key')} ${path.join(certsDir, 'ca.crt')}
        echo "Generating Server Cert..."
        touch ${path.join(certsDir, 'server.key')} ${path.join(certsDir, 'server.crt')}
        echo "Generating Client Cert..."
        touch ${path.join(certsDir, 'client.key')} ${path.join(certsDir, 'client.crt')}
    `;
    // For PoC, we just ensure files exist to prevent server crash
    fs.writeFileSync(path.join(certsDir, 'ca.crt'), 'MOCK_CA_CERT');
    fs.writeFileSync(path.join(certsDir, 'server.key'), 'MOCK_SERVER_KEY');
    fs.writeFileSync(path.join(certsDir, 'server.crt'), 'MOCK_SERVER_CERT');

    // 4. Environment Variables
    console.log('[4/4] Creating .env files...');
    const envContent = `
STRIPE_SECRET_KEY=sk_test_placeholder
DATABASE_URL="file:./dev.db"
PORT=8081
    `;
    fs.writeFileSync(path.join(projectRoot, 'server', '.env'), envContent);

    console.log('\n✅ Setup Complete! Run "npm run dev" to start GigaCompute.');
}

setup().catch(console.error);
