import { parentPort, workerData } from 'worker_threads';
import { WASI } from 'wasi';

async function run() {
    if (!parentPort) return;

    try {
        const { wasmBuffer, functionName, args, secrets } = workerData;
        const buffer = Buffer.from(wasmBuffer);
        const port = parentPort;

        const options = {
            version: 'preview1',
            args: [],
            env: secrets || {},
            preopens: {}
        } as any; // @types/node のバージョン不整合回避のため options のみに as any を適用
        const wasi = new WASI(options);

        // Use a simple state object for memory access
        const ctx: { memory?: WebAssembly.Memory } = {};

        // Helper to send messages safely away from the Wasm closure
        const safeSend = (msg: any) => {
            // Clone data to detach it from any Wasm pointers/buffers
            const data = JSON.parse(JSON.stringify(msg));
            setImmediate(() => {
                port.postMessage(data);
            });
        };

        const importObject = {
            wasi_snapshot_preview1: (wasi as any).wasiImport,
            env: {
                ask_worker_llm: (promptPtr: number, promptLen: number) => {
                    if (!ctx.memory) return -1;
                    const prompt = Buffer.from(ctx.memory.buffer, promptPtr, promptLen).toString('utf8');
                    safeSend({ type: 'llm_request', prompt });
                    return 0;
                },
                host_commit_file: (pathPtr: number, pathLen: number, contentPtr: number, contentLen: number) => {
                    if (!ctx.memory) return -1;
                    const filePath = Buffer.from(ctx.memory.buffer, pathPtr, pathLen).toString('utf8');
                    const content = Buffer.from(ctx.memory.buffer, contentPtr, contentLen).toString('utf8');
                    safeSend({ type: 'file_output', path: filePath, content });
                    return 0;
                }
            }
        };

        const { instance } = await WebAssembly.instantiate(buffer, importObject);
        ctx.memory = instance.exports.memory as WebAssembly.Memory;

        const exportedFunc = instance.exports[functionName];
        if (typeof exportedFunc !== 'function') throw new Error(`Function '${functionName}' not found.`);

        const result = exportedFunc(...args);

        // Final result depends on nothing from the closure, but we'll be safe
        setImmediate(() => {
            port.postMessage({ type: 'result', result: Number(result) });
        });

    } catch (error: any) {
        console.error(`[Worker Error] ${error.message}`);
        // Attempt one last safe send
        try {
            parentPort.postMessage({ type: 'error', error: error.message });
        } catch (e) { }
    }
}

run();
