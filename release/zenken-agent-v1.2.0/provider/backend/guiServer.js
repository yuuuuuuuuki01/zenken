"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GuiServer = void 0;
const ws_1 = require("ws");
const http_1 = __importDefault(require("http"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
class GuiServer {
    options;
    localUIs = new Set();
    latestActiveTasks = [];
    constructor(options) {
        this.options = options;
    }
    start() {
        const httpServer = http_1.default.createServer((req, res) => {
            const isPkg = process.pkg;
            // pkgバンドル時: assetsは __dirname基準で展面される
            // 通常: ../frontend (から provider/backend -> provider/frontend)
            const searchPaths = [
                path_1.default.join(__dirname, 'frontend'), // 1. dist/provider/backend/frontend (pkg assets ターゲット)
                path_1.default.resolve(__dirname, '../frontend'), // 2. provider/frontend (開発時: ts-nodeからの起動)
                path_1.default.resolve(__dirname, '../../provider/frontend'), // 3. distの外 (tscビルド後の dev)
                path_1.default.join(path_1.default.dirname(process.execPath), 'frontend'), // 4. EXEの隣に frontend/を配置する況備
                path_1.default.join(process.cwd(), 'frontend'), // 5. 起動ディレクトリ基準
            ];
            console.log(`[GUI] isPkg=${!!isPkg}, __dirname=${__dirname}`);
            let frontendDir = searchPaths[0]; // Default
            for (const p of searchPaths) {
                const htmlPath = path_1.default.join(p, 'index.html');
                const exists = fs_1.default.existsSync(htmlPath);
                console.log(`[GUI] Checking: ${htmlPath} -> ${exists ? 'FOUND' : 'not found'}`);
                if (exists) {
                    frontendDir = p;
                    break;
                }
            }
            console.log(`[GUI] Using frontendDir: ${frontendDir}`);
            let filePath = path_1.default.join(frontendDir, 'index.html');
            if (req.url === '/style.css')
                filePath = path_1.default.join(frontendDir, 'style.css');
            if (req.url?.startsWith('/js/')) {
                const urlPart = req.url.startsWith('/') ? req.url.substring(1) : req.url;
                filePath = path_1.default.join(frontendDir, urlPart);
            }
            if (req.url === '/favicon.ico' || req.url === '/icon.png') {
                // Find branding dir (relative to this file or baseDir)
                // We'll use process.cwd() as a fallback or assume it's in a known relative path
                const iconSearchPaths = [
                    path_1.default.join(process.cwd(), 'branding', 'icon.png'),
                    path_1.default.resolve(__dirname, '../../../branding/icon.png'),
                    path_1.default.resolve(__dirname, '../../branding/icon.png')
                ];
                let iconPath = iconSearchPaths[0];
                for (const p of iconSearchPaths) {
                    if (fs_1.default.existsSync(p)) {
                        iconPath = p;
                        break;
                    }
                }
                fs_1.default.readFile(iconPath, (err, content) => {
                    if (err) {
                        res.writeHead(404);
                        res.end();
                    }
                    else {
                        res.writeHead(200, { 'Content-Type': 'image/png' });
                        res.end(content);
                    }
                });
                return;
            }
            console.log(`[GUI] Resolved Path: ${filePath} (Source: ${frontendDir})`);
            fs_1.default.readFile(filePath, (err, content) => {
                if (err) {
                    console.error(`[GUI] Server Error: Failed to read ${filePath}. Error: ${err.message}`);
                    res.writeHead(404);
                    res.end(`File not found: ${req.url}`);
                }
                else {
                    const contentType = req.url?.endsWith('.css') ? 'text/css' :
                        req.url?.endsWith('.js') ? 'text/javascript' : 'text/html';
                    res.writeHead(200, { 'Content-Type': contentType });
                    res.end(content, 'utf-8');
                }
            });
        });
        const localWss = new ws_1.WebSocketServer({ server: httpServer });
        localWss.on('connection', (socket) => {
            this.localUIs.add(socket);
            socket.send(JSON.stringify({
                type: 'init',
                payload: {
                    nodeInfo: this.options.nodeInfo,
                    localTasks: this.options.localTasks,
                    walletStats: this.options.wallet.getStats(),
                    transactions: this.options.wallet.getTransactions(),
                    session: this.options.userSession,
                    roiStats: this.options.getRoiStats()
                }
            }));
            socket.on('message', async (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    if (message.type === 'gui_merge_task') {
                        await this.options.onMergeTask(message.payload.taskId);
                    }
                    else if (message.type === 'import_package') {
                        await this.options.onImportPackage(message.payload);
                    }
                    else if (message.type === 'wizard_pair') {
                        await this.options.onWizardPair(message.payload);
                    }
                    else if (message.type === 'get_subnodes') {
                        const subnodes = await this.options.onGetSubnodes();
                        socket.send(JSON.stringify({ type: 'subnodes_data', payload: subnodes }));
                    }
                    else if (message.type === 'create_shortcut') {
                        await this.options.onCreateShortcut();
                    }
                    else if (message.type === 'open_browser') {
                        const url = message.payload.url;
                        console.log(`[GUI] Launching external browser: ${url}`);
                        const command = process.platform === 'win32' ? `start "" "${url}"` :
                            process.platform === 'darwin' ? `open "${url}"` :
                                `xdg-open "${url}"`;
                        (0, child_process_1.exec)(command, (err) => {
                            if (err)
                                console.error('[GUI] Failed to launch external browser:', err);
                        });
                    }
                    else if (message.type === 'update_resource_limits') {
                        if (this.options.onUpdateResourceLimits) {
                            this.options.onUpdateResourceLimits(message.payload);
                        }
                    }
                }
                catch (e) {
                    console.error('[GUI] Handler error:', e);
                }
            });
            socket.on('close', () => this.localUIs.delete(socket));
        });
        httpServer.listen(this.options.port, '0.0.0.0', () => {
            console.log(`[GUI] Agent Cockpit available at http://localhost:${this.options.port}`);
        });
    }
    broadcast(data) {
        if (data.type === 'update' && data.payload && !data.payload.activeTasks) {
            data.payload.activeTasks = this.latestActiveTasks;
        }
        const msg = JSON.stringify(data);
        this.localUIs.forEach(ui => ui.send(msg));
    }
    updateActiveTasks(tasks) {
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
exports.GuiServer = GuiServer;
