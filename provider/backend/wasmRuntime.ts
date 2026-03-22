import { Worker } from 'worker_threads';
import path from 'path';
import {
    normalizeSandboxFilePath,
    resolveSandboxPolicy,
    sanitizeSecretsForSandbox,
    WasmSandboxPolicy
} from './sandboxPolicy';

export interface StagedFile {
    path: string;
    content: string;
}

export async function executeWasmTask(
    wasmBuffer: Buffer,
    functionName: string,
    args: number[],
    secrets?: Record<string, string>,
    onExpense?: (msg: any) => void,
    onLLMRequest?: (msg: any) => Promise<void>,
    policyOverrides?: Partial<WasmSandboxPolicy>
): Promise<{ result: number, files: StagedFile[] }> {
    return new Promise((resolve, reject) => {
        const isTs = __filename.endsWith('.ts');
        const workerPath = path.resolve(__dirname, isTs ? 'wasmWorker.ts' : 'wasmWorker.js');
        const stagedFiles: StagedFile[] = [];
        const sandboxPolicy = resolveSandboxPolicy(policyOverrides);
        const sandboxSecrets = sanitizeSecretsForSandbox(secrets, sandboxPolicy);
        let totalFileBytes = 0;

        if (wasmBuffer.byteLength > sandboxPolicy.maxWasmBytes) {
            reject(new Error(`Wasm payload exceeds sandbox limit (${sandboxPolicy.maxWasmBytes} bytes)`));
            return;
        }

        if (args.length > sandboxPolicy.maxArgCount) {
            reject(new Error(`Wasm arg count exceeds sandbox limit (${sandboxPolicy.maxArgCount})`));
            return;
        }

        console.log(
            `[Watchdog] Starting Wasm Worker for ${functionName}. ` +
            `Hard-Kill limit: ${sandboxPolicy.maxExecutionMs}ms, profile=${sandboxPolicy.name}`
        );

        const execArgv = isTs ? ['-r', 'ts-node/register'] : [];
        const worker = new Worker(workerPath, {
            workerData: {
                wasmBuffer,
                functionName,
                args,
                secrets: sandboxSecrets,
                sandboxPolicy
            },
            execArgv,
            resourceLimits: {
                maxOldGenerationSizeMb: sandboxPolicy.maxOldGenerationSizeMb,
                maxYoungGenerationSizeMb: sandboxPolicy.maxYoungGenerationSizeMb,
                stackSizeMb: sandboxPolicy.stackSizeMb
            }
        });

        const fail = (error: Error) => {
            clearTimeout(timeout);
            worker.terminate().catch(() => undefined);
            reject(error);
        };

        const timeout = setTimeout(() => {
            console.error(
                `[Watchdog] !!!! HARD KILL !!!! Wasm task exceeded ${sandboxPolicy.maxExecutionMs}ms. Terminating worker.`
            );
            fail(new Error(`Execution Timeout: Resource limit exceeded (${sandboxPolicy.maxExecutionMs}ms)`));
        }, sandboxPolicy.maxExecutionMs);

        worker.on('message', (msg) => {
            if (msg.type === 'result') {
                clearTimeout(timeout);
                resolve({ result: msg.result, files: stagedFiles });
                return;
            }

            if (msg.type === 'error') {
                clearTimeout(timeout);
                reject(new Error(msg.error));
                return;
            }

            if (msg.type === 'expense') {
                if (onExpense) onExpense(msg);
                worker.emit('expense', msg);
                return;
            }

            if (msg.type === 'llm_request') {
                if (!sandboxPolicy.allowLlmBridge) {
                    fail(new Error('Sandbox policy blocked LLM bridge access'));
                    return;
                }
                if (onLLMRequest) onLLMRequest(msg);
                worker.emit('llm_request', msg);
                return;
            }

            if (msg.type === 'file_output') {
                if (!sandboxPolicy.allowFileOutput) {
                    fail(new Error('Sandbox policy blocked file output'));
                    return;
                }
                if (stagedFiles.length >= sandboxPolicy.maxFileOutputs) {
                    fail(new Error(`Sandbox file output limit exceeded (${sandboxPolicy.maxFileOutputs})`));
                    return;
                }

                const normalizedPath = normalizeSandboxFilePath(String(msg.path || ''));
                const content = String(msg.content || '');
                const fileBytes = Buffer.byteLength(content, 'utf8');
                if (fileBytes > sandboxPolicy.maxFileBytes) {
                    fail(new Error(`Sandbox file size limit exceeded for ${normalizedPath}`));
                    return;
                }

                totalFileBytes += fileBytes;
                if (totalFileBytes > sandboxPolicy.maxTotalFileBytes) {
                    fail(new Error(`Sandbox total file output limit exceeded (${sandboxPolicy.maxTotalFileBytes})`));
                    return;
                }

                console.log(`[Runtime] Captured file output: ${normalizedPath}`);
                stagedFiles.push({ path: normalizedPath, content });
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
