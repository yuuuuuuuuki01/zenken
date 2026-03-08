"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const stagingManager_1 = require("./stagingManager");
async function verifyHardening() {
    console.log('--- Verifying Staging Hardening (Final Check) ---');
    const staging = new stagingManager_1.StagingManager(process.cwd());
    const stagingDir = path_1.default.resolve(process.cwd(), '.gigacompute/staging');
    const maliciousTaskId = '../staging-secret';
    const boundaryFiles = [{ path: 'leak.txt', content: 'Secret Leaked' }];
    const leakFilePath = path_1.default.join(path_1.default.dirname(stagingDir), 'staging-secret/leak.txt');
    // 事前クリーンアップ
    if (fs_1.default.existsSync(leakFilePath)) {
        fs_1.default.unlinkSync(leakFilePath);
    }
    console.log('[Test] Attempting boundary traversal via taskId...');
    try {
        await staging.stageResult(maliciousTaskId, boundaryFiles);
        console.error('❌ VULNERABILITY DETECTED: stageResult did not throw an error!');
    }
    catch (e) {
        console.log(`✅ SECURITY SUCCESS: Blocked malicious taskId with error: "${e.message}"`);
    }
    // 最終確認: ファイルが作成されていないこと
    if (fs_1.default.existsSync(leakFilePath)) {
        console.error('❌ VULNERABILITY DETECTED: Leak file still exists on disk!');
    }
    else {
        console.log('✅ VERIFIED: No leak file created.');
    }
}
verifyHardening();
