import * as vscode from 'vscode';
import WebSocket from 'ws';
import { NodeInfo, TaskRequest, TaskResponse } from './contracts';

let ws: WebSocket;
const serverUrl = 'ws://localhost:8080';

const nodeInfo: NodeInfo = {
    id: `plugin-${Math.random().toString(36).substr(2, 9)}`,
    type: 'plugin',
    status: 'idle',
    capabilities: [],
    location: { lat: 35.6762, lng: 139.6503 }, // Tokyo (Mock)
    performanceScore: 100,
    rewardPoints: 0,
    trustScore: 100
};

export function activate(context: vscode.ExtensionContext) {
    console.log('GigaCompute Plugin activated');

    ws = new WebSocket(serverUrl);

    ws.on('open', () => {
        vscode.window.showInformationMessage('GigaCompute: Connected to server');
        ws.send(JSON.stringify({
            type: 'register',
            payload: { ...nodeInfo, performanceScore: 100, rewardPoints: 0 }
        }));
    });

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            if (message.type === 'task_response') {
                const resp = message.payload as TaskResponse;
                vscode.window.showInformationMessage(`GigaCompute: Task ${resp.taskId} Verified by Majority! Corrected Result: ${resp.result}`);
            }
        } catch (e) {
            console.error('Plugin Error', e);
        }
    });

    // 自動判別機能を持つメインコマンド
    let disposable = vscode.commands.registerCommand('gigacompute.runTask', async () => {
        const fileName = vscode.window.activeTextEditor?.document.fileName || 'unknown.ts';

        // 負荷判別ロジック (Heuristics)
        const isHighLoad = fileName.endsWith('.ts') || fileName.endsWith('.tsx');

        let shouldRunOnNetwork = true;

        if (isHighLoad) {
            const choice = await vscode.window.showInformationMessage(
                `High load task detected (${fileName}). Use GigaCompute Network for speed and Proof of Truth?`,
                'Yes (Distributed)', 'No (Local)'
            );
            if (choice !== 'Yes (Distributed)') {
                shouldRunOnNetwork = false;
                vscode.window.showInformationMessage('Running task locally...');
                return;
            }
        }

        if (shouldRunOnNetwork) {
            const task: TaskRequest = {
                taskId: `task-${Date.now()}`,
                type: 'typescript-compile',
                payload: { file: fileName },
                requesterId: nodeInfo.id,
                isHighLoad: isHighLoad
            };

            ws.send(JSON.stringify({ type: 'task_request', payload: task }));
            vscode.window.showInformationMessage(`GigaCompute: Task ${task.taskId} sent to global network (HighLoad: ${isHighLoad})`);
        }
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {
    if (ws) ws.close();
}
