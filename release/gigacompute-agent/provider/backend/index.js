"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = __importDefault(require("ws"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const index_1 = require("../../shared/src/index");
const VERSION = 'v1.2.1';
console.log(`\n==========================================`);
console.log(`  ZEN KEN Agent ${VERSION}`);
console.log(`==========================================\n`);
const wasmRuntime_1 = require("./wasmRuntime");
const encryption_1 = require("../../shared/src/encryption");
const wallet_1 = require("./wallet");
const llmClient_1 = require("./llmClient");
const biddingEngine_1 = require("./biddingEngine");
const stagingManager_1 = require("./stagingManager");
const subcontractor_1 = require("./subcontractor");
const guiServer_1 = require("./guiServer");
const axios_1 = __importDefault(require("axios"));
const adm_zip_1 = __importDefault(require("adm-zip"));
const osUtils = require("os-utils");
const SHARED_SECRET = process.env.GIGA_SHARED_SECRET || 'DEVELOPMENT_INSECURE_FALLBACK';
if (SHARED_SECRET === 'DEVELOPMENT_INSECURE_FALLBACK' && process.env.NODE_ENV === 'production') {
    console.error('[Security] CRITICAL: GIGA_SHARED_SECRET not set in production. Encryption is compromised.');
}
const DECryption_KEY = (0, encryption_1.deriveKey)(SHARED_SECRET);
// village check to avoid accidental leakage
// --- UPDATE CHECKER ---
async function checkForUpdates() {
    try {
        const res = await axios_1.default.get(`${httpApiUrl}/v1/version`);
        const latest = res.data;
        if (latest.version !== VERSION && latest.isPublic) {
            console.log(`[Update] A new version is available: ${latest.version}`);
            console.log(`[Update] Notes: ${latest.releaseNotes}`);
            // Notify GUI
            setTimeout(() => {
                broadcastToLocalUIs({
                    type: 'update_notification',
                    payload: latest
                });
            }, 3000);
        }
    }
    catch (e) {
        console.warn(`[Update] Failed to check for updates: ${e}`);
    }
}
async function performUpdate(updatePayload) {
    const isMac = process.platform === 'darwin';
    const downloadUrl = isMac ? updatePayload.macDownloadUrl : updatePayload.downloadUrl;
    // Convert relative URLs to absolute if needed
    const finalUrl = downloadUrl.startsWith('http') ? downloadUrl : `${httpApiUrl}${downloadUrl}`;
    console.log(`[Update] Starting self-update from: ${finalUrl}`);
    broadcastToLocalUIs({ type: 'update_status', payload: { status: 'downloading', version: updatePayload.version } });
    try {
        const tempZip = path_1.default.join(os_1.default.tmpdir(), `zenken-update-${Date.now()}.zip`);
        const response = await (0, axios_1.default)({
            url: finalUrl,
            method: 'GET',
            responseType: 'stream'
        });
        const writer = fs_1.default.createWriteStream(tempZip);
        response.data.pipe(writer);
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
        console.log(`[Update] Download complete. Extracting to: ${baseDir}`);
        broadcastToLocalUIs({ type: 'update_status', payload: { status: 'extracting' } });
        const zip = new adm_zip_1.default(tempZip);
        // Backup config.json and certs if they exist in the bundle but we want to keep ours
        // Actually, the bundle should contain the app code, and we should preserve the .session and config.json
        zip.extractAllTo(baseDir, true);
        console.log(`[Update] Extraction complete. Update successful.`);
        broadcastToLocalUIs({ type: 'update_status', payload: { status: 'success' } });
        // Optional: Trigger restart if running via a wrapper that auto-restarts
        setTimeout(() => {
            console.log(`[Update] System will restart now.`);
            process.exit(0);
        }, 3000);
    }
    catch (e) {
        console.error(`[Update] Update failed: ${e.message}`);
        broadcastToLocalUIs({ type: 'update_status', payload: { status: 'failed', error: e.message } });
    }
}
// [Robust Pathing] Find base directory by searching for config.json in parents
const isPkg = process.pkg;
function findBaseDir() {
    if (isPkg)
        return process.cwd();
    let current = __dirname;
    for (let i = 0; i < 5; i++) {
        if (fs_1.default.existsSync(path_1.default.join(current, 'config.json')))
            return current;
        const parent = path_1.default.dirname(current);
        if (parent === current)
            break;
        current = parent;
    }
    return process.cwd();
}
const baseDir = findBaseDir();
const keysPath = path_1.default.resolve(baseDir, 'local_node_keys.json');
let nodeKeys;
if (fs_1.default.existsSync(keysPath)) {
    nodeKeys = JSON.parse(fs_1.default.readFileSync(keysPath, 'utf8'));
    console.log(`[Trust] Loaded existing node keys from ${keysPath}`);
}
else {
    nodeKeys = (0, encryption_1.generateNodeKeypair)();
    fs_1.default.writeFileSync(keysPath, JSON.stringify(nodeKeys));
    console.log(`[Trust] Generated and saved new node keys to ${keysPath}`);
}
// [Phase 32] Session Loading
const sessionDir = path_1.default.resolve(baseDir, '.session');
if (!fs_1.default.existsSync(sessionDir))
    fs_1.default.mkdirSync(sessionDir, { recursive: true });
