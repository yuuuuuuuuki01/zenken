import * as vscode from 'vscode';
import axios from 'axios';
import * as https from 'https';

// The SecretStorage key for the API token
const API_KEY_SECRET = 'gigacompute_api_key';

export function activate(context: vscode.ExtensionContext) {
    console.log('GigaCompute Extension is now active!');

    // Command 1: Setup API Key
    let disposableSetup = vscode.commands.registerCommand('gigacompute.setApiKey', async () => {
        const apiKey = await vscode.window.showInputBox({
            prompt: 'Enter your GigaCompute Client API Key (e.g. giga_...)',
            password: true,
            ignoreFocusOut: true
        });

        if (apiKey) {
            await context.secrets.store(API_KEY_SECRET, apiKey);
            vscode.window.showInformationMessage('GigaCompute API Key saved successfully.');
        }
    });

    // Command 2: Submit Code Selection
    let disposableSubmit = vscode.commands.registerCommand('gigacompute.submitSelection', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active text editor found.');
            return;
        }

        const selection = editor.selection;
        const text = editor.document.getText(selection);

        if (!text) {
            vscode.window.showErrorMessage('Please select some code or text to submit.');
            return;
        }

        // Retrieve the API Key
        const apiKey = await context.secrets.get(API_KEY_SECRET);
        if (!apiKey) {
            const SetupNow = 'Setup API Key';
            const choice = await vscode.window.showWarningMessage('GigaCompute API Key is not set.', SetupNow);
            if (choice === SetupNow) {
                vscode.commands.executeCommand('gigacompute.setApiKey');
            }
            return;
        }

        // Get optional Server URL configuration
        const config = vscode.workspace.getConfiguration('gigacompute');
        const serverUrl = config.get<string>('serverUrl') || 'http://localhost:8081';

        // Prompt the user for a task type/instruction
        const instruction = await vscode.window.showInputBox({
            prompt: 'What do you want GigaCompute to do with this code?',
            placeHolder: 'e.g. Explain this code, Optimize this function...',
            ignoreFocusOut: true
        });

        if (!instruction) {
            return; // cancelled
        }
        // Compile the Payload
        const { chunkText } = require('./utils/chunker');
        const chunks = chunkText(text, 2000);

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "GigaCompute",
            cancellable: false
        }, async (progress) => {
            progress.report({ message: `Splitting text into ${chunks.length} chunks and submitting...` });

            try {
                // Submit to GigaCompute Client API
                // For this PoC, we send all chunks in a single request as an array of payloads.
                // The server will then distribute them to different workers.
                const chunkPayloads = chunks.map((chunk: string, index: number) => ({
                    instruction: instruction,
                    code: chunk,
                    languageId: editor.document.languageId,
                    chunkIndex: index,
                    totalChunks: chunks.length
                }));

                const response = await axios.post(`${serverUrl}/v1/client/task/submit`, {
                    type: 'llm_inference', // default to LLM for now
                    payload: JSON.stringify({ chunks: chunkPayloads, isChunked: true })
                }, {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    // [SECURITY] In production, this should be true with a proper CA.
                    // PoC: Allow self-signed certificates for local development.
                    httpsAgent: new https.Agent({ rejectUnauthorized: false })
                });

                if (response.data.success) {
                    const jobId = response.data.jobId;
                    vscode.window.showInformationMessage(`Task successfully deployed in ${chunks.length} chunks! Job ID: ${jobId}`);

                    // For the PoC, we stream it to the output channel.
                    const outputChannel = vscode.window.createOutputChannel("GigaCompute");
                    outputChannel.show();
                    outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] Task Submitted. Job ID: ${jobId}`);
                    outputChannel.appendLine(`Instruction: ${instruction}`);
                    outputChannel.appendLine(`Payload split into ${chunks.length} chunks for parallel processing.`);
                    outputChannel.appendLine(`Waiting for distributed workers to complete... (Polling not yet implemented in PoC)`);

                } else {
                    vscode.window.showErrorMessage(`Failed to submit task: ${response.data.error}`);
                }
            } catch (error: any) {
                vscode.window.showErrorMessage(`GigaCompute Error: ${error.response?.data?.error || error.message}`);
            }
        });
    });

    context.subscriptions.push(disposableSetup);
    context.subscriptions.push(disposableSubmit);
}

export function deactivate() { }
