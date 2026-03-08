"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const stagingManager_1 = require("./stagingManager");
async function verifyHardening() {
    console.log('--- Verifying Staging Hardening (Path Traversal) ---');
    const staging = new stagingManager_1.StagingManager(process.cwd());
    const taskId = 'test-security-check';
    // 1. 基本的なトラバーサル攻撃
    const files = [
        { path: '../../../HACKED_BY_POC.txt', content: 'Exploit Success' }
    ];
    console.log('[Test] Attempting traversal with ../');
    await staging.stageResult(taskId, files);
    const hackedFile = path_1.default.resolve(process.cwd(), 'HACKED_BY_POC.txt');
    if (fs_1.default.existsSync(hackedFile)) {
        console.error('❌ VULNERABILITY DETECTED: Traversal succeeded via ../');
    }
    else {
        console.log('✅ TRAP AVOIDED: Traversal with ../ failed as expected.');
    }
    // 2. 境界条件のチェック (Partial path match)
    // stagingDir が "c:/agent/.gigacompute/staging" だとしたら
    // "c:/agent/.gigacompute/staging-secret/file.txt" への書き込みを試みる
    const stagingDir = path_1.default.resolve(process.cwd(), '.gigacompute/staging');
    const maliciousTaskId = '../staging-secret';
    const boundaryFiles = [{ path: 'leak.txt', content: 'Secret Leaked' }];
    console.log('\n[Test] Attempting boundary traversal (partial path match)...');
    try {
        await staging.stageResult(maliciousTaskId, boundaryFiles);
        const boundaryLeak = path_1.default.join(path_1.default.dirname(stagingDir), 'staging-secret/leak.txt');
        if (fs_1.default.existsSync(boundaryLeak)) {
            console.error('❌ VULNERABILITY DETECTED: Boundary traversal succeeded!');
        }
        else {
            console.log('✅ BOUNDARY PROTECTED: Boundary traversal failed.');
        }
    }
    catch (e) {
        console.log(`✅ SECURITY SUCCESS: Blocked malicious taskId with error: "${e.message}"`);
    }
}
verifyHardening();
