import assert from 'assert/strict';
import {
    createTaskSandboxPolicy,
    normalizeSandboxFilePath,
    sanitizeSecretsForSandbox
} from './sandboxPolicy';

function run() {
    const policy = createTaskSandboxPolicy({
        payload: {
            allowLlmBridge: true,
            allowFileOutput: true,
            functionName: 'test_file_output'
        },
        secrets: {
            OPENAI_API_KEY: 'sk-test',
            SHOULD_NOT_LEAK: 'blocked'
        }
    });

    const secrets = sanitizeSecretsForSandbox(
        {
            OPENAI_API_KEY: 'sk-test',
            SHOULD_NOT_LEAK: 'blocked'
        },
        policy
    );

    assert.equal(policy.allowLlmBridge, true);
    assert.equal(policy.allowFileOutput, true);
    assert.deepEqual(Object.keys(secrets), ['OPENAI_API_KEY']);
    assert.equal(normalizeSandboxFilePath('logs/output.txt'), 'logs/output.txt');
    assert.throws(() => normalizeSandboxFilePath('../escape.txt'));

    console.log('Sandbox policy checks passed.');
}

run();
