import path from 'path';

export interface WasmSandboxPolicy {
    name: string;
    maxExecutionMs: number;
    maxOldGenerationSizeMb: number;
    maxYoungGenerationSizeMb: number;
    stackSizeMb: number;
    maxWasmBytes: number;
    maxArgCount: number;
    allowFileOutput: boolean;
    maxFileOutputs: number;
    maxFileBytes: number;
    maxTotalFileBytes: number;
    allowLlmBridge: boolean;
    allowEnvKeys: string[];
    maxSecretBytes: number;
}

const DEFAULT_POLICY: WasmSandboxPolicy = {
    name: 'default',
    maxExecutionMs: 5000,
    maxOldGenerationSizeMb: 64,
    maxYoungGenerationSizeMb: 16,
    stackSizeMb: 4,
    maxWasmBytes: 512 * 1024,
    maxArgCount: 32,
    allowFileOutput: true,
    maxFileOutputs: 8,
    maxFileBytes: 128 * 1024,
    maxTotalFileBytes: 512 * 1024,
    allowLlmBridge: false,
    allowEnvKeys: [],
    maxSecretBytes: 8 * 1024
};

export function resolveSandboxPolicy(overrides?: Partial<WasmSandboxPolicy>): WasmSandboxPolicy {
    return {
        ...DEFAULT_POLICY,
        ...overrides,
        allowEnvKeys: [...(overrides?.allowEnvKeys ?? DEFAULT_POLICY.allowEnvKeys)]
    };
}

export function createTaskSandboxPolicy(task: {
    complexityScore?: number;
    payload?: any;
    secrets?: Record<string, string>;
}): WasmSandboxPolicy {
    const complexity = task.complexityScore ?? 0;
    const secretKeys = Object.keys(task.secrets || {});
    const payload = task.payload || {};
    const allowlistedSecretKeys = secretKeys.filter((key) =>
        ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GC_NODE_VAULT_ID'].includes(key)
    );
    const requestedFileOutput = Boolean(
        payload.allowFileOutput ||
        payload.expectFiles ||
        (typeof payload.functionName === 'string' && payload.functionName.toLowerCase().includes('file'))
    );
    const requestedLlm = Boolean(payload.allowLlmBridge || allowlistedSecretKeys.includes('OPENAI_API_KEY'));

    return resolveSandboxPolicy({
        name: requestedLlm ? 'llm-bridge' : requestedFileOutput ? 'staging' : 'compute',
        maxExecutionMs: complexity > 0.7 ? 8000 : complexity > 0.3 ? 6500 : 5000,
        maxOldGenerationSizeMb: complexity > 0.7 ? 96 : 64,
        maxYoungGenerationSizeMb: complexity > 0.7 ? 32 : 16,
        maxWasmBytes: complexity > 0.7 ? 1024 * 1024 : 512 * 1024,
        allowFileOutput: requestedFileOutput,
        maxFileOutputs: requestedFileOutput ? 16 : 0,
        maxFileBytes: requestedFileOutput ? 256 * 1024 : 0,
        maxTotalFileBytes: requestedFileOutput ? 1024 * 1024 : 0,
        allowLlmBridge: requestedLlm,
        allowEnvKeys: requestedLlm ? allowlistedSecretKeys : []
    });
}

export function sanitizeSecretsForSandbox(
    secrets: Record<string, string> | undefined,
    policy: WasmSandboxPolicy
): Record<string, string> {
    if (!secrets || policy.allowEnvKeys.length === 0) return {};

    const allowed = new Set(policy.allowEnvKeys);
    const result: Record<string, string> = {};
    let totalBytes = 0;

    for (const [key, value] of Object.entries(secrets)) {
        if (!allowed.has(key)) continue;
        const valueBytes = Buffer.byteLength(value, 'utf8');
        if (totalBytes + valueBytes > policy.maxSecretBytes) {
            throw new Error(`Sandbox secret budget exceeded while allowing ${key}`);
        }
        result[key] = value;
        totalBytes += valueBytes;
    }

    return result;
}

export function normalizeSandboxFilePath(filePath: string): string {
    const normalized = path.posix.normalize(filePath.replace(/\\/g, '/'));
    if (normalized.startsWith('/') || normalized.startsWith('..') || normalized.includes('../')) {
        throw new Error(`Sandbox blocked file output path: ${filePath}`);
    }
    return normalized;
}
