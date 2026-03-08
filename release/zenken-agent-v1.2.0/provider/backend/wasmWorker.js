"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const worker_threads_1 = require("worker_threads");
const wasi_1 = require("wasi");
async function run() {
    if (!worker_threads_1.parentPort)
        return;
    try {
        const { wasmBuffer, functionName, args, secrets } = worker_threads_1.workerData;
        const buffer = Buffer.from(wasmBuffer);
        const port = worker_threads_1.parentPort;
        const wasi = new wasi_1.WASI({
            args: [],
            env: secrets || {},
            preopens: {}
        });
        // Use a simple state object for memory access
        const ctx = {};
        // Helper to send messages safely away from the Wasm closure
        const safeSend = (msg) => {
            // Clone data to detach it from any Wasm pointers/buffers
            const data = JSON.parse(JSON.stringify(msg));
            setImmediate(() => {
                port.postMessage(data);
            });
        };
        const importObject = {
            wasi_snapshot_preview1: wasi.wasiImport,
            env: {
                ask_worker_llm: (promptPtr, promptLen) => {
                    if (!ctx.memory)
                        return -1;
                    const prompt = Buffer.from(ctx.memory.buffer, promptPtr, promptLen).toString('utf8');
                    safeSend({ type: 'llm_request', prompt });
                    return 0;
                },
                host_commit_file: (pathPtr, pathLen, contentPtr, contentLen) => {
                    if (!ctx.memory)
                        return -1;
                    const filePath = Buffer.from(ctx.memory.buffer, pathPtr, pathLen).toString('utf8');
                    const content = Buffer.from(ctx.memory.buffer, contentPtr, contentLen).toString('utf8');
                    safeSend({ type: 'file_output', path: filePath, content });
                    return 0;
                }
            }
        };
        const { instance } = await WebAssembly.instantiate(buffer, importObject);
        ctx.memory = instance.exports.memory;
        const exportedFunc = instance.exports[functionName];
        if (typeof exportedFunc !== 'function')
            throw new Error(`Function '${functionName}' not found.`);
        const result = exportedFunc(...args);
        // Final result depends on nothing from the closure, but we'll be safe
        setImmediate(() => {
            port.postMessage({ type: 'result', result: Number(result) });
        });
    }
    catch (error) {
        console.error(`[Worker Error] ${error.message}`);
        // Attempt one last safe send
        try {
            worker_threads_1.parentPort.postMessage({ type: 'error', error: error.message });
        }
        catch (e) { }
    }
}
run();
