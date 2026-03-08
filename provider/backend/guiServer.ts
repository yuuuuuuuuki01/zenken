import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

export interface GuiServerOptions {
    port: number;
    nodeInfo: any;
    localTasks: any[];
    wallet: any;
    stagingManager: any;
    userSession: any;
    onMergeTask: (taskId: string) => Promise<void>;
    onImportPackage: (payload: any) => Promise<void>;
    onWizardPair: (payload: { token: string }) => Promise<void>;
    onGetSubnodes: () => Promise<any>;
    onCreateShortcut: () => Promise<void>;
    onUpdateResourceLimits?: (limits: { cpuCores: number, memoryGb: number }) => void;
    onUpdateSettings: (settings: any) => Promise<void>;
    onAcceptUpdate?: (payload: any) => Promise<void>;
    getRoiStats: () => any;
    serverUrl: string;
}

export class GuiServer {
    private localUIs = new Set<WebSocket>();
    private latestActiveTasks: any[] = [];

    constructor(private options: GuiServerOptions) { }

    updateSession(session: any) {
        this.options.userSession = session;
    }

    start() {
        const httpServer = http.createServer((req, res) => {
            const isPkg = (process as any).pkg;

            // pkgバンドル時: assetsは __dirname基準で展面される
            // 通常: ../frontend (から provider/backend -> provider/frontend)
            // 優先順位: 
            // 1. EXEと同じ階層にある frontend/ フォルダ (最新・オーバーライド可能)
            // 2. pkg バンドル内部の assets (dist/provider/backend/frontend)
            const searchPaths = [
                path.join(isPkg ? path.dirname(process.execPath) : process.cwd(), 'frontend'), // EXE外部のオーバーライド用
                path.join(__dirname, 'frontend'), // pkg 内部のアセット (dist/provider/backend/frontend 相当)
                path.resolve(__dirname, '../../frontend'),
                path.resolve(__dirname, '../frontend'),
            ];

            console.log(`[GUI] isPkg=${!!isPkg}, __dirname=${__dirname}`);

            let frontendDir = searchPaths[0]; // Default
            for (const p of searchPaths) {
                const htmlPath = path.join(p, 'index.html');
                const exists = fs.existsSync(htmlPath);
                if (exists) {
                    frontendDir = p;
                    break;
                }
            }

            let filePath = path.join(frontendDir, 'index.html');
            if (req.url === '/' || req.url === '' || req.url === '/index.html' || req.url?.startsWith('/u/')) {
                filePath = path.join(frontendDir, 'index.html');
            } else if (req.url?.endsWith('.html') || req.url === '/style.css' || req.url?.startsWith('/js/')) {
                const urlPart = req.url.startsWith('/') ? req.url.substring(1) : req.url;
                filePath = path.join(frontendDir, urlPart);
            }

            if (req.url === '/favicon.ico' || req.url === '/icon.png') {
                // Find branding dir (relative to this file or baseDir)
                // We'll use process.cwd() as a fallback or assume it's in a known relative path
                const iconSearchPaths = [
                    path.join(process.cwd(), 'branding', 'icon.png'),
                    path.resolve(__dirname, '../../../branding/icon.png'),
                    path.resolve(__dirname, '../../branding/icon.png')
                ];
                let iconPath = iconSearchPaths[0];
                for (const p of iconSearchPaths) {
                    if (fs.existsSync(p)) {
                        iconPath = p;
                        break;
                    }
                }

                fs.readFile(iconPath, (err, content) => {
                    if (err) {
                        res.writeHead(404);
                        res.end();
                    } else {
                        res.writeHead(200, { 'Content-Type': 'image/png' });
                        res.end(content);
                    }
                });
                return;
            }

            console.log(`[GUI] Resolved Path: ${filePath} (Source: ${frontendDir})`);


            fs.readFile(filePath, (err, content) => {
                if (err) {
                    console.error(`[GUI] Server Error: Failed to read ${filePath}. Error: ${err.message}`);
                    res.writeHead(404);
                    res.end(`File not found: ${req.url}`);
                } else {
                    const contentType = req.url?.endsWith('.css') ? 'text/css' :
                        req.url?.endsWith('.js') ? 'text/javascript' : 'text/html';
                    res.writeHead(200, { 'Content-Type': contentType });
                    res.end(content, 'utf-8');
                }
            });
        });

        const localWss = new WebSocketServer({ server: httpServer });
        localWss.on('error', (err: any) => {
            // Error is handled by httpServer.on('error')
            if (err.code !== 'EADDRINUSE') {
                console.error(`[GUI] WebSocket server error:`, err);
            }
        });
        localWss.on('connection', (socket: any) => {
            this.localUIs.add(socket);
            socket.send(JSON.stringify({
                type: 'init',
                payload: {
                    nodeInfo: this.options.nodeInfo,
                    localTasks: this.options.localTasks,
                    walletStats: this.options.wallet.getStats(),
                    transactions: this.options.wallet.getTransactions(),
                    session: this.options.userSession,
                    roiStats: this.options.getRoiStats(),
                    serverUrl: this.options.serverUrl
                }
            }));

            socket.on('message', async (data: any) => {
                try {
                    const message = JSON.parse(data.toString());
                    if (message.type === 'gui_merge_task') {
                        await this.options.onMergeTask(message.payload.taskId);
                    } else if (message.type === 'import_package') {
                        await this.options.onImportPackage(message.payload);
                    } else if (message.type === 'wizard_pair') {
                        await this.options.onWizardPair(message.payload);
                    } else if (message.type === 'get_subnodes') {
                        const subnodes = await this.options.onGetSubnodes();
                        socket.send(JSON.stringify({ type: 'subnodes_data', payload: subnodes }));
                    } else if (message.type === 'create_shortcut') {
                        await this.options.onCreateShortcut();
                    } else if (message.type === 'open_browser') {
                        const url = message.payload.url;
                        console.log(`[GUI] Launching external browser: ${url}`);
                        const command = process.platform === 'win32' ? `start "" "${url}"` :
                            process.platform === 'darwin' ? `open "${url}"` :
                                `xdg-open "${url}"`;
                        exec(command, (err) => {
                            if (err) console.error('[GUI] Failed to launch external browser:', err);
                        });
                    } else if (message.type === 'update_resource_limits') {
                        if (this.options.onUpdateResourceLimits) {
                            this.options.onUpdateResourceLimits(message.payload);
                        }
                    } else if (message.type === 'update_settings') {
                        await this.options.onUpdateSettings(message.payload);
                    } else if (message.type === 'accept_update') {
                        if (this.options.onAcceptUpdate) {
                            await this.options.onAcceptUpdate(message.payload);
                        }
                    }
                } catch (e) {
                    console.error('[GUI] Handler error:', e);
                }
            });

            socket.on('close', () => this.localUIs.delete(socket));
        });

        httpServer.listen(this.options.port, '0.0.0.0', () => {
            console.log(`[GUI] Agent Cockpit available at http://localhost:${this.options.port}`);
        }).on('error', (err: any) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`\n[FATAL ERROR] ポート ${this.options.port} が既に使用されています。`);
                console.error(`[INFO] ZEN KEN Agent の別のインスタンスが既に起動している可能性があります。`);
                console.error(`[INFO] タスクマネージャー等で既存のプロセスを終了するか、別のポートを指定してください。`);
                console.error(`[INFO] (既に起動している場合は、ブラウザで http://localhost:${this.options.port} を開いてください)`);
                // プロセスを終了させる前に少し待機して、ユーザーがメッセージを読めるようにする
                setTimeout(() => {
                    process.exit(0);
                }, 1000);
            } else {
                console.error(`[GUI] Server error:`, err);
            }
        });
    }

    broadcast(data: any) {
        if (data.type === 'update' && data.payload && !data.payload.activeTasks) {
            data.payload.activeTasks = this.latestActiveTasks;
        }
        const msg = JSON.stringify(data);
        this.localUIs.forEach(ui => ui.send(msg));
    }

    updateActiveTasks(tasks: any[]) {
        this.latestActiveTasks = tasks;
    }

    fullSync() {
        const payload = {
            nodeInfo: this.options.nodeInfo,
            localTasks: this.options.localTasks,
            walletStats: this.options.wallet.getStats(),
            transactions: this.options.wallet.getTransactions(),
            pendingStaging: this.options.stagingManager.getPendingTasks(),
            session: this.options.userSession,
            roiStats: this.options.getRoiStats()
        };
        this.broadcast({ type: 'update', payload });
    }
}
