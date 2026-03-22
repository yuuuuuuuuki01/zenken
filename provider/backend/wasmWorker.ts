import { parentPort, workerData } from 'worker_threads';
import { WASI } from 'wasi';

async function run() {
    if (!parentPort) return;

    try {
        const { wasmBuffer, functionName, args, secrets, sandboxPolicy } = workerData;
        const buffer = Buffer.from(wasmBuffer);
        const port = parentPort;

        const options = {
            version: 'preview1',
            args: [],
            env: secrets || {},
            preopens: {}
        } as any;
        const wasi = new WASI(options);
        const ctx: { memory?: WebAssembly.Memory } = {};

        const safeSend = (msg: any) => {
            const data = JSON.parse(JSON.stringify(msg));
            setImmediate(() => {
                port.postMessage(data);
            });
        };

        const importObject = {
            wasi_snapshot_preview1: (wasi as any).wasiImport,
            env: {
                ask_worker_llm: (promptPtr: number, promptLen: number) => {
                    if (!sandboxPolicy?.allowLlmBridge || !ctx.memory) return -1;
                    const prompt = Buffer.from(ctx.memory.buffer, promptPtr, promptLen).toString('utf8');
                    safeSend({ type: 'llm_request', prompt });
                    return 0;
                },
                host_commit_file: (pathPtr: number, pathLen: number, contentPtr: number, contentLen: number) => {
                    if (!sandboxPolicy?.allowFileOutput || !ctx.memory) return -1;
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
        if (typeof exportedFunc !== 'function') {
            throw new Error(`Function '${functionName}' not found.`);
        }

        const result = exportedFunc(...args);

        setImmediate(() => {
            port.postMessage({ type: 'result', result: Number(result) });
        });
    } catch (error: any) {
        console.error(`[Worker Error] ${error.message}`);
        try {
            parentPort.postMessage({ type: 'error', error: error.message });
        } catch {
            // Ignore postMessage failures during teardown.
        }
    }
}

run();
