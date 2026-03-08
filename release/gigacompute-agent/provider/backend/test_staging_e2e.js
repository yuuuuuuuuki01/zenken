"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const wasmRuntime_1 = require("./wasmRuntime");
const stagingManager_1 = require("./stagingManager");
async function runTest() {
    console.log('--- Phase 20: Staging (Decompression Chamber) E2E Test ---');
    const wasmPath = path_1.default.resolve(__dirname, '../test_staging.wasm');
    if (!fs_1.default.existsSync(wasmPath)) {
        console.error(`Error: ${wasmPath} not found. Please compile test_staging.wat first.`);
        process.exit(1);
    }
    const wasmBuffer = fs_1.default.readFileSync(wasmPath);
    const stagingManager = new stagingManager_1.StagingManager(process.cwd());
    const taskId = 'test-task-' + Date.now();
    try {
        console.log(`[Test] Executing Wasm task ${taskId}...`);
        const wasmOutput = await (0, wasmRuntime_1.executeWasmTask)(wasmBuffer, 'test_file_output', []);
        console.log(`[Test] Wasm execution result: ${wasmOutput.result}`);
        console.log(`[Test] Wasm produced ${wasmOutput.files.length} files.`);
        if (wasmOutput.files.length > 0) {
            console.log('[Test] Staging results...');
            const taskDir = await stagingManager.stageResult(taskId, wasmOutput.files);
            console.log(`[Test] Files staged in: ${taskDir}`);
            // 検証
            const expectedFile = path_1.default.join(taskDir, 'output.txt');
            if (fs_1.default.existsSync(expectedFile)) {
                const content = fs_1.default.readFileSync(expectedFile, 'utf8');
                console.log(`[Success] Verified staged file content: "${content}"`);
                console.log('[Test] Merging task to host...');
                const targetDir = path_1.default.resolve(process.cwd(), '.gigacompute/test_merge_root');
                if (!fs_1.default.existsSync(targetDir))
                    fs_1.default.mkdirSync(targetDir, { recursive: true });
                await stagingManager.mergeTask(taskId, targetDir);
                const mergedFile = path_1.default.join(targetDir, 'output.txt');
                if (fs_1.default.existsSync(mergedFile)) {
                    console.log('[Success] Verified merged file in host root!');
                }
                else {
                    throw new Error('Merged file not found in target directory.');
                }
            }
            else {
                throw new Error('Staged file not found.');
            }
        }
        else {
            throw new Error('No files were produced by Wasm.');
        }
        console.log('\n--- ALL STAGING TESTS PASSED ---');
    }
    catch (err) {
        console.error(`\n[Test Failed] ${err.message}`);
        if (err.stack)
            console.error(err.stack);
        process.exit(1);
    }
}
runTest();
