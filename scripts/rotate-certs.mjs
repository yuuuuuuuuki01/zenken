import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const certsDir = path.resolve(__dirname, '../certs');

function rotate() {
    console.log('[CertRotation] Starting mTLS certificate rotation...');

    // 既存の証明書をバックアップ
    const timestamp = Date.now();
    const backupDir = path.join(certsDir, `backup_${timestamp}`);
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);

    ['ca.crt', 'ca.key', 'server.crt', 'server.key', 'client.crt', 'client.key'].forEach(f => {
        const src = path.join(certsDir, f);
        if (fs.existsSync(src)) {
            fs.copyFileSync(src, path.join(backupDir, f));
        }
    });

    console.log(`[CertRotation] Backup created in ${backupDir}`);

    // scripts/gen-certs.mjs を再実行 (ここでは同じディレクトリにあると仮定)
    try {
        const genScript = path.join(__dirname, 'gen-certs.mjs');
        if (fs.existsSync(genScript)) {
            console.log('[CertRotation] Executing gen-certs.mjs...');
            execSync(`node ${genScript}`, { stdio: 'inherit' });
            console.log('[CertRotation] Certificates re-generated successfully.');
            console.log('[CertRotation] IMPORTANT: Server restart required to apply new certificates.');
        } else {
            console.error('[CertRotation] Error: gen-certs.mjs not found.');
        }
    } catch (err) {
        console.error('[CertRotation] Failed to rotate certificates:', err.message);
    }
}

rotate();
