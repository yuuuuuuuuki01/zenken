import fs from 'fs';
import path from 'path';
import { executeWasmTask } from './wasmRuntime';
import { StagingManager } from './stagingManager';

async function runTest() {
    console.log('--- Phase 20: Staging (Decompression Chamber) E2E Test ---');

    const wasmPath = path.resolve(__dirname, '../test_staging.wasm');
    if (!fs.existsSync(wasmPath)) {
        console.error(`Error: ${wasmPath} not found. Please compile test_staging.wat first.`);
        process.exit(1);
    }

    const wasmBuffer = fs.readFileSync(wasmPath);
    const stagingManager = new StagingManager(process.cwd());
    const taskId = 'test-task-' + Date.now();

    try {
        console.log(`[Test] Executing Wasm task ${taskId}...`);
        const wasmOutput = await executeWasmTask(
            wasmBuffer,
            'test_file_output',
            []
        );

        console.log(`[Test] Wasm execution result: ${wasmOutput.result}`);
        console.log(`[Test] Wasm produced ${wasmOutput.files.length} files.`);

        if (wasmOutput.files.length > 0) {
            console.log('[Test] Staging results...');
            const taskDir = await stagingManager.stageResult(taskId, wasmOutput.files);
            console.log(`[Test] Files staged in: ${taskDir}`);

            // 検証
            const expectedFile = path.join(taskDir, 'output.txt');
            if (fs.existsSync(expectedFile)) {
                const content = fs.readFileSync(expectedFile, 'utf8');
                console.log(`[Success] Verified staged file content: "${content}"`);

                console.log('[Test] Merging task to host...');
                const targetDir = path.resolve(process.cwd(), '.gigacompute/test_merge_root');
                if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

                await stagingManager.mergeTask(taskId, targetDir);

                const mergedFile = path.join(targetDir, 'output.txt');
                if (fs.existsSync(mergedFile)) {
                    console.log('[Success] Verified merged file in host root!');
                } else {
                    throw new Error('Merged file not found in target directory.');
                }
            } else {
                throw new Error('Staged file not found.');
            }
        } else {
            throw new Error('No files were produced by Wasm.');
        }

        console.log('\n--- ALL STAGING TESTS PASSED ---');
    } catch (err: any) {
        console.error(`\n[Test Failed] ${err.message}`);
        if (err.stack) console.error(err.stack);
        process.exit(1);
    }
}

runTest();
