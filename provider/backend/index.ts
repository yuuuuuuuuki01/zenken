import WebSocket, { WebSocketServer } from 'ws';
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { NodeInfo, TaskRequest, TaskResponse, TaskStep, canonicalStringify } from '../../shared/src/index';
const VERSION = 'v1.3.2';
console.log(`\n==========================================`);
console.log(`  ZEN KEN Agent ${VERSION}`);
console.log(`==========================================\n`);
import { executeWasmTask } from './wasmRuntime';
import { createTaskSandboxPolicy } from './sandboxPolicy';
import { decrypt, deriveKey, signResult, generateNodeKeypair } from '../../shared/src/encryption';
import { GigaWallet } from './wallet';
import { LLMClient } from './llmClient';
import { BiddingEngine } from './biddingEngine';
import { StagingManager } from './stagingManager';
import { SubcontractorManager } from './subcontractor';
import { GuiServer } from './guiServer';
import axios from 'axios';
import AdmZip from 'adm-zip';
import osUtils = require('os-utils');

const SHARED_SECRET = process.env.GIGA_SHARED_SECRET || 'DEVELOPMENT_INSECURE_FALLBACK';
if (SHARED_SECRET === 'DEVELOPMENT_INSECURE_FALLBACK' && process.env.NODE_ENV === 'production') {
    console.error('[Security] CRITICAL: GIGA_SHARED_SECRET not set in production. Encryption is compromised.');
}
const DECryption_KEY = deriveKey(SHARED_SECRET);
// village check to avoid accidental leakage

//village check to avoid accidental leakage

// [Robust Pathing] Find base directory
const isPkg = (process as any).pkg;
function findBaseDir(): string {
    if (isPkg) {
        // パッケージ版の場合：実行ファイル（.exe）があるディレクトリをベースとする
        return path.dirname(process.execPath);
    }
    // 非パッケージ（開発時）: config.json がある場所を探す
    let current = __dirname;
    for (let i = 0; i < 5; i++) {
        if (fs.existsSync(path.join(current, 'config.json'))) return current;
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
    }
    return process.cwd();
}
const baseDir = findBaseDir();
const keysPath = path.resolve(baseDir, 'local_node_keys.json');
let nodeKeys: any;

if (fs.existsSync(keysPath)) {
    nodeKeys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
    console.log(`[Trust] Loaded existing node keys from ${keysPath}`);
} else {
    nodeKeys = generateNodeKeypair();
    fs.writeFileSync(keysPath, JSON.stringify(nodeKeys));
    console.log(`[Trust] Generated and saved new node keys to ${keysPath}`);
}

// [Phase 32] Session Loading
const sessionDir = path.resolve(baseDir, '.session');
if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
const sessionPath = path.resolve(sessionDir, 'session.json');
let userSession: any = null;
if (fs.existsSync(sessionPath)) {
    try {
        userSession = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
        console.log(`[Session] Loaded for user: ${userSession.user.email} from ${sessionPath}`);
    } catch (e) {
        console.warn(`[Session] Failed to load session: ${e}`);
    }
}

const args = process.argv.slice(2);
const isWin = process.platform === 'win32';
const isDebug = args.includes('--debug');
const isNoStealth = args.includes('--no-stealth');
const isHidden = process.env.GIGA_HIDDEN === 'true';

const isMac = process.platform === 'darwin';

// [Phase 33] Stealth Mode: Self-hiding on Windows / Backgrounding on Mac
if ((isWin || isMac) && !isDebug && !isHidden && isPkg && process.env.NO_AUTO_LAUNCH !== '1') {
    const { spawn } = require('child_process');

    console.log(`\n[System] ZEN KEN Agent をバックグラウンドで起動しています...`);
    console.log(`[System] 設定ファイル: ${path.join(baseDir, 'config.json')}`);
    console.log(`[System] セッション情報: ${sessionPath}`);
    console.log(`[System] ログを確認するには --debug 引数を付けて起動してください。\n`);
    console.log(`[Stealth] Platform ${process.platform} detected. Re-spawning in background...`);

    const logPath = path.join(baseDir, 'agent.log');
    const out = fs.openSync(logPath, 'a');
    const err = fs.openSync(logPath, 'a');

    const child = spawn(process.execPath, args, {
        detached: true,
        stdio: ['ignore', out, err],
        env: { ...process.env, GIGA_HIDDEN: 'true', NO_AUTO_LAUNCH: '0' },
        windowsHide: isWin // Windows-specific
    });

    child.unref();

    if (isDebug || isNoStealth) {
        console.log(`\n[Debug] バックグラウンドプロセスが起動しました (PID: ${child.pid})`);
        console.log(`[Debug] ターミナルを維持しています。終了するには Enter キーを押してください...`);

        const rl = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question('', () => {
            rl.close();
            process.exit(0);
        });
    } else {
        // プロセスを終了させる前に少し待機して、ユーザーがメッセージを読めるようにする
        setTimeout(() => {
            process.exit(0);
        }, 1000);
    }
} else {
    // Top-level error handling wrapper to keep terminal open on crash
    (async () => {
        try {
            await main();
        } catch (fatalError: any) {
            console.error(`\n[FATAL CRASH] アプリケーションが異常終了しました:`);
            console.error(`Message: ${fatalError.message}`);
            if (fatalError.stack) console.error(`Stack: ${fatalError.stack}`);

            console.log(`\n[System] ターミナルを維持しています。エラー内容を確認してください。`);
            console.log(`[System] 終了するにはこのウィンドウを閉じるか、何かキーを押してください...`);

            const rl = require('readline').createInterface({
                input: process.stdin,
                output: process.stdout
            });
            rl.question('', () => { process.exit(1); });
        }
    })();
}

