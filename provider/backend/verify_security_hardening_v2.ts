import fs from 'fs';
import path from 'path';
import { StagingManager } from './stagingManager';

async function verifyHardening() {
    console.log('--- Verifying Staging Hardening (Final Check) ---');
    const staging = new StagingManager(process.cwd());

    const stagingDir = path.resolve(process.cwd(), '.gigacompute/staging');
    const maliciousTaskId = '../staging-secret';
    const boundaryFiles = [{ path: 'leak.txt', content: 'Secret Leaked' }];

    const leakFilePath = path.join(path.dirname(stagingDir), 'staging-secret/leak.txt');

    // 事前クリーンアップ
    if (fs.existsSync(leakFilePath)) {
        fs.unlinkSync(leakFilePath);
    }

    console.log('[Test] Attempting boundary traversal via taskId...');
    try {
        await staging.stageResult(maliciousTaskId, boundaryFiles);
        console.error('❌ VULNERABILITY DETECTED: stageResult did not throw an error!');
    } catch (e: any) {
        console.log(`✅ SECURITY SUCCESS: Blocked malicious taskId with error: "${e.message}"`);
    }

    // 最終確認: ファイルが作成されていないこと
    if (fs.existsSync(leakFilePath)) {
        console.error('❌ VULNERABILITY DETECTED: Leak file still exists on disk!');
    } else {
        console.log('✅ VERIFIED: No leak file created.');
    }
}

verifyHardening();