const sessionPath = path_1.default.resolve(sessionDir, 'session.json');
let userSession = null;
if (fs_1.default.existsSync(sessionPath)) {
    try {
        userSession = JSON.parse(fs_1.default.readFileSync(sessionPath, 'utf8'));
        console.log(`[Session] Loaded for user: ${userSession.user.email} from ${sessionPath}`);
    }
    catch (e) {
        console.warn(`[Session] Failed to load session: ${e}`);
    }
}
const args = process.argv.slice(2);
const isWin = process.platform === 'win32';
const isDebug = args.includes('--debug');
const isHidden = process.env.GIGA_HIDDEN === 'true';
const isMac = process.platform === 'darwin';
// [Phase 33] Stealth Mode: Self-hiding on Windows / Backgrounding on Mac
if ((isWin || isMac) && !isDebug && !isHidden && isPkg) {
    const { spawn } = require('child_process');
    console.log(`[Stealth] Platform ${process.platform} detected. Re-spawning in background...`);
    const child = spawn(process.execPath, args, {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, GIGA_HIDDEN: 'true' },
        windowsHide: isWin // Windows-specific
    });
    child.unref();
    process.exit(0);
}
const customId = args[0] === '--debug' ? args[1] : args[0];
const customScore = parseInt(args[0] === '--debug' ? args[2] : args[1]);
// GigaCompute Wallet (家計簿) の初期化
const wallet = new wallet_1.GigaWallet(customId || 'default-agent', baseDir);
// LLM クライアントの初期化 (ワーカー側の設定。OpenAI キーがあれば優先使用)
const llmClient = new llmClient_1.LLMClient({
    apiKey: process.env.OPENAI_API_KEY,
    provider: process.env.OPENAI_API_KEY ? 'openai' : 'mock'
});
// 入札エンジンの初期化
const biddingEngine = new biddingEngine_1.BiddingEngine({
    baseCost: 0.5,
    strategy: 'balanced'
});
// Staging 管理（減圧室）の初期化
const stagingManager = new stagingManager_1.StagingManager(process.cwd());
// 階層型供給（Subcontractor）の初期化
const subManager = new subcontractor_1.SubcontractorManager();
// Try to load auto-detected IP from config.json (同梱アセット)
// Default to the central ZenKen server URL as a baseline
let defaultConfig = { serverUrl: 'wss://gigacompute-fleet.web.app' };
try {
    const configPath = path_1.default.join(baseDir, 'config.json');
    console.log(`[Config] Looking for config at: ${configPath}`);
    if (fs_1.default.existsSync(configPath)) {
        defaultConfig = { ...defaultConfig, ...JSON.parse(fs_1.default.readFileSync(configPath, 'utf8')) };
        console.log(`[Config] Loaded serverUrl: ${defaultConfig.serverUrl}`);
        if (defaultConfig.httpApiUrl)
            console.log(`[Config] Loaded httpApiUrl: ${defaultConfig.httpApiUrl}`);
    }
    else {
        console.warn(`[Config] config.json not found at ${configPath}. Using default: ${defaultConfig.serverUrl}`);
    }
}
catch (e) {
    console.error(`[Config] Error reading config.json: ${e}`);
}
const serverUrl = process.env.SERVER_URL || (args[0] === '--debug' ? args[3] : args[2]) || defaultConfig.serverUrl;
// 本番HTTP API URL（Firebase Hosting等）。WS URLからの自動変換もフォールバックとして使用
const httpApiUrl = process.env.HTTP_API_URL || defaultConfig.httpApiUrl || serverUrl.replace('ws://', 'http://').replace('wss://', 'https://');
console.log(`[Config] HTTP API URL: ${httpApiUrl}`);
const guiPort = parseInt(args[0] === '--debug' ? args[4] : args[3]) || 3001;
const certsDir = path_1.default.join(baseDir, 'certs');
// [Security / Connectivity] If connecting to a production remote server (not localhost/127.0.0.1),
// we should NOT use the local self-signed certificates, otherwise TLS handshake will fail.
const isLocal = serverUrl.includes('localhost') || serverUrl.includes('127.0.0.1');
let agentOptions = undefined;
if (isLocal) {
    try {
        agentOptions = {
            ca: fs_1.default.readFileSync(path_1.default.join(certsDir, 'ca.crt')),
            cert: fs_1.default.readFileSync(path_1.default.join(certsDir, 'client.crt')),
            key: fs_1.default.readFileSync(path_1.default.join(certsDir, 'client.key')),
            rejectUnauthorized: false
        };
    }
    catch (e) {
        console.warn(`[Network] Local certificates not found at ${certsDir}. Connecting without them.`);
    }
}
else {
    console.log(`[Network] Connecting to production server: ${serverUrl}. Bypassing local self-signed certificates.`);
}
// --- Auto-Reconnect WebSocket ---
let ws;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 60000; // 最大60秒
let heartbeatInterval = null;
let pollingInterval = null;
function createConnection() {
    console.log(`[Network] Connecting to ${serverUrl}...`);
    const socket = isLocal ? new ws_1.default(serverUrl, agentOptions) : new ws_1.default(serverUrl);
    return socket;
}
function reconnect() {
    // 前回のインターバルをクリア
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
    reconnectAttempts++;
    const delay = Math.min(5000 * Math.pow(2, reconnectAttempts - 1), MAX_RECONNECT_DELAY);
    console.log(`[Network] Reconnecting in ${delay / 1000}s... (attempt ${reconnectAttempts})`);
    // GUI にオフライン状態を通知
    broadcastToLocalUIs({ type: 'connection_status', payload: { status: 'reconnecting', attempt: reconnectAttempts, nextRetryMs: delay } });
    setTimeout(() => {
        try {
            ws = createConnection();
            setupWsHandlers(ws);
        }
        catch (e) {
            console.error(`[Network] Failed to create connection:`, e);
            reconnect();
        }
    }, delay);
}
ws = createConnection();
// [Phase 27 Hardening] WebSocket 受信サイズ制限 (10MB)
// 巨大なパケットによる OOM 攻撃を防止
const MAX_PAYLOAD_SIZE = 10 * 1024 * 1024;
// コマンドライン引数で ID と 性能スコアを上書き可能にする (例: node index.js agent-1 80)
// ベンチマーク関数: 約500msの演算を実行し、性能をスコア化
function runBenchmark() {
    console.log('Running system benchmark...');
    const start = Date.now();
    let ops = 0;
    while (Date.now() - start < 500) {
        // CPU 集約型のダミー演算
        for (let i = 0; i < 1000; i++) {
            Math.sqrt(Math.random() * Math.random());
        }
        ops++;
    }
    // 基準値 (ops が 1500 以上を 100点と想定)
    const baseLine = 1500;
    const score = Math.min(100, Math.floor((ops / baseLine) * 100));
    console.log(`Benchmark complete. Ops: ${ops}, Score: ${score}`);
    return score;
}
const nodeInfo = {
    id: customId || `agent-${Math.random().toString(36).substr(2, 9)}`,
    type: 'agent',
    status: 'idle',
    capabilities: ['typescript-compile', 'shell-exec'],
    location: {
        lat: 35.6895 + (Math.random() - 0.5) * 10,
        lng: 139.6917 + (Math.random() - 0.5) * 10
    },
    performanceScore: customScore || runBenchmark(),
    rewardPoints: 0,
    trustScore: 100,
    publicKey: nodeKeys.publicKey, // 公開鍵を登録情報に含める
    uptimeStart: Date.now(),
    successCount: 0,
    resourceLimits: {
        cpuCores: Math.max(1, os_1.default.cpus().length - 2),
        memoryGb: Math.round(os_1.default.totalmem() / (1024 * 1024 * 1024) * 0.7)
    },
    totalCores: os_1.default.cpus().length,
    totalMemoryGb: Math.round(os_1.default.totalmem() / (1024 * 1024 * 1024))
};
// 入札価格の初期算出
nodeInfo.bidPrice = biddingEngine.calculateBidPrice(nodeInfo.trustScore, nodeInfo.performanceScore);
// --- ROI Cost Estimations ---
// Assume basic electricity cost: 30 YEN/kWh. 
// Estimate Watts based on performanceScore. (100 score = ~150W under load)
const estimatedWatts = (nodeInfo.performanceScore / 100) * 150;
// Cost per hour in YEN = (Watts / 1000) * 30
const costPerHourYen = (estimatedWatts / 1000) * 30;
// Cost per millisecond in USD (Assuming 1 USD = 150 YEN for display)
const costPerMsUsd = (costPerHourYen / 150) / (60 * 60 * 1000);
let totalApiExpenseUsd = 0; // Cumulative simulated API cost
// --- Local GUI & Activity Monitoring ---
const localTasks = [];
const latestActiveTasks = []; // Substituted by guiServer internally if needed
const guiServer = new guiServer_1.GuiServer({
    port: guiPort,
    nodeInfo,
    localTasks,
    wallet,
    stagingManager,
    userSession,
    getRoiStats: () => ({
        costPerMsUsd,
        costPerHourYen,
        totalApiExpenseUsd
    }),
    serverUrl,
    onAcceptUpdate: async (payload) => {
        await performUpdate(payload);
    },
    onUpdateSettings: async (settings) => {
        console.log(`[GUI] Settings update received:`, settings);
        // 1. Update in-memory nodeInfo
        if (settings.resourceLimits) {
            nodeInfo.resourceLimits = settings.resourceLimits;
        }
        if (settings.apiKeys) {
            // Update LLM Client
            if (settings.apiKeys.openai) {
                llmClient.updateConfig({ apiKey: settings.apiKeys.openai, provider: 'openai' });
            }
        }
        // 2. Persist to config.json
        const configPath = path_1.default.join(baseDir, 'config.json');
        let currentConfig = {};
        if (fs_1.default.existsSync(configPath)) {
            try {
                currentConfig = JSON.parse(fs_1.default.readFileSync(configPath, 'utf8'));
            }
            catch (e) { }
        }
        const updatedConfig = { ...currentConfig, ...settings };
        fs_1.default.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));
        console.log(`[Config] Persistent settings saved to ${configPath}`);
        // 3. Sync to online server
        if (ws.readyState === ws_1.default.OPEN) {
            ws.send(JSON.stringify({
                type: 'settings_sync',
                payload: {
                    nodeId: nodeInfo.id,
                    settings: updatedConfig,
                    timestamp: Date.now()
                }
            }));
            console.log(`[Sync] Settings synchronized with online server.`);
        }
        guiServer.fullSync();
    },
    onUpdateResourceLimits: (limits) => {
        nodeInfo.resourceLimits = limits;
        console.log(`[GUI] Resource limits updated: ${limits.cpuCores} cores, ${limits.memoryGb} GB`);
    },
    onMergeTask: async (taskId) => {
        console.log(`[GUI] Requested merge for task: ${taskId}`);
        await stagingManager.mergeTask(taskId, process.cwd());
        guiServer.fullSync();
    },
    onImportPackage: async (payload) => {
        const { config, ca, cert, key } = payload;
        console.log(`[GUI] Importing new package and updating credentials...`);
        const configPath = path_1.default.join(baseDir, 'config.json');
        const certsDir = path_1.default.join(baseDir, 'certs');
        if (!fs_1.default.existsSync(certsDir))
            fs_1.default.mkdirSync(certsDir, { recursive: true });
        fs_1.default.writeFileSync(configPath, JSON.stringify(config, null, 2));
        fs_1.default.writeFileSync(path_1.default.join(certsDir, 'ca.crt'), ca);
        fs_1.default.writeFileSync(path_1.default.join(certsDir, 'client.crt'), cert);
        fs_1.default.writeFileSync(path_1.default.join(certsDir, 'client.key'), key);
        console.log(`[GUI] Identity updated. Restarting...`);
        process.exit(0);
    },
    onWizardPair: async (payload) => {
        const { token } = payload;
        // [SECURITY] Validate token format to prevent injection
        if (!token || typeof token !== 'string' || !/^[a-zA-Z0-9_\-\.]+$/.test(token)) {
            console.error(`[Wizard] Rejecting invalid pairing token.`);
            return;
        }
        console.log(`[Wizard] Pairing device with token: ${token.substring(0, 8)}...`);
        // In a real scenario, we would verify this token with the server and get user data.
        // For PoC, we'll create a mock session.
        const sessionData = {
            token,
            user: { email: 'user@example.com', name: 'GigaWorker' }
        };
        const sessionDir = path_1.default.dirname(sessionPath);
        if (!fs_1.default.existsSync(sessionDir))
            fs_1.default.mkdirSync(sessionDir, { recursive: true });
        fs_1.default.writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2));
        console.log(`[Wizard] Session saved. Device paired.`);
        // Reload session in memory and sync
        userSession = sessionData;
        guiServer.updateSession(sessionData); // [FIX] Update reference in GUI server
        guiServer.fullSync();
        // [Persistence] Notify main server immediately to update DB ownerId
        if (ws.readyState === ws_1.default.OPEN) {
            const registrationPayload = { ...nodeInfo, token };
            ws.send(JSON.stringify({ type: 'register', payload: registrationPayload }));
            console.log(`[Wizard] Dynamic registration sent to main server.`);
        }
        // [HTTP Fallback] 本番環境（WS不可）でも確実に登録できるよう、HTTPでも登録する
        const httpRegPayload = { ...nodeInfo, token };
        axios_1.default.post(`${httpApiUrl}/v1/worker/node/register`, httpRegPayload, {
            headers: { 'Authorization': `Bearer ${token}` }
        }).then(r => {
            console.log(`[Wizard] HTTP registration success! Owner: ${r.data.ownerId}`);
            broadcastToLocalUIs({ type: 'registration_status', payload: { success: true, ownerId: r.data.ownerId, tokenValid: true } });
        }).catch(err => {
            console.warn(`[Wizard] HTTP registration failed: ${err.message}`);
        });
    },
    onGetSubnodes: async () => {
        return subManager.getSubnodes();
    },
    onCreateShortcut: async () => {
        const desktopPath = path_1.default.join(os_1.default.homedir(), 'Desktop');
        const targetUrl = `http://localhost:${guiPort}`;
        if (isWin) {
            const shortcutPath = path_1.default.join(desktopPath, 'ZEN KEN Agent.lnk');
            console.log(`[GUI] Creating Windows shortcut at ${shortcutPath}`);
            const iconPath = path_1.default.join(baseDir, 'branding', 'icon.ico');
            const targetBat = path_1.default.join(baseDir, 'start.bat');
            const psScript = `
$shell = New-Object -COM WScript.Shell;
$shortcut = $shell.CreateShortcut('${shortcutPath.replace(/'/g, "''")}');
$shortcut.TargetPath = '${targetBat.replace(/'/g, "''")}';
$shortcut.WorkingDirectory = '${baseDir.replace(/'/g, "''")}';
$shortcut.Description = 'ZEN KEN Agent Cockpit';
if (Test-Path '${iconPath.replace(/'/g, "''")}') { 
    $shortcut.IconLocation = '${iconPath.replace(/'/g, "''")}';
} else {
    $shortcut.IconLocation = 'msedge.exe,0';
}
$shortcut.Save();`.trim();
            require('child_process').exec(`powershell -command "${psScript.replace(/\n/g, ' ')}"`, (err) => {
                if (err) {
                    console.error("[GUI] Shortcut creation failed:", err);
                }
                else {
                    console.log("[GUI] ZEN KEN Agent shortcut created successfully.");
                    const oldPath = path_1.default.join(desktopPath, 'GigaComputeCockpit.lnk');
                    if (fs_1.default.existsSync(oldPath))
                        fs_1.default.unlinkSync(oldPath);
                }
            });
        }
        else if (isMac) {
            const appBundlePath = path_1.default.join(desktopPath, 'ZEN KEN Agent.app');
            const contentsPath = path_1.default.join(appBundlePath, 'Contents');
            const macOSPath = path_1.default.join(contentsPath, 'MacOS');
            const resourcesPath = path_1.default.join(contentsPath, 'Resources');
            console.log(`[GUI] Creating macOS App Bundle at ${appBundlePath}`);
            try {
                if (!fs_1.default.existsSync(macOSPath))
                    fs_1.default.mkdirSync(macOSPath, { recursive: true });
                if (!fs_1.default.existsSync(resourcesPath))
                    fs_1.default.mkdirSync(resourcesPath, { recursive: true });
                // 1. Executable script
                const scriptPath = path_1.default.join(macOSPath, 'launcher');
                const scriptContent = `#!/bin/bash
# ZEN KEN Agent Launcher
open -a "Google Chrome" --args "--app=${targetUrl}" || open "${targetUrl}"
`;
                fs_1.default.writeFileSync(scriptPath, scriptContent);
                fs_1.default.chmodSync(scriptPath, '755');
                // 2. Info.plist
                const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>launcher</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon.icns</string>
    <key>CFBundleIdentifier</key>
    <string>net.gigacompute.zenken.agent</string>
    <key>CFBundleName</key>
    <string>ZEN KEN Agent</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>LSUIElement</key>
    <true/>
</dict>
</plist>`;
                fs_1.default.writeFileSync(path_1.default.join(contentsPath, 'Info.plist'), plistContent);
                // 3. Icon
                const sourceIcon = path_1.default.join(baseDir, 'branding', 'AppIcon.icns');
                if (fs_1.default.existsSync(sourceIcon)) {
                    fs_1.default.copyFileSync(sourceIcon, path_1.default.join(resourcesPath, 'AppIcon.icns'));
                }
                console.log("[GUI] ZEN KEN Agent.app created successfully on Desktop.");
                const oldPath = path_1.default.join(desktopPath, 'ZEN KEN Agent.command');
                if (fs_1.default.existsSync(oldPath))
                    fs_1.default.unlinkSync(oldPath);
                const olderPath = path_1.default.join(desktopPath, 'GigaComputeCockpit.command');
                if (fs_1.default.existsSync(olderPath))
                    fs_1.default.unlinkSync(olderPath);
            }
            catch (err) {
                console.error("[GUI] macOS App Bundle creation failed:", err);
            }
        }
    },
});
function broadcastToLocalUIs(data) {
    guiServer.broadcast(data);
}
function fullSyncGUI() {
    guiServer.fullSync();
}
guiServer.start();
// [Phase 33] Auto-launch GUI in App Mode on Windows/Mac
if ((isWin || isMac) && process.env.NO_AUTO_LAUNCH !== '1') {
    // [SECURITY] Use a clean URL without any un-sanitized user-governed parameters
    const targetUrl = `http://localhost:${args[3] || 3001}`;
    console.log(`[GUI] Attempting to auto-launch Cockpit at ${targetUrl}...`);
    if (isWin) {
        // Command 1: Microsoft Edge App Mode (Standalone window feel)
        const edgeAppCmd = `start msedge --app="${targetUrl}"`;
        // Command 2: Default Browser (Fallback)
        const fallbackCmd = `start "" "${targetUrl}"`;
        require('child_process').exec(edgeAppCmd, (err) => {
            if (err) {
                console.warn("[GUI] Edge App Mode launch failed. Trying default browser...");
                require('child_process').exec(fallbackCmd);
            }
            else {
                console.log("[GUI] Auto-launch command (Edge) triggered.");
            }
        });
        // Also, create a desktop shortcut for convenience if not exists
        (async () => {
            const desktopPath = path_1.default.join(os_1.default.homedir(), 'Desktop');
            const shortcutPath = path_1.default.join(desktopPath, 'ZEN KEN Agent.lnk');
            if (!fs_1.default.existsSync(shortcutPath)) {
                console.log("[GUI] Creating initial desktop shortcut...");
                await guiServer.options?.onCreateShortcut?.();
            }
        })();
    }
    else if (isMac) {
        // Option 1: Chrome App Mode
        const chromeAppCmd = `open -n -a "Google Chrome" --args --app="${targetUrl}"`;
        // Option 2: Default Browser
        const macFallbackCmd = `open "${targetUrl}"`;
        require('child_process').exec(chromeAppCmd, (err) => {
            if (err) {
                console.warn("[GUI] Chrome App Mode launch failed. Trying default browser...");
                require('child_process').exec(macFallbackCmd);
            }
            else {
                console.log("[GUI] Auto-launch command (Chrome) triggered.");
            }
        });
        // Create initial shortcut for Mac
        (async () => {
            const desktopPath = path_1.default.join(os_1.default.homedir(), 'Desktop');
            const shortcutPath = path_1.default.join(desktopPath, 'ZEN KEN Agent.command');
            if (!fs_1.default.existsSync(shortcutPath)) {
                await guiServer.options?.onCreateShortcut?.();
            }
        })();
    }
}
// Local Auditor (検問所 1)
function runLocalAuditor(wasmBuffer) {
    // 簡易的なバイナリ内文字列スキャン (PoC レベル: 実質的な効果は低いが可視性のため)
    const wasmStr = wasmBuffer.toString('binary');
    const suspiciousPatterns = ['socket', 'fetch', 'XMLHttpRequest', 'process', 'child_process'];
    for (const pattern of suspiciousPatterns) {
        if (wasmStr.includes(pattern)) {
            console.warn(`[Security Alert] Suspicious pattern found in Wasm: ${pattern}`);
        }
    }
    if (wasmBuffer.length < 10) {
        throw new Error("Wasm payload too small, potential malicious intent detected by Local Auditor.");
    }
}
// [Phase 33] Progress Visualization
function sendStepUpdate(taskId, step, details) {
    if (ws.readyState === ws_1.default.OPEN) {
        ws.send(JSON.stringify({
            type: 'gui_update_task_step',
            payload: { taskId, step, details }
        }));
    }
}
// GUI Server removed (Now in guiServer.ts)
// ----------------------------------------
// ----------------------------------------
function setupWsHandlers(ws) {
    ws.on('open', () => {
        console.log(`Agent ${nodeInfo.id} [v1.1-E2EE] connected. Score: ${nodeInfo.performanceScore}`);
        console.log(`[Trust] My Public Key snapshot: ${nodeKeys.publicKey.substring(0, 40)}...`);
        // 接続成功時にリコネクトカウンターをリセット
        reconnectAttempts = 0;
        broadcastToLocalUIs({ type: 'connection_status', payload: { status: 'connected' } });
        // Add token to nodeInfo if available
        const registrationPayload = { ...nodeInfo, token: userSession?.token };
        ws.send(JSON.stringify({ type: 'register', payload: registrationPayload }));
        // [HTTP Fallback] 本番環境ではWSが通らないためHTTP経由でも登録する
        if (userSession?.token) {
            axios_1.default.post(`${httpApiUrl}/v1/worker/node/register`, registrationPayload, {
                headers: { 'Authorization': `Bearer ${userSession.token}` }
            }).then(r => {
                console.log(`[HTTP] Node registered via HTTP (Owner: ${r.data.ownerId})`);
            }).catch(err => {
                console.warn(`[HTTP] HTTP node registration failed: ${err.message}`);
            });
        }
        checkForUpdates();
        // Start Signed Heartbeat with Resource Monitoring
        heartbeatInterval = setInterval(() => {
            if (ws.readyState === ws_1.default.OPEN) {
                osUtils.cpuUsage((v) => {
                    const timestamp = Date.now();
                    const cpuUsage = Math.round(v * 100);
                    const freeMem = osUtils.freemem();
                    const totalMem = osUtils.totalmem();
                    const memUsage = Math.round(((totalMem - freeMem) / totalMem) * 100);
                    const dataToSign = (0, index_1.canonicalStringify)({
                        nodeId: nodeInfo.id,
                        status: nodeInfo.status,
                        timestamp,
                        cpuUsage,
                        memUsage
                    });
                    const signature = (0, encryption_1.signResult)(Buffer.from(dataToSign), nodeKeys.privateKey).toString('base64');
                    ws.send(JSON.stringify({
                        type: 'status_update',
                        payload: {
                            nodeId: nodeInfo.id,
                            status: nodeInfo.status,
                            timestamp,
                            signature,
                            cpuUsage,
                            memUsage
                        }
                    }));
                });
            }
        }, 30000); // Every 30 seconds
        // [Phase 38] Distributed Task Polling Loop
        pollingInterval = setInterval(async () => {
            if (!userSession?.token || nodeInfo.status !== 'idle')
                return;
            try {
                const response = await axios_1.default.post(`${httpApiUrl}/v1/worker/task/fetch`, {}, {
                    headers: { 'Authorization': `Bearer ${userSession.token}` }
                });
                if (response.status === 200 && response.data?.task) {
                    const chunkedTask = response.data.task;
                    console.log(`[Chunk Pool] Fetched task ${chunkedTask.id} (Chunk ${chunkedTask.chunkIndex + 1}/${chunkedTask.totalChunks})`);
                    nodeInfo.status = 'busy';
                    const taskEntry = {
                        taskId: chunkedTask.id,
                        type: 'chunk_compute',
                        status: 'processing',
                        startTime: Date.now()
                    };
                    localTasks.unshift(taskEntry);
                    if (localTasks.length > 20)
                        localTasks.pop();
                    guiServer.fullSync();
                    // Mock Execution (Simulating LLM or Code Analysis on the chunk)
                    const delay = Math.max(1000, 3000 - (nodeInfo.performanceScore * 10)); // Variable processing time
                    console.log(`[Chunk Compute] Processing... (Simulating ~${delay}ms compute time)`);
                    await new Promise(r => setTimeout(r, delay));
                    // Submit Result
                    const mockResult = `Processed Output for chunk ${chunkedTask.chunkIndex}: "${chunkedTask.code.substring(0, 30)}..."`;
                    await axios_1.default.post(`${httpApiUrl}/v1/worker/task/result`, {
                        taskId: chunkedTask.id,
                        result: mockResult,
                        score: 95
                    }, {
                        headers: { 'Authorization': `Bearer ${userSession.token}` }
                    });
                    console.log(`[Chunk Pool] Result successfully submitted for ${chunkedTask.id}`);
                    // Add minor pseudo-reward locally
                    wallet.addIncome(chunkedTask.id, 1);
                    taskEntry.status = 'completed';
                    taskEntry.duration = Date.now() - taskEntry.startTime;
                    // Record the resource snapshot at the time of completion
                    taskEntry.resources = { ...nodeInfo.resourceLimits };
                    nodeInfo.status = 'idle';
                    guiServer.fullSync();
                }
            }
            catch (e) {
                // Ignore connection refused / generic errors for clean console during idle
                if (e.code !== 'ECONNREFUSED') {
                    // console.error(`[Chunk Pool] Polling error: ${e.message}`);
                }
            }
        }, 5000); // Poll every 5 seconds
    });
    ws.on('message', async (data) => {
        // 受信パケットのサイズチェック
        if (data.toString().length > MAX_PAYLOAD_SIZE) {
            console.error(`[Security] Payload bombardment detected! Size: ${data.toString().length}. Closing connection.`);
            ws.close(1009, 'Message too large');
            return;
        }
        const message = JSON.parse(data.toString());
        console.log(`[${nodeInfo.id}] >>> Received message: type=${message.type}`);
        if (message.type === 'registration_result') {
            const { success, ownerId, tokenValid, error } = message.payload;
            if (success) {
                console.log(`[${nodeInfo.id}] Registration confirmed! Owner: ${ownerId} (Token valid: ${tokenValid})`);
                if (!tokenValid && userSession?.token) {
                    console.warn(`[${nodeInfo.id}] [WARNING] Pairing token is INVAlID or EXPIRED. Connected as 'system'. Please re-pair in Cockpit.`);
                }
                // Notify local UI
                broadcastToLocalUIs({ type: 'registration_status', payload: message.payload });
            }
            else {
                console.error(`[${nodeInfo.id}] Registration FAILED: ${error}`);
            }
            return;
        }
        if (message.type === 'auction_invite') {
            const task = message.payload;
            const bidPrice = biddingEngine.calculateBidPrice(nodeInfo.trustScore || 50, nodeInfo.performanceScore || 50);
            global.pendingAuctionTasks = global.pendingAuctionTasks || new Map();
            global.pendingAuctionTasks.set(task.taskId, task);
            ws.send(JSON.stringify({ type: 'auction_bid', payload: { taskId: task.taskId, bidPrice } }));
            console.log(`[${nodeInfo.id}] Sent auction bid for task ${task.taskId} with price ${bidPrice.toFixed(2)} PTS`);
            return;
        }
        if (message.type === 'task_request' || message.type === 'task_award') {
            let task = message.payload;
            if (message.type === 'task_award') {
                const pending = global.pendingAuctionTasks?.get(message.payload.taskId);
                if (!pending) {
                    console.error(`[${nodeInfo.id}] Received award for unknown task ${message.payload.taskId}`);
                    return;
                }
                task = pending;
                global.pendingAuctionTasks.delete(task.taskId);
            }
            console.log(`[${nodeInfo.id}] Handling task/award: ${task.taskId} from ${task.requesterId} (Type: ${task.type})`);
            nodeInfo.status = 'busy';
            const taskEntry = { ...task, startTime: Date.now(), status: 'processing' };
            localTasks.unshift(taskEntry);
            if (localTasks.length > 20)
                localTasks.pop();
            broadcastToLocalUIs({ type: 'update', payload: { nodeInfo, localTasks } });
            // [Phase 33] Start Processing
            sendStepUpdate(task.taskId, 'processing', 'Executing Wasm in isolated environment.');
            try {
                let result;
                if (task.type === 'wasm') {
                    // Wasm 隔離実行
                    let wasmBuffer = Buffer.from(task.payload.wasm, 'base64');
                    // [検問所 1] Local Auditor による事前監査
                    console.log(`[${nodeInfo.id}] [Auditor] Auditing Wasm payload...`);
                    runLocalAuditor(wasmBuffer);
                    console.log(`[${nodeInfo.id}] [Auditor] Audit passed.`);
                    // もし暗号化メタデータがある場合は復号を実行
                    if (task.encryption) {
                        console.log(`[${nodeInfo.id}] Decrypting task payload...`);
                        const iv = Buffer.from(task.encryption.iv, 'base64');
                        const authTag = Buffer.from(task.encryption.authTag, 'base64');
                        wasmBuffer = (0, encryption_1.decrypt)(wasmBuffer, DECryption_KEY, iv, authTag);
                        console.log(`[${nodeInfo.id}] Decryption successful.`);
                    }
                    console.log("WAITING FOR WASM EXECUTION..."); // 復号された Wasm を実行環境へ
                    // [Phase 28] Recursive Delegation (孫請け)
                    // 仕事の重さに応じて、さらに下位のワーカーにタスクを分割・委託する
                    if (task.complexityScore && task.complexityScore > 0.3) {
                        console.log(`[Recursive] Task ${task.taskId} Complexity ${task.complexityScore.toFixed(2)} is high. Spawning sub-task...`);
                        const subTask = {
                            taskId: `${task.taskId}-sub`,
                            parentId: task.taskId,
                            type: 'wasm',
                            payload: { wasm: task.payload.wasm, functionName: 'sub_logic', args: [] },
                            requesterId: nodeInfo.id,
                            deposit: Math.floor(task.deposit / 2) // デポジットも半分委託
                        };
                        ws.send(JSON.stringify({ type: 'task_request', payload: subTask }));
                    }
                    // [Delegated Reasoning] Wasm 実行中のコストイベントと推論リクエストを監視
                    const wasmOutput = await (0, wasmRuntime_1.executeWasmTask)(wasmBuffer, task.payload.functionName, task.payload.args || [], task.secrets, (expenseMsg) => {
                        console.log(`[Economy] Charging API cost: ${expenseMsg.amount} via ${expenseMsg.provider}`);
                        wallet.addExpense(task.taskId, expenseMsg.amount, expenseMsg.provider);
                        fullSyncGUI();
                    }, async (llmReq) => {
                        console.log(`[Bridge] LLM Request from Wasm: "${llmReq.prompt}"`);
                        const llmRes = await llmClient.ask({ prompt: llmReq.prompt });
                        if (llmRes.error) {
                            console.error(`[Bridge] LLM Error: ${llmRes.error}`);
                        }
                        else {
                            console.log(`[Bridge] LLM Response: "${llmRes.text.substring(0, 50)}..."`);
                            // 推論成功時にコストを計上 (PoC 固定 0.5pts)
                            wallet.addExpense(task.taskId, 0.5, 'Worker LLM Bridge');
                            fullSyncGUI();
                        }
                    });
                    result = wasmOutput.result;
                    // [Phase 20] Cascading Delegation (階層型供給)
                    if (subManager.shouldDelegate(task)) {
                        sendStepUpdate(task.taskId, 'processing', 'Delegating sub-parts to Cascading Nodes (Smartphones)...');
                        try {
                            const subRes = await subManager.delegate(task);
                            console.log(`[Cascading] Received response from subnode: ${subRes.workerId}`);
                            // In real flow, we combine result. For PoC, we augment result.
                            result = { original: result, cascading: subRes.result };
                        }
                        catch (e) {
                            console.warn("[Cascading] Delegation failed, proceeding with local compute only.");
                        }
                    }
                    // [Phase 20] もし Wasm からファイル成果物があれば、ローカル Staging に保存
                    if (wasmOutput.files.length > 0) {
                        console.log(`[Staging] Wasm produced ${wasmOutput.files.length} files. Staging locally...`);
                        await stagingManager.stageResult(task.taskId, wasmOutput.files);
                        // [Phase 33] Staged
                        sendStepUpdate(task.taskId, 'staged', `${wasmOutput.files.length} files staged in decompression chamber.`);
                        // result オブジェクトに files を含めて、依頼側にも送れるようにする
                        result = {
                            code: wasmOutput.result,
                            files: wasmOutput.files
                        };
                    }
                    // Simulate API call cost (e.g., $0.005 per task)
                    totalApiExpenseUsd += 0.005;
                    // Sync UI state locally
                    guiServer.fullSync();
                    function syncGUI() {
                        broadcastToLocalUIs({
                            type: 'update',
                            payload: {
                                nodeInfo,
                                localTasks,
                                activeTasks: latestActiveTasks // [Phase 33]
                            }
                        });
                    }
                    console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
                    console.log("! WASM FINAL RESULT:", result);
                    console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
                }
                else {
                    // 従来のシミュレート
                    console.log(`[DEBUG] Entering simulation branch. Calculating delay...`);
                    const delay = Math.max(500, 3000 - (nodeInfo.performanceScore * 20));
                    console.log(`[DEBUG] Awaiting ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    console.log(`[DEBUG] Await finished.`);
                    result = `Result from ${nodeInfo.id}`;
                }
                console.log(`[DEBUG] Creating response object...`);
                const response = {
                    taskId: task.taskId,
                    status: 'success',
                    result: result,
                    workerId: nodeInfo.id
                };
                // Node Trust Protocol: 結果に対する署名
                // Node Trust Protocol: 結果に対する署名
                // Node Trust Protocol: 結果に対する署名
                console.log(`[${nodeInfo.id}] Signing result for Node Trust Protocol...`);
                // [Phase 27] Use canonicalStringify to match server-side verification
                const dataToSign = typeof result === 'string' ? result : (0, index_1.canonicalStringify)(result);
                const signature = (0, encryption_1.signResult)(Buffer.from(dataToSign), nodeKeys.privateKey);
                response.signature = signature.toString('base64');
                ws.send(JSON.stringify({ type: 'task_response', payload: response }));
                taskEntry.status = 'completed';
                // [Phase 33] Verified
                sendStepUpdate(task.taskId, 'verified', 'Task signed and response sent to server.');
                // 報酬の記録 (PoC 用に固定値 10 ポイント)
                wallet.addIncome(task.taskId, 10);
                broadcastToLocalUIs({
                    type: 'update',
                    payload: {
                        nodeInfo,
                        localTasks,
                        walletStats: wallet.getStats(),
                        transactions: wallet.getTransactions()
                    }
                });
            }
            catch (error) {
                console.error(`\n[CRITICAL ERROR] Task ${task.taskId} FAILED`);
                console.error(`Error Type: ${error.constructor.name}`);
                console.error(`Message: ${error.message}`);
                if (error.stack)
                    console.error(`Stack: ${error.stack}\n`);
                const response = {
                    taskId: task.taskId,
                    status: 'failed',
                    result: error.message,
                    workerId: nodeInfo.id
                };
                ws.send(JSON.stringify({ type: 'task_response', payload: response }));
                taskEntry.status = 'failed';
                taskEntry.error = error.message;
                // [Phase 33] Failed
                sendStepUpdate(task.taskId, 'failed', error.message);
            }
            nodeInfo.status = 'idle';
            taskEntry.duration = Date.now() - taskEntry.startTime;
            fullSyncGUI();
            console.log(`[${nodeInfo.id}] Task ${task.taskId} finished.`);
        }
        else if (message.type === 'task_response') {
            const res = message.payload;
            console.log(`[Requester] Task ${res.taskId} completed. Status: ${res.status}`);
            try {
                // [Phase 20] 成果物（files: {path, content}[]）があれば減圧室へ保存
                if (res.result && res.result.files) {
                    console.log(`[Requester] Found ${res.result.files.length} files to stage.`);
                    await stagingManager.stageResult(res.taskId, res.result.files);
                    console.log(`[Requester] Result staged in .gigacompute/staging/${res.taskId}. Please verify on host before merge.`);
                }
                fullSyncGUI();
            }
            catch (err) {
                console.error(`[Requester] [CRITICAL] Failed to stage or sync result: ${err.message}`);
                if (err.stack)
                    console.error(err.stack);
            }
        }
        else if (message.type === 'system_state') {
            try {
                const myInfo = message.payload.nodes.find((n) => n.id === nodeInfo.id);
                if (myInfo && (myInfo.rewardPoints !== nodeInfo.rewardPoints || myInfo.trustScore !== nodeInfo.trustScore)) {
                    console.log(`[${nodeInfo.id}] State updated! Total: ${myInfo.rewardPoints} pts, Trust: ${myInfo.trustScore}`);
                    nodeInfo.rewardPoints = myInfo.rewardPoints;
                    nodeInfo.trustScore = myInfo.trustScore;
                }
                guiServer.updateActiveTasks(message.payload.activeTasks || []);
                fullSyncGUI();
            }
            catch (err) {
                console.error(`[${nodeInfo.id}] System state update failed: ${err.message}`);
            }
        }
    });
    ws.on('close', (code, reason) => {
        console.log(`Agent ${nodeInfo.id} disconnected. Code: ${code}, Reason: ${reason?.toString() || 'none'}`);
        nodeInfo.status = 'idle';
        broadcastToLocalUIs({ type: 'connection_status', payload: { status: 'disconnected', code } });
        reconnect();
    });
    ws.on('error', (err) => {
        console.error(`[Network] WebSocket error: ${err.message}`);
        // エラーロギングのみ。close イベントが自動的に発火し、reconnect() が呼ばれる
    });
} // end setupWsHandlers
// 初回接続のハンドラ設定
setupWsHandlers(ws);