async function main() {
    const customId = isDebug ? args[args.indexOf('--debug') + 1] : args[0];
    const customScore = parseInt(isDebug ? args[args.indexOf('--debug') + 2] : args[1]);

    // GigaCompute Wallet (家計簿) の初期化
    const wallet = new GigaWallet(customId || 'default-agent', baseDir);

    // LLM クライアントの初期化 (ワーカー側の設定。OpenAI キーがあれば優先使用)
    const llmClient = new LLMClient({
        apiKey: process.env.OPENAI_API_KEY,
        provider: process.env.OPENAI_API_KEY ? 'openai' : 'mock'
    });

    // 入札エンジンの初期化
    const biddingEngine = new BiddingEngine({
        baseCost: 0.5,
        strategy: 'balanced'
    });

    // Staging 管理（減圧室）の初期化
    const stagingManager = new StagingManager(process.cwd());
    // 階層型供給（Subcontractor）の初期化
    const subManager = new SubcontractorManager();

    // Try to load auto-detected IP from config.json (同梱アセット または 実行ファイルと同階層)
    let defaultConfig: { serverUrl: string, httpApiUrl?: string, name?: string } = { serverUrl: 'wss://gigacompute-fleet.web.app' };
    try {
        // 1. 実行ファイルと同じディレクトリの config.json (最優先)
        // 2. pkg 内部に同梱された config.json (フォールバック)
        const externalConfigPath = path.join(baseDir, 'config.json');
        const internalConfigPath = path.join(__dirname, 'config.json');

        let configPathToUse = null;
        if (fs.existsSync(externalConfigPath)) {
            configPathToUse = externalConfigPath;
        } else if (isPkg && fs.existsSync(internalConfigPath)) {
            configPathToUse = internalConfigPath;
        }

        if (configPathToUse) {
            console.log(`[Config] Reading config from: ${configPathToUse}`);
            defaultConfig = { ...defaultConfig, ...JSON.parse(fs.readFileSync(configPathToUse, 'utf8')) };
            console.log(`[Config] Loaded serverUrl: ${defaultConfig.serverUrl}`);
            if (defaultConfig.httpApiUrl) console.log(`[Config] Loaded httpApiUrl: ${defaultConfig.httpApiUrl}`);
        } else {
            console.warn(`[Config] config.json not found. Using default: ${defaultConfig.serverUrl}`);
        }
    } catch (e) {
        console.error(`[Config] Error reading config.json: ${e}`);
    }

    const serverUrl = process.env.SERVER_URL || (isDebug ? args[args.indexOf('--debug') + 3] : args[2]) || defaultConfig.serverUrl;
    // 本番HTTP API URL（Firebase Hosting等）。WS URLからの自動変換もフォールバックとして使用
    const httpApiUrl = process.env.HTTP_API_URL || defaultConfig.httpApiUrl || serverUrl.replace('ws://', 'http://').replace('wss://', 'https://');
    console.log(`[Config] HTTP API URL: ${httpApiUrl}`);
    const guiPort = parseInt(isDebug ? args[args.indexOf('--debug') + 4] : args[3]) || 3001;

    const certsDir = path.join(baseDir, 'certs');

    // [Security / Connectivity] If connecting to a production remote server (not localhost/127.0.0.1),
    // we should NOT use the local self-signed certificates, otherwise TLS handshake will fail.
    const isLocal = serverUrl.includes('localhost') || serverUrl.includes('127.0.0.1');

    let agentOptions: any = undefined;
    if (isLocal) {
        try {
            agentOptions = {
                ca: fs.readFileSync(path.join(certsDir, 'ca.crt')),
                cert: fs.readFileSync(path.join(certsDir, 'client.crt')),
                key: fs.readFileSync(path.join(certsDir, 'client.key')),
                rejectUnauthorized: false
            };
        } catch (e) {
            console.warn(`[Network] Local certificates not found at ${certsDir}. Connecting without them.`);
        }
    } else {
        console.log(`[Network] Connecting to production server: ${serverUrl}. Bypassing local self-signed certificates.`);
    }

    // --- Auto-Reconnect WebSocket ---
    let ws: WebSocket;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_DELAY = 60000; // 最大60秒
    let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
    let pollingInterval: ReturnType<typeof setInterval> | null = null;

    // --- UPDATE CHECKER ---
    async function checkForUpdates() {
        try {
            const res = await axios.get(`${httpApiUrl}/v1/version`);
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
        } catch (e) {
            console.warn(`[Update] Failed to check for updates: ${e}`);
        }
    }

    async function performUpdate(updatePayload: any) {
        const isMac = process.platform === 'darwin';
        const downloadUrl = isMac ? updatePayload.macDownloadUrl : updatePayload.downloadUrl;

        // Convert relative URLs to absolute if needed
        const finalUrl = downloadUrl.startsWith('http') ? downloadUrl : `${httpApiUrl}${downloadUrl}`;

        console.log(`[Update] Starting self-update from: ${finalUrl}`);
        broadcastToLocalUIs({ type: 'update_status', payload: { status: 'downloading', version: updatePayload.version } });

        try {
            const tempZip = path.join(os.tmpdir(), `zenken-update-${Date.now()}.zip`);
            const response = await axios({
                url: finalUrl,
                method: 'GET',
                responseType: 'stream'
            });

            const writer = fs.createWriteStream(tempZip);
            response.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            console.log(`[Update] Download complete. Extracting to: ${baseDir}`);
            broadcastToLocalUIs({ type: 'update_status', payload: { status: 'extracting' } });

            const zip = new AdmZip(tempZip);
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

        } catch (e: any) {
            console.error(`[Update] Update failed: ${e.message}`);
            broadcastToLocalUIs({ type: 'update_status', payload: { status: 'failed', error: e.message } });
        }
    }

    function createConnection(): WebSocket {
        console.log(`[Network] Connecting to ${serverUrl}...`);
        const socket = isLocal ? new WebSocket(serverUrl, agentOptions) : new WebSocket(serverUrl);
        return socket;
    }

    function reconnect() {
        // 前回のインターバルをクリア
        if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
        if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }

        reconnectAttempts++;
        const delay = Math.min(5000 * Math.pow(2, reconnectAttempts - 1), MAX_RECONNECT_DELAY);
        console.log(`[Network] Reconnecting in ${delay / 1000}s... (attempt ${reconnectAttempts})`);

        // GUI にオフライン状態を通知
        broadcastToLocalUIs({ type: 'connection_status', payload: { status: 'reconnecting', attempt: reconnectAttempts, nextRetryMs: delay } });

        setTimeout(() => {
            try {
                ws = createConnection();
                setupWsHandlers(ws);
            } catch (e) {
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
    function runBenchmark(): number {
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

    const nodeInfo: NodeInfo = {
        id: customId || `agent-${Math.random().toString(36).substr(2, 9)}`,
        name: defaultConfig.name || os.hostname(),
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
            cpuCores: Math.max(1, os.cpus().length - 2),
            memoryGb: Math.round(os.totalmem() / (1024 * 1024 * 1024) * 0.7)
        },
        totalCores: os.cpus().length,
        totalMemoryGb: Math.round(os.totalmem() / (1024 * 1024 * 1024))
    };

    // 入札価格の初期算出
    (nodeInfo as any).bidPrice = biddingEngine.calculateBidPrice(nodeInfo.trustScore, nodeInfo.performanceScore);

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
    const localTasks: any[] = [];
    const latestActiveTasks: any[] = []; // Substituted by guiServer internally if needed

    const guiServer = new GuiServer({
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
            if (settings.name) {
                nodeInfo.name = settings.name;
            }
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
            const configPath = path.join(baseDir, 'config.json');
            let currentConfig: any = {};
            if (fs.existsSync(configPath)) {
                try { currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) { }
            }
            const updatedConfig = { ...currentConfig, ...settings };
            fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));
            console.log(`[Config] Persistent settings saved to ${configPath}`);

            // 3. Sync to online server
            if (ws.readyState === WebSocket.OPEN) {
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
            const configPath = path.join(baseDir, 'config.json');
            const certsDir = path.join(baseDir, 'certs');
            if (!fs.existsSync(certsDir)) fs.mkdirSync(certsDir, { recursive: true });
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            fs.writeFileSync(path.join(certsDir, 'ca.crt'), ca);
            fs.writeFileSync(path.join(certsDir, 'client.crt'), cert);
            fs.writeFileSync(path.join(certsDir, 'client.key'), key);
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
            // For PoC, we'll create a mock session, but remove the hardcoded dummy email.
            const sessionData = {
                token,
                user: { email: '', name: 'GigaWorker' }
            };
            const sessionDir = path.dirname(sessionPath);
            if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
            fs.writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2));

            console.log(`[Wizard] Session saved. Device paired.`);
            // Reload session in memory and sync
            userSession = sessionData;
            guiServer.updateSession(sessionData); // [FIX] Update reference in GUI server
            guiServer.fullSync();

            // [Persistence] Notify main server immediately to update DB ownerId
            if (ws.readyState === WebSocket.OPEN) {
                const registrationPayload = { ...nodeInfo, token };
                ws.send(JSON.stringify({ type: 'register', payload: registrationPayload }));
                console.log(`[Wizard] Dynamic registration sent to main server.`);
            }

            // [HTTP Fallback] 本番環境（WS不可）でも確実に登録できるよう、HTTPでも登録する
            const httpRegPayload = { ...nodeInfo, token };
            axios.post(`${httpApiUrl}/v1/worker/node/register`, httpRegPayload, {
                headers: { 'Authorization': `Bearer ${token}` }
            }).then(r => {
                console.log(`[Wizard] HTTP registration success! Owner: ${r.data.ownerId}`);
                broadcastToLocalUIs({
                    type: 'registration_status',
                    payload: {
                        success: true,
                        ownerId: r.data.ownerId,
                        tokenValid: true,
                        details: 'Successfully synchronized with production server.'
                    }
                });
            }).catch(err => {
                console.warn(`[Wizard] HTTP registration failed: ${err.message}`);
                broadcastToLocalUIs({
                    type: 'registration_status',
                    payload: {
                        success: false,
                        error: 'Sync Failed',
                        details: `Network error during production sync: ${err.message}`
                    }
                });
            });
        },
        onGetSubnodes: async () => {
            return subManager.getSubnodes();
        },
        onCreateShortcut: async () => {
            const desktopPath = path.join(os.homedir(), 'Desktop');
            const targetUrl = `http://localhost:${guiPort}`;

            console.log(`[Shortcut] Request to create shortcut. Platform: ${process.platform}, isPkg: ${!!isPkg}`);

            if (isWin) {
                const shortcutPath = path.join(desktopPath, 'ZEN KEN Agent.lnk');
                console.log(`[Shortcut] Target path: ${shortcutPath}`);

                // branding/icon.ico is relative to the baseDir usually, 
                // but in pkg it might be different.
                const iconPath = isPkg ? path.join(path.dirname(process.execPath), 'branding', 'icon.ico') : path.join(baseDir, 'branding', 'icon.ico');
                const targetBat = isPkg ? process.execPath : path.join(baseDir, 'start.bat');
                const workingDir = isPkg ? path.dirname(process.execPath) : baseDir;

                console.log(`[Shortcut] Icon: ${iconPath}, Target: ${targetBat}, Cwd: ${workingDir}`);

                const psScript = `
$shell = New-Object -COM WScript.Shell;
$shortcut = $shell.CreateShortcut('${shortcutPath.replace(/'/g, "''")}');
$shortcut.TargetPath = '${targetBat.replace(/'/g, "''")}';
$shortcut.WorkingDirectory = '${workingDir.replace(/'/g, "''")}';
$shortcut.Description = 'ZEN KEN Agent Cockpit';
if (Test-Path '${iconPath.replace(/'/g, "''")}') { 
    $shortcut.IconLocation = '${iconPath.replace(/'/g, "''")}';
} else {
    $shortcut.IconLocation = 'msedge.exe,0';
}
$shortcut.Save();`.trim();

                require('child_process').exec(`powershell -ExecutionPolicy Bypass -command "${psScript.replace(/\n/g, ' ')}"`, (err: any, stdout: string, stderr: string) => {
                    if (err) {
                        console.error("[Shortcut] Creation failed:", err);
                        console.error("[Shortcut] Stderr:", stderr);
                    } else {
                        console.log("[Shortcut] ZEN KEN Agent shortcut created successfully.");
                        const oldPath = path.join(desktopPath, 'GigaComputeCockpit.lnk');
                        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
                    }
                });
            }
            else if (isMac) {
                const appBundlePath = path.join(desktopPath, 'ZEN KEN Agent.app');
                const contentsPath = path.join(appBundlePath, 'Contents');
                const macOSPath = path.join(contentsPath, 'MacOS');
                const resourcesPath = path.join(contentsPath, 'Resources');

                console.log(`[GUI] Creating macOS App Bundle at ${appBundlePath}`);

                try {
                    if (!fs.existsSync(macOSPath)) fs.mkdirSync(macOSPath, { recursive: true });
                    if (!fs.existsSync(resourcesPath)) fs.mkdirSync(resourcesPath, { recursive: true });

                    // 1. Executable script
                    const scriptPath = path.join(macOSPath, 'launcher');
                    const scriptContent = `#!/bin/bash
# ZEN KEN Agent Launcher
open -a "Google Chrome" --args "--app=${targetUrl}" || open "${targetUrl}"
`;
                    fs.writeFileSync(scriptPath, scriptContent);
                    fs.chmodSync(scriptPath, '755');

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
                    fs.writeFileSync(path.join(contentsPath, 'Info.plist'), plistContent);

                    // 3. Icon
                    const sourceIcon = path.join(baseDir, 'branding', 'AppIcon.icns');
                    if (fs.existsSync(sourceIcon)) {
                        fs.copyFileSync(sourceIcon, path.join(resourcesPath, 'AppIcon.icns'));
                    }

                    console.log("[GUI] ZEN KEN Agent.app created successfully on Desktop.");
                    const oldPath = path.join(desktopPath, 'ZEN KEN Agent.command');
                    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
                    const olderPath = path.join(desktopPath, 'GigaComputeCockpit.command');
                    if (fs.existsSync(olderPath)) fs.unlinkSync(olderPath);

                } catch (err) {
                    console.error("[GUI] macOS App Bundle creation failed:", err);
                }
            }
        },
    });

    function broadcastToLocalUIs(data: any) {
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

            require('child_process').exec(edgeAppCmd, (err: any) => {
                if (err) {
                    console.warn("[GUI] Edge App Mode launch failed. Trying default browser...");
                    require('child_process').exec(fallbackCmd);
                } else {
                    console.log("[GUI] Auto-launch command (Edge) triggered.");
                }
            });

            // Also, create a desktop shortcut for convenience if not exists
            (async () => {
                const desktopPath = path.join(os.homedir(), 'Desktop');
                const shortcutPath = path.join(desktopPath, 'ZEN KEN Agent.lnk');
                if (!fs.existsSync(shortcutPath)) {
                    console.log("[GUI] Creating initial desktop shortcut...");
                    await (guiServer as any).options?.onCreateShortcut?.();
                }
            })();
        } else if (isMac) {
            // Option 1: Chrome App Mode
            const chromeAppCmd = `open -n -a "Google Chrome" --args --app="${targetUrl}"`;
            // Option 2: Default Browser
            const macFallbackCmd = `open "${targetUrl}"`;

            require('child_process').exec(chromeAppCmd, (err: any) => {
                if (err) {
                    console.warn("[GUI] Chrome App Mode launch failed. Trying default browser...");
                    require('child_process').exec(macFallbackCmd);
                } else {
                    console.log("[GUI] Auto-launch command (Chrome) triggered.");
                }
            });

            // Create initial shortcut for Mac
            (async () => {
                const desktopPath = path.join(os.homedir(), 'Desktop');
                const shortcutPath = path.join(desktopPath, 'ZEN KEN Agent.command');
                if (!fs.existsSync(shortcutPath)) {
                    await (guiServer as any).options?.onCreateShortcut?.();
                }
            })();
        }
    }



    // Local Auditor (検問所 1)
    function runLocalAuditor(wasmBuffer: Buffer) {
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
    function sendStepUpdate(taskId: string, step: TaskStep, details?: string) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'gui_update_task_step',
                payload: { taskId, step, details }
            }));
        }
    }

    // GUI Server removed (Now in guiServer.ts)
    // ----------------------------------------
    // ----------------------------------------

    function setupWsHandlers(ws: WebSocket) {

        ws.on('open', () => {
            console.log(`Agent ${nodeInfo.id} [v1.1-E2EE] connected. Score: ${nodeInfo.performanceScore}`);
            console.log(`[Trust] My Public Key snapshot: ${nodeKeys.publicKey.substring(0, 40)}...`);

            // 接続成功時にリコネクトカウンターをリセット
            reconnectAttempts = 0;
            broadcastToLocalUIs({ type: 'connection_status', payload: { status: 'connected' } });

            // Add token to nodeInfo if available
            const registrationPayload = { ...nodeInfo, token: userSession?.token };
            ws.send(JSON.stringify({ type: 'register', payload: registrationPayload }));

            // [Self-Healing] Node registration fallback via HTTP
            axios.post(`${httpApiUrl}/v1/worker/node/register`, registrationPayload, {
                headers: { 'Authorization': `Bearer ${userSession?.token}` }
            }).catch(e => console.warn(`[Self-Healing] HTTP Registration failed: ${e.message}`));

            checkForUpdates();

            // Start Signed Heartbeat with Resource Monitoring
            heartbeatInterval = setInterval(() => {
                osUtils.cpuUsage((v) => {
                    const timestamp = Date.now();
                    const cpuUsage = Math.round(v * 100);
                    const freeMem = osUtils.freemem();
                    const totalMem = osUtils.totalmem();
                    const memUsage = Math.round(((totalMem - freeMem) / totalMem) * 100);

                    const payload = {
                        nodeId: nodeInfo.id,
                        status: nodeInfo.status,
                        timestamp,
                        cpuUsage,
                        memUsage
                    };

                    const dataToSign = canonicalStringify(payload);
                    const signature = signResult(Buffer.from(dataToSign), nodeKeys.privateKey).toString('base64');

                    // WebSocket effort
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'status_update',
                            payload: { ...payload, signature }
                        }));
                    }

                    // [Self-Healing] Periodic status sync via HTTP (to ensure Cockpit visibility even if WS fails)
                    axios.post(`${httpApiUrl}/v1/worker/node/status`, { ...payload, signature }, {
                        headers: { 'Authorization': `Bearer ${userSession?.token}` }
                    }).catch(() => { /* Silent failure for background sync */ });
                });
            }, 30000); // Every 30 seconds
        });

        ws.on('message', async (data) => {
            const raw = data.toString();

            // 受信パケットのサイズチェック
            if (raw.length > MAX_PAYLOAD_SIZE) {
                console.error(`[Security] Payload bombardment detected! Size: ${raw.length}. Closing connection.`);
                ws.close(1009, 'Message too large');
                return;
            }

            let message: any;
            try {
                message = JSON.parse(raw);
            } catch {
                console.warn(`[${nodeInfo.id}] Ignoring non-JSON ws message.`);
                return;
            }

            if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
                console.warn(`[${nodeInfo.id}] Ignoring malformed ws message without type.`);
                return;
            }

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
                } else {
                    console.error(`[${nodeInfo.id}] Registration FAILED: ${error}`);
                }
                return;
            }

            if (message.type === 'auction_invite') {
                const task = message.payload as TaskRequest;
                if (!task?.taskId) {
                    console.warn(`[${nodeInfo.id}] Ignoring auction_invite without taskId.`);
                    return;
                }
                const bidPrice = biddingEngine.calculateBidPrice(nodeInfo.trustScore || 50, nodeInfo.performanceScore || 50);
                (global as any).pendingAuctionTasks = (global as any).pendingAuctionTasks || new Map();
                (global as any).pendingAuctionTasks.set(task.taskId, task);
                ws.send(JSON.stringify({ type: 'auction_bid', payload: { taskId: task.taskId, bidPrice } }));
                console.log(`[${nodeInfo.id}] Sent auction bid for task ${task.taskId} with price ${bidPrice.toFixed(2)} PTS`);
                return;
            }

            if (message.type === 'task_request' || message.type === 'task_award') {
                let task = message.payload as TaskRequest;
                if (message.type === 'task_request' && !task?.taskId) {
                    console.warn(`[${nodeInfo.id}] Ignoring task_request without taskId.`);
                    return;
                }
                if (message.type === 'task_award') {
                    if (!message.payload?.taskId) {
                        console.warn(`[${nodeInfo.id}] Ignoring task_award without taskId.`);
                        return;
                    }
                    const pending = (global as any).pendingAuctionTasks?.get(message.payload.taskId);
                    if (!pending) {
                        console.error(`[${nodeInfo.id}] Received award for unknown task ${message.payload.taskId}`);
                        return;
                    }
                    task = pending;
                    (global as any).pendingAuctionTasks.delete(task.taskId);
                }
                console.log(`[${nodeInfo.id}] Handling task/award: ${task.taskId} from ${task.requesterId} (Type: ${task.type})`);

                nodeInfo.status = 'busy';
                const taskEntry: any = { ...task, startTime: Date.now(), status: 'processing' };
                localTasks.unshift(taskEntry);
                if (localTasks.length > 20) localTasks.pop();
                broadcastToLocalUIs({ type: 'update', payload: { nodeInfo, localTasks } });

                // [Phase 33] Start Processing
                sendStepUpdate(task.taskId, 'processing', 'Executing Wasm in isolated environment.');

                try {
                    let result: any;
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
                            wasmBuffer = decrypt(wasmBuffer, DECryption_KEY, iv, authTag) as any;
                            console.log(`[${nodeInfo.id}] Decryption successful.`);
                        }

                        console.log("WAITING FOR WASM EXECUTION..."); // 復号された Wasm を実行環境へ

                        // [Phase 28] Recursive Delegation (孫請け)
                        // 仕事の重さに応じて、さらに下位のワーカーにタスクを分割・委託する
                        if (task.complexityScore && task.complexityScore > 0.3) {
                            console.log(`[Recursive] Task ${task.taskId} Complexity ${task.complexityScore.toFixed(2)} is high. Spawning sub-task...`);
                            const subTask: TaskRequest = {
                                taskId: `${task.taskId}-sub`,
                                parentId: task.taskId,
                                type: 'wasm',
                                payload: { wasm: task.payload.wasm, functionName: 'sub_logic', args: [] },
                                requesterId: nodeInfo.id,
                                deposit: Math.floor(task.deposit! / 2) // デポジットも半分委託
                            };
                            ws.send(JSON.stringify({ type: 'task_request', payload: subTask }));
                        }

                        // [Delegated Reasoning] Wasm 実行中のコストイベントと推論リクエストを監視
                        const sandboxPolicy = createTaskSandboxPolicy(task);
                        console.log(`[Sandbox] Using profile "${sandboxPolicy.name}" for task ${task.taskId}`);
                        const wasmOutput = await executeWasmTask(wasmBuffer, task.payload.functionName, task.payload.args || [], task.secrets, (expenseMsg) => {
                            console.log(`[Economy] Charging API cost: ${expenseMsg.amount} via ${expenseMsg.provider}`);
                            wallet.addExpense(task.taskId, expenseMsg.amount, expenseMsg.provider);
                            fullSyncGUI();
                        }, async (llmReq) => {
                            console.log(`[Bridge] LLM Request from Wasm: "${llmReq.prompt}"`);
                            const llmRes = await llmClient.ask({ prompt: llmReq.prompt });

                            if (llmRes.error) {
                                console.error(`[Bridge] LLM Error: ${llmRes.error}`);
                            } else {
                                console.log(`[Bridge] LLM Response: "${llmRes.text.substring(0, 50)}..."`);
                                // 推論成功時にコストを計上 (PoC 固定 0.5pts)
                                wallet.addExpense(task.taskId, 0.5, 'Worker LLM Bridge');
                                fullSyncGUI();
                            }
                        }, sandboxPolicy);

                        result = wasmOutput.result;

                        // [Phase 20] Cascading Delegation (階層型供給)
                        if (subManager.shouldDelegate(task)) {
                            sendStepUpdate(task.taskId, 'processing', 'Delegating sub-parts to Cascading Nodes (Smartphones)...');
                            try {
                                const subRes = await subManager.delegate(task);
                                console.log(`[Cascading] Received response from subnode: ${subRes.workerId}`);
                                // In real flow, we combine result. For PoC, we augment result.
                                result = { original: result, cascading: subRes.result };
                            } catch (e) {
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
                    } else {
                        // 従来のシミュレート
                        console.log(`[DEBUG] Entering simulation branch. Calculating delay...`);
                        const delay = Math.max(500, 3000 - (nodeInfo.performanceScore * 20));
                        console.log(`[DEBUG] Awaiting ${delay}ms...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        console.log(`[DEBUG] Await finished.`);
                        result = `Result from ${nodeInfo.id}`;
                    }

                    console.log(`[DEBUG] Creating response object...`);
                    const response: TaskResponse = {
                        taskId: task.taskId,
                        status: 'success',
                        result: result,
                        workerId: nodeInfo.id
                    };

                    // Node Trust Protocol: 結果に対する署名
                    console.log(`[${nodeInfo.id}] Signing result for Node Trust Protocol...`);
                    // [Phase 27] Use canonicalStringify to match server-side verification
                    const dataToSign = typeof result === 'string' ? result : canonicalStringify(result);
                    const signature = signResult(Buffer.from(dataToSign), nodeKeys.privateKey);
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
                } catch (error: any) {
                    console.error(`\n[CRITICAL ERROR] Task ${task.taskId} FAILED`);
                    console.error(`Error Type: ${error.constructor.name}`);
                    console.error(`Message: ${error.message}`);
                    if (error.stack) console.error(`Stack: ${error.stack}\n`);

                    const response: TaskResponse = {
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
            } else if (message.type === 'task_response') {
                const res = message.payload as TaskResponse;
                console.log(`[Requester] Task ${res.taskId} completed. Status: ${res.status}`);

                try {
                    // [Phase 20] 成果物（files: {path, content}[]）があれば減圧室へ保存
                    if (res.result && res.result.files) {
                        console.log(`[Requester] Found ${res.result.files.length} files to stage.`);
                        await stagingManager.stageResult(res.taskId, res.result.files);
                        console.log(`[Requester] Result staged in .gigacompute/staging/${res.taskId}. Please verify on host before merge.`);
                    }
                    fullSyncGUI();
                } catch (err: any) {
                    console.error(`[Requester] [CRITICAL] Failed to stage or sync result: ${err.message}`);
                    if (err.stack) console.error(err.stack);
                }
            } else if (message.type === 'system_state') {
                try {
                    const myInfo = message.payload.nodes.find((n: any) => n.id === nodeInfo.id);
                    if (myInfo && (myInfo.rewardPoints !== nodeInfo.rewardPoints || myInfo.trustScore !== nodeInfo.trustScore)) {
                        console.log(`[${nodeInfo.id}] State updated! Total: ${myInfo.rewardPoints} pts, Trust: ${myInfo.trustScore}`);
                        nodeInfo.rewardPoints = myInfo.rewardPoints;
                        nodeInfo.trustScore = myInfo.trustScore;
                    }
                    guiServer.updateActiveTasks(message.payload.activeTasks || []);
                    fullSyncGUI();
                } catch (err: any) {
                    console.error(`[${nodeInfo.id}] System state update failed: ${err.message}`);
                }
            } else {
                console.warn(`[${nodeInfo.id}] Unhandled ws message type: ${message.type}`);
            }
        });

        ws.on('close', (code: number, reason: Buffer) => {
            console.log(`Agent ${nodeInfo.id} disconnected. Code: ${code}, Reason: ${reason?.toString() || 'none'}`);
            nodeInfo.status = 'idle';
            broadcastToLocalUIs({ type: 'connection_status', payload: { status: 'disconnected', code } });
            reconnect();
        });

        ws.on('error', (err: Error) => {
            console.error(`[Network] WebSocket error: ${err.message}`);
            // エラーロギングのみ。close イベントが自動的に発火し、reconnect() が呼ばれる
        });

    } // end setupWsHandlers

    // [Phase 38] Distributed Task Polling Loop - Independent of WS for robustness on Firebase
    pollingInterval = setInterval(async () => {
        if (!userSession?.token || nodeInfo.status !== 'idle') return;

        try {
            const response = await axios.post(`${httpApiUrl}/v1/worker/task/fetch`, {}, {
                headers: { 'Authorization': `Bearer ${userSession.token}` }
            });

            if (response.status === 200 && response.data?.task) {
                const chunkedTask = response.data.task;
                console.log(`[Chunk Pool] Fetched task ${chunkedTask.id} (Chunk ${chunkedTask.chunkIndex + 1}/${chunkedTask.totalChunks})`);

                nodeInfo.status = 'busy';
                const taskEntry: any = {
                    taskId: chunkedTask.id,
                    type: 'chunk_compute',
                    status: 'processing',
                    startTime: Date.now()
                };
                localTasks.unshift(taskEntry);
                if (localTasks.length > 20) localTasks.pop();
                guiServer.fullSync();

                // Mock Execution (Simulating LLM or Code Analysis on the chunk)
                const delay = Math.max(1000, 3000 - (nodeInfo.performanceScore * 10)); // Variable processing time
                console.log(`[Chunk Compute] Processing... (Simulating ~${delay}ms compute time)`);
                await new Promise(r => setTimeout(r, delay));

                // Submit Result
                const mockResult = `Processed Output for chunk ${chunkedTask.chunkIndex}: "${chunkedTask.code.substring(0, 30)}..."`;

                await axios.post(`${httpApiUrl}/v1/worker/task/result`, {
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
        } catch (e: any) {
            // Ignore connection refused / generic errors for clean console during idle
            if (e.code !== 'ECONNREFUSED') {
                // console.error(`[Chunk Pool] Polling error: ${e.message}`);
            }
        }
    }, 5000); // Poll every 5 seconds

    // 初回接続のハンドラ設定
    setupWsHandlers(ws);
}
