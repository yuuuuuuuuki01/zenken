"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeWasmTask = executeWasmTask;
const worker_threads_1 = require("worker_threads");
const path_1 = __importDefault(require("path"));
/**
 * GigaCompute Wasm Isolation Runtime with Hard Kill Watchdog
 * 強制隔離された Wasm 実行環境を Worker Thread で提供し、リソースを超過した場合は物理的に KILL します。
 */
async function executeWasmTask(wasmBuffer, functionName, args, secrets, onExpense, onLLMRequest) {
    return new Promise((resolve, reject) => {
        const isTs = __filename.endsWith('.ts');
        const workerPath = path_1.default.resolve(__dirname, isTs ? 'wasmWorker.ts' : 'wasmWorker.js');
        const stagedFiles = [];
        // 1ms 単位の監視をシミュレートするタイマー (PoC 用に 5000ms を上限に設定)
        const TIMEOUT_MS = 5000;
        console.log(`[Watchdog] Starting Wasm Worker for ${functionName}. Hard-Kill limit: ${TIMEOUT_MS}ms`);
        const execArgv = isTs ? ['-r', 'ts-node/register'] : [];
        const worker = new worker_threads_1.Worker(workerPath, {
            workerData: {
                wasmBuffer: wasmBuffer, // Buffer is cloned to worker
                functionName,
                args,
                secrets // API Pass-through: Pass secrets to isolated thread
            },
            execArgv
        });
        const timeout = setTimeout(() => {
            console.error(`[Watchdog] !!!! HARD KILL !!!! Wasm task exceeded ${TIMEOUT_MS}ms. Terminating worker.`);
            worker.terminate();
            reject(new Error(`Execution Timeout: Resource limit exceeded (${TIMEOUT_MS}ms)`));
        }, TIMEOUT_MS);
        worker.on('message', (msg) => {
            if (msg.type === 'result') {
                clearTimeout(timeout);
                resolve({ result: msg.result, files: stagedFiles });
            }
            else if (msg.type === 'error') {
                clearTimeout(timeout);
                reject(new Error(msg.error));
            }
            else if (msg.type === 'expense') {
                // ホスト側イベントとして中継、またはコールバックを実行
                if (onExpense)
                    onExpense(msg);
                worker.emit('expense', msg);
            }
            else if (msg.type === 'llm_request') {
                // LLM 推論リクエストの中継
                if (onLLMRequest)
                    onLLMRequest(msg);
                worker.emit('llm_request', msg);
            }
            else if (msg.type === 'file_output') {
                // [Phase 20] Wasm からのファイル成果物を収集
                console.log(`[Runtime] Captured file output: ${msg.path}`);
                stagedFiles.push({ path: msg.path, content: msg.content });
            }
        });
        worker.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
        worker.on('exit', (code) => {
            clearTimeout(timeout);
            if (code !== 0) {
                reject(new Error(`Worker stopped with exit code ${code}`));
            }
        });
    });
}
