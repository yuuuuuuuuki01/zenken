// Build: 2026-03-04T10:31
process.stderr.write('[System] Starting module loading (forced stderr)...\n');

// --- GLOBAL ERROR HANDLERS ---
process.on('uncaughtException', (err) => {
    process.stderr.write(`[CRASH] Uncaught Exception: ${err.stack || err}\n`);
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    process.stderr.write(`[CRASH] Unhandled Rejection at: ${promise} reason: ${reason}\n`);
});
import https from 'https';
import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
const { WebSocketServer, WebSocket } = require('ws');
import express from 'express';
const cors = require('cors');
import Stripe from 'stripe';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { db } from './db';
import multer from 'multer';
import { NodeInfo, TaskRequest, TaskResponse, ActiveTaskState, TaskStep, canonicalStringify } from '../shared/src/index';
import { verifySignature } from '../shared/src/encryption';
import { hashPassword, comparePassword, generateToken, verifyToken } from './auth';
import { globalQueue } from './taskQueue';
import { MarketEngine } from './marketEngine';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger, bqLog } from './utils/logger';
import * as admin from 'firebase-admin';

// src 実行時と dist/server/src 実行時で深さが異なるため
function findProjectRoot(dir: string): string {
    if (process.env.K_SERVICE) {
        // In Cloud Run, the source root is the current working directory
        return process.cwd();
    }
    if (fs.existsSync(path.join(dir, 'package.json')) && (fs.existsSync(path.join(dir, 'prisma')) || dir.endsWith('server'))) {
        return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return dir;
    return findProjectRoot(parent);
}

const projRoot = findProjectRoot(__dirname);
process.stderr.write(`[System] projRoot resolved: ${projRoot}\n`);

// rootDir: repo root (locally) or source root (Cloud Run)
const rootDir = process.env.K_SERVICE
    ? projRoot
    : (projRoot.endsWith('server') ? path.dirname(projRoot) : projRoot);

process.stderr.write(`[System] rootDir resolved: ${rootDir}\n`);

// Helper to resolve paths that might be inside "server" or at "projRoot" level depending on env
const getPublicPath = (subPath: string) => {
    // In Cloud Run/Firebase, paths are relative to the deployment root
    if (process.env.K_SERVICE || process.env.FUNCTION_TARGET) {
        // Firebase Hosting points to server/dist/public or just public in functions
        const possiblePaths = [
            path.join(projRoot, 'dist', 'public', subPath),
            path.join(projRoot, 'public', subPath),
            path.join(process.cwd(), 'public', subPath)
        ];
        for (const p of possiblePaths) {
            if (fs.existsSync(p)) return p;
        }
    }
    return path.join(projRoot, 'public', subPath);
};

// --- FB ADMIN SETUP (EARLY INITIALIZATION) ---
import { getAdmin, getAuth, getAppCheck, getStorage } from './utils/firebase';
// 起動時に初期化を確実に実行
getAdmin();

import { firebaseAdminAuth } from './middleware/adminAuth';
import { firestoreService } from './utils/firestore';

const execAsync = promisify(exec);
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder';
const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' as any });

if (!process.env.STRIPE_SECRET_KEY && process.env.NODE_ENV !== 'test') {
    console.warn('[Stripe] STRIPE_SECRET_KEY is missing. Using the testing key as a fallback. Payments will be simulated.');
}

// --- CONFIG & STATE ---
const port = process.env.PORT ? parseInt(process.env.PORT) : 8081;
const certsDir = path.resolve(rootDir, 'certs');

const MAX_HISTORY = 50;
const MAX_PAYLOAD_SIZE = 10 * 1024 * 1024;

const nodes = new Map<string, { ws: WebSocket, info: NodeInfo }>();
const taskHistory: any[] = [];
const activeTasks = new Map<string, ActiveTaskState>();
const pendingVotes = new Map<string, { request: TaskRequest, votes: Map<string, { workerId: string, result: any }>, redundancy: number }>();
const marketEngine = new MarketEngine();

// --- VERSION MANAGEMENT (Using Firestore for Persistence) ---
let currentApprovedVersion: Version = {
    version: 'v1.3.2',
    downloadUrl: '/downloads/ZENKEN_AGENT_v1.3.2.exe',
    macDownloadUrl: '/downloads/ZENKEN_AGENT_v1.3.2_macos_x64.zip',
    macArmDownloadUrl: '/downloads/ZENKEN_AGENT_v1.3.2_macos_arm64.zip',
    linuxDownloadUrl: '/downloads/ZENKEN_AGENT_v1.3.2.zip', // Default generic zip for linux
    releaseNotes: 'Fixed startup issues and desktop shortcut creation.',
    isPublic: true
};

async function loadVersion() {
    try {
        const persisted = await firestoreService.getVersion();
        if (persisted) {
            // Only overwrite if the persisted version is at least the same or newer, 
            // OR if we are specifically looking to preserve legacy settings.
            // For this upgrade (v1.3.0), we want to force the new settings if they differ.
            if (persisted.version === currentApprovedVersion.version) {
                currentApprovedVersion = { ...currentApprovedVersion, ...persisted };
                console.log(`[Version] Loaded from Firestore: ${currentApprovedVersion.version}`);
            } else {
                console.log(`[Version] Firestore version ${persisted.version} differs from code ${currentApprovedVersion.version}. Forcing code version and updating Firestore.`);
                await saveVersion();
            }
        } else {
            console.log(`[Version] No version found in Firestore. Saving current: ${currentApprovedVersion.version}`);
            await saveVersion();
        }
    } catch (e) {
        console.error('[Version] Firestore load error:', e);
    }
}
async function saveVersion() {
    try {
        await firestoreService.updateVersion(currentApprovedVersion);
    } catch (e) {
        console.error('[Version] Firestore save error:', e);
    }
}
// Initial load
loadVersion();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 }
});

// Detect local IP
const nets = os.networkInterfaces();
let localIp = 'localhost';
for (const name of Object.keys(nets)) {
    const interfaces = nets[name];
    if (interfaces) {
        for (const net of interfaces) {
            if (net.family === 'IPv4' && !net.internal) { localIp = net.address; break; }
        }
    }
}

// --- APP SETUP ---
const app = express();

// Required for Cloud Run / Firebase Hosting to correctly see client IPs and headers
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', true);
}

// EJS Setup
const viewsPath = process.env.K_SERVICE ? path.join(projRoot, 'dist', 'views') : path.join(projRoot, 'views');
app.set('views', viewsPath);
app.set('view engine', 'ejs');

app.use(cors());

// --- STRIPE WEBHOOK (Must stay BEFORE express.json()) ---
app.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_placeholder';

    if (!webhookSecret) {
        console.error('[Stripe Webhook] Missing STRIPE_WEBHOOK_SECRET. Verification skipped.');
        return res.status(400).send('Webhook config error');
    }

    // Use rawBody if available (needed for Firebase Functions signature verification)
    const rawBody = (req as any).rawBody || req.body;
    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err: any) {
        console.error(`[Stripe Webhook] Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log(`[Stripe Webhook] Event received: ${event.type}`);

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const sessionId = session.id;

        const userId = session.metadata?.userId;
        const pts = parseInt(session.metadata?.pts || '0');

        console.log(`[Stripe Webhook] session: ${sessionId}, user: ${userId}, pts: ${pts}`);

        if (!userId || pts <= 0) {
            console.error('[Stripe Webhook] Invalid metadata in session:', session.id);
        } else {
            try {
                // Check if already processed
                const existingTx = await db.pointTransaction.findUnique({ where: { stripeSessionId: sessionId } });
                if (existingTx) {
                    console.log(`[Stripe Webhook] Session ${sessionId} already processed.`);
                } else {
                    // Update user points
                    await db.user.update({
                        where: { id: userId },
                        data: { points: { increment: pts } }
                    });

                    // Create transaction record
                    await db.pointTransaction.create({
                        data: {
                            userId,
                            type: 'PURCHASE', // Standardized for Stripe
                            amount: pts,
                            stripeSessionId: sessionId,
                            description: `Purchased PTS (via Webhook)`
                        }
                    });
                    console.log(`[Stripe Webhook] Credited ${pts} PTS to User ${userId}`);
                    bqLog.deposit(userId, pts);
                }
            } catch (err: any) {
                console.error(`[Stripe Webhook] DB Error: ${err.message}`);
            }
        }
    }

    res.json({ received: true });
});

const devRouter = express.Router();
const workerRouter = express.Router();
const adminRouter = express.Router();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: { error: 'Too many requests, please try again later.' }
});
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20, // 15 mins for 20 attempts
    message: { error: 'Too many login attempts, please try again later.' }
});

app.use('/v1/', apiLimiter);

// Cloud Run Healthcheck / Load Balancer Ready check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// --- SCHEMAS & HELPERS ---
const RegisterSchema = z.object({ email: z.string().email(), password: z.string().min(8), name: z.string().min(2) });
const LoginSchema = z.object({ email: z.string().email(), password: z.string() });
const TaskSubmitSchema = z.object({ taskId: z.string(), type: z.string(), payload: z.any(), deposit: z.number().optional() });
const CheckoutSchema = z.object({ amountPoints: z.number().min(100) });

const validate = (schema: z.ZodSchema) => (req: any, res: any, next: any) => {
    try { schema.parse(req.body); next(); } catch (e: any) { next(e); }
};

const errorHandler = (err: any, req: any, res: any, next: any) => {
    console.error(`[ERROR] ${new Date().toISOString()} - ${err.message}`);
    const status = err.status || (err instanceof z.ZodError ? 400 : 500);
    res.status(status).json({ error: err.message || 'Error', details: (err as any).issues || (err as any).errors });
};

const authMiddleware = async (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = verifyToken(authHeader.split(' ')[1]);
    if (!decoded) return res.status(401).json({ error: 'Invalid token' });
    req.userId = decoded.userId;
    next();
};

const clientAuthMiddleware = async (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

    // In the stateless SSR approach, the Token is essentially the user's Client Api Key (hash)
    const apiKeyStr = authHeader.split(' ')[1];

    // Find the associated API key
    const apiKey = await db.clientApiKey.findMany({
        where: { key: apiKeyStr, isActive: true }
    }).then(keys => keys[0]);

    if (!apiKey) {
        return res.status(401).json({ error: 'Invalid or inactive API Key (Hash)' });
    }

    // Update last used timestamp (fire and forget)
    db.clientApiKey.update({
        where: { key: apiKeyStr },
        data: { lastUsedAt: new Date() }
    }).catch(err => console.error('[DB] Failed to update API Key lastUsedAt', err));

    req.userId = apiKey.userId;
    next();
};

// --- ROUTES ---
// In Cloud Run, static files are in 'public/' relative to projRoot
app.use('/portal', express.static(getPublicPath('portal')));
app.use('/worker-portal', express.static(getPublicPath('worker-portal')));
// client-portalディレクトリ自体は静的ファイルとして配信しつつ、/u/:hash はSSRで処理する
app.use('/client-portal', express.static(getPublicPath('client-portal')));

// --- SSR: Stateless Client Portal ---
app.post('/auth/login-simple', authLimiter, express.urlencoded({ extended: true }), async (req: any, res: any, next: any) => {
    try {
        const { email, password } = req.body;
        const user = await db.user.findUnique({
            where: { email }
        });

        if (!user || !(await comparePassword(password, user.passwordHash))) {
            return res.redirect('/client-portal/index.html?error=invalid_credentials');
        }

        // Fetch active API key separately because db.ts (Firestore wrapper) doesn't support 'include'
        // To avoid missing composite indexes on Firestore, perform a basic query and sort/filter in JS
        const apiKeyRecords = await db.clientApiKey.findMany({
            where: { userId: user.id }
        });

        const activeKeys = apiKeyRecords.filter((k: any) => k.isActive);
        let apiKeyRecord;

        if (activeKeys.length === 0) {
            // Auto-generate a default ClientApiKey for existing users who do not have one
            const prefix = 'gcp_live_';
            const randomBytes = crypto.randomBytes(32).toString('base64url');
            const defaultKey = `${prefix}${randomBytes}`;
            apiKeyRecord = await db.clientApiKey.create({
                data: { key: defaultKey, name: 'Default Access Key', userId: user.id }
            });
        } else {
            activeKeys.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            apiKeyRecord = activeKeys[0];
        }

        if (!apiKeyRecord || !apiKeyRecord.key) {
            return res.redirect('/client-portal/index.html?error=no_api_key_found');
        }

        // Update last used timestamp (fire and forget)
        db.clientApiKey.update({
            where: { id: apiKeyRecord.id },
            data: { lastUsedAt: new Date() }
        }).catch(err => console.error('[DB] Failed to update API Key lastUsedAt', err));

        // Redirect to the unique hashed URL (Stateless approach)
        if (req.headers.accept?.includes('application/json')) {
            return res.json({ success: true, key: apiKeyRecord.key });
        }
        res.redirect(`/client-portal/u/${apiKeyRecord.key}`);
    } catch (e) {
        console.error('Login error:', e);
        if (req.headers.accept?.includes('application/json')) {
            return res.status(500).json({ error: 'server_error' });
        }
        res.redirect('/client-portal/index.html?error=server_error');
    }
});

app.get('/client-portal/u/:hash', async (req: any, res: any) => {
    try {
        const hash = req.params.hash;

        // Find user by their API key (which we use as the URL hash) - using findFirst as findUnique is not in db.ts for clientApiKey
        const apiKeyRecord = await db.clientApiKey.findFirst({
            where: { key: hash }
        });

        if (!apiKeyRecord || !apiKeyRecord.isActive) {
            return res.redirect('/client-portal/index.html');
        }

        const user = await db.user.findUnique({
            where: { id: apiKeyRecord.userId }
        });

        if (!user) {
            return res.redirect('/client-portal/index.html');
        }

        // Fetch user's client jobs without ordering in DB to avoid Firestore composite index error
        const jobsRecords = await db.clientJob.findMany({
            where: { userId: user.id }
        });

        // Sort in memory and take top 10
        jobsRecords.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const jobs = jobsRecords.slice(0, 10);

        // Render the EJS template and send HTML fully populated
        res.render('dashboard', {
            user: {
                name: user.name || 'Client',
                email: user.email,
                points: Number(user.points || 0).toFixed(2),
                hash: hash
            },
            jobs: jobs
        });
    } catch (e) {
        console.error('SSR render error:', e);
        res.status(500).send('Internal Server Error');
    }
});

// --- SSR: Stateless Worker Portal ---
app.post('/auth/worker-login-simple', authLimiter, express.urlencoded({ extended: true }), async (req: any, res: any, next: any) => {
    try {
        const { email, password } = req.body;
        const user = await db.user.findUnique({
            where: { email }
        });

        if (!user || !user.passwordHash || !(await comparePassword(password, user.passwordHash))) {
            return res.redirect('/worker-portal/index.html?error=invalid_credentials');
        }

        // Ensure user has a securePortalHash for stateless routing
        let portalHash = user.securePortalHash;
        if (!portalHash) {
            portalHash = 'wrk_live_' + crypto.randomBytes(32).toString('base64url');
            await db.user.update({
                where: { id: user.id },
                data: { securePortalHash: portalHash }
            });
        }

        res.redirect(`/worker-portal/u/${portalHash}`);
    } catch (e: any) {
        console.error('Worker Login error:', e?.stack || e);
        res.redirect('/worker-portal/index.html?error=server_error');
    }
});

app.post('/auth/worker-register-simple', authLimiter, express.urlencoded({ extended: true }), async (req: any, res: any, next: any) => {
    try {
        const { email, password, name } = req.body;

        const existingUser = await db.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.redirect('/worker-portal/index.html?error=email_in_use');
        }

        const passwordHash = await hashPassword(password);
        const portalHash = 'wrk_live_' + crypto.randomBytes(32).toString('base64url');

        const user = await db.user.create({
            data: {
                email,
                name,
                passwordHash,
                securePortalHash: portalHash
            }
        });

        // Auto-generate a default ClientApiKey as well for future API usage
        const prefix = 'gcp_live_';
        const randomBytes = crypto.randomBytes(32).toString('base64url');
        const defaultKey = `${prefix}${randomBytes}`;
        await db.clientApiKey.create({
            data: { key: defaultKey, name: 'Default Access Key', userId: user.id }
        });

        res.redirect(`/worker-portal/u/${portalHash}`);
    } catch (e) {
        console.error('Worker Register error:', e);
        res.redirect('/worker-portal/index.html?error=server_error');
    }
});

// --- SSR: Stateless Agent Application ---
app.post('/auth/agent-login-simple', authLimiter, express.urlencoded({ extended: true }), async (req: any, res: any, next: any) => {
    try {
        const { email, password } = req.body;
        const user = await db.user.findUnique({
            where: { email }
        });

        if (!user || !user.passwordHash || !(await comparePassword(password, user.passwordHash))) {
            return res.redirect('http://localhost:3001/login.html?error=invalid_credentials');
        }

        // Ensure user has a securePortalHash for stateless routing
        let portalHash = user.securePortalHash;
        if (!portalHash) {
            portalHash = 'wrk_live_' + crypto.randomBytes(32).toString('base64url');
            await db.user.update({
                where: { id: user.id },
                data: { securePortalHash: portalHash }
            });
        }

        res.redirect(`http://localhost:3001/u/${portalHash}`);
    } catch (e: any) {
        console.error('Agent Login error:', e?.stack || e);
        res.redirect('http://localhost:3001/login.html?error=server_error');
    }
});

app.post('/auth/agent-register-simple', authLimiter, express.urlencoded({ extended: true }), async (req: any, res: any, next: any) => {
    try {
        const { email, password, name } = req.body;

        const existingUser = await db.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.redirect('http://localhost:3001/login.html?error=email_in_use');
        }

        const passwordHash = await hashPassword(password);
        const portalHash = 'wrk_live_' + crypto.randomBytes(32).toString('base64url');

        const user = await db.user.create({
            data: {
                email,
                name,
                passwordHash,
                securePortalHash: portalHash
            }
        });

        // Auto-generate a default ClientApiKey
        const prefix = 'gcp_live_';
        const randomBytes = crypto.randomBytes(32).toString('base64url');
        const defaultKey = `${prefix}${randomBytes}`;
        await db.clientApiKey.create({
            data: { key: defaultKey, name: 'Default Access Key', userId: user.id }
        });

        res.redirect(`http://localhost:3001/u/${portalHash}`);
    } catch (e) {
        console.error('Agent Register error:', e);
        res.redirect('http://localhost:3001/login.html?error=server_error');
    }
});

app.get('/worker-portal/u/:hash', async (req: any, res: any) => {
    try {
        const hash = req.params.hash;

        // Find user by their securePortalHash
        const userRecords = await db.user.findMany({
            where: { securePortalHash: hash }
        });

        const user = userRecords[0];

        if (!user) {
            return res.redirect('/worker-portal/index.html');
        }

        // Fetch user's nodes (remove orderBy to avoid Firestore composite index requirement)
        const nodeRecords = await db.node.findMany({
            where: { ownerId: user.id }
        });
        nodeRecords.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const nodes = nodeRecords;

        // Fetch user's recent transactions (remove orderBy to avoid Firestore composite index requirement)
        const txRecords = await db.pointTransaction.findMany({
            where: { userId: user.id }
        });
        txRecords.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const transactions = txRecords.slice(0, 20);

        // Generate a temporary JWT token for the EJS to use for dynamic API calls
        const token = generateToken({ userId: user.id });

        // Render the EJS template
        res.render('worker-dashboard', {
            user: {
                name: user.name || 'Worker',
                email: user.email,
                points: Number(user.points || 0).toFixed(2),
                earningsYen: Number(user.earningsYen || 0),
                hash: hash
            },
            nodes: nodes,
            transactions: transactions,
            token: token
        });
    } catch (e: any) {
        console.error('Worker SSR render error:', e?.stack || e);
        res.status(500).send('Internal Server Error');
    }
});


// Explicit download route for correct filename preservation (now with Firebase Storage fallback)
app.get('/downloads/:filename', async (req, res) => {
    const filename = req.params.filename;
    const localPath = getPublicPath(path.join('downloads', filename));

    // 1. Try local disk (for dev or recently uploaded on this instance)
    if (fs.existsSync(localPath)) {
        res.type(filename);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.sendFile(localPath);
    }

    // 2. Fallback to Firebase Storage (Persistent source of truth)
    try {
        const bucket = getStorage().bucket('gigacompute-downloads');
        const file = bucket.file(`downloads/${filename}`);
        const [exists] = await file.exists();

        if (exists) {
            res.type(filename);
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            const readStream = file.createReadStream();
            readStream.pipe(res);
        } else {
            res.status(404).send('File not found');
        }
    } catch (e) {
        console.error('[Storage] Download error:', e);
        res.status(500).send('Internal Server Error');
    }
});

// Fallback static for downloads directory
app.use('/downloads', express.static(getPublicPath('downloads')));
app.use(express.static(getPublicPath('')));


app.get('/nodes', (req, res) => {
    const dummyToken = ''; // [SECURITY] Removed hardcoded token for production safety.
    res.send(`
        <!DOCTYPE html>
        <html lang="ja">
        <head><title>GigaCompute Portal</title></head>
        <body style="background:#0a0a1a;color:#00e5ff;font-family:sans-serif;padding:50px;">
            <h2>GigaCompute Web Portal</h2>
            <p>※ アカウント登録を行い、ノード接続用のトークンを発行してください。</p>
            <p><strong>あなたのペアリングトークン:</strong></p>
            <div style="background:#000;padding:15px;border:1px solid #00e5ff;word-break:break-all;">
                ${dummyToken}
            </div>
            <p style="margin-top:20px;">このトークンをコピーして、エージェントアプリ（コックピット）に貼り付けてください。</p>
            <p><small>※ URLパラメータ (?token=...) での自動紐付けも実装済みです。</small></p>
        </body>
        </html>
    `);
});

app.get('/withdraw', (req, res) => {
    const token = req.query.token || '';
    res.send(`
        <!DOCTYPE html>
        <html lang="ja">
        <head><title>GigaCompute Withdrawal Portal</title></head>
        <body style="background:#0a0a1a;color:#00e5ff;font-family:sans-serif;padding:50px;">
            <h2>GigaCompute 報酬引き出し</h2>
            <p>出金先口座の指定と出金額を選択してください。</p>
            
            <form action="/withdraw/submit" method="POST" style="background:#000;padding:20px;border:1px solid #00e5ff; margin-top: 20px;">
                <input type="hidden" name="token" value="${token}">
                <label for="amount" style="display:block; margin-bottom: 10px;">引き出し希望額 (USD):</label>
                <input type="number" name="amount" id="amount" placeholder="0.00" required step="0.01" style="padding: 10px; font-size: 1.2rem; background: #111; color: #fff; border: 1px solid #333; width: 200px;">
                
                <button type="submit" style="margin-left: 10px; padding: 10px 20px; font-size: 1.1rem; background: #00e5ff; color: #000; border: none; cursor: pointer; font-weight: bold;">
                    出金申請を送信
                </button>
            </form>
            <p style="margin-top:20px; color: var(--accent-secondary);"><small>※ 送金処理は Stripe Connect 等の外部決済プラットフォームを通じて行われます。</small></p>
        </body>
        </html>
    `);
});

app.post('/withdraw/submit', (req, res) => {
    const { amount, token } = req.body;
    console.log(`[Withdrawal] Received request for $${amount} from token: ${token?.substring(0, 15)}...`);

    res.send(`
        <!DOCTYPE html>
        <html lang="ja">
        <head><title>出金リクエスト完了</title></head>
        <body style="background:#0a0a1a;color:#00e5ff;font-family:sans-serif;padding:50px;text-align:center;">
            <h2>✅ 出金リクエストを受け付けました</h2>
            <p style="font-size: 1.5rem;">申請額: <strong>$${amount}</strong></p>
            <p style="color:var(--accent-secondary); margin-top: 20px;">ご指定のアカウントへの送金手続きを開始しました。<br>着金まで数営業日かかる場合があります。</p>
            <button onclick="window.close()" style="margin-top: 30px; padding: 10px 20px; background: #333; color: #fff; border: 1px solid #555; cursor: pointer; font-size: 1rem;">ウィンドウを閉じる</button>
        </body>
        </html>
    `);
});

app.post('/auth/register', authLimiter, validate(RegisterSchema), async (req, res, next) => {
    try {
        const { email, password, name } = req.body;
        const passwordHash = await hashPassword(password);
        const portalHash = 'wrk_live_' + crypto.randomBytes(32).toString('base64url');
        const user = await db.user.create({ data: { email, name, passwordHash, securePortalHash: portalHash } });

        // Auto-generate a default ClientApiKey for magic link login
        const prefix = 'gcp_live_';
        const randomBytes = crypto.randomBytes(32).toString('base64url');
        const defaultKey = `${prefix}${randomBytes}`;
        await db.clientApiKey.create({
            data: { key: defaultKey, name: 'Default Access Key', userId: user.id }
        });

        res.json({ token: generateToken({ userId: user.id }), user: { id: user.id, email: user.email, hash: user.securePortalHash } });
    } catch (e) { next(e); }
});

app.post('/auth/login', authLimiter, validate(LoginSchema), async (req, res, next) => {
    try {
        const { email, password } = req.body;
        let user = await db.user.findUnique({ where: { email } });
        if (!user || !(await comparePassword(password, user.passwordHash))) throw { status: 401, message: 'Invalid credentials' };

        // Ensure user has a securePortalHash for stateless routing (e.g. Agent Dashboard)
        let portalHash = user.securePortalHash;
        if (!portalHash) {
            portalHash = 'wrk_live_' + crypto.randomBytes(32).toString('base64url');
            user = await db.user.update({
                where: { id: user.id },
                data: { securePortalHash: portalHash }
            });
        }
        res.json({ token: generateToken({ userId: user.id }), user: { id: user.id, email: user.email, hash: user.securePortalHash } });
    } catch (e) { next(e); }
});

// User/Profile Routes (JWT Auth)
const userRouter = express.Router();
userRouter.use(authMiddleware);
userRouter.get('/apikeys', async (req: any, res, next) => {
    try {
        const keys = await db.clientApiKey.findMany({
            where: { userId: req.userId, isActive: true }
        });
        res.json({ keys });
    } catch (e) { next(e); }
});
app.use('/v1/user', userRouter);

// Worker Routes
workerRouter.use(authMiddleware);
workerRouter.get('/dashboard/data', async (req: any, res) => {
    const user = await db.user.findUnique({ where: { id: req.userId }, include: { nodes: true } });
    res.json(user);
});
workerRouter.put('/dashboard/profile', async (req: any, res, next) => {
    try {
        const { name, password, openAiKey, geminiKey } = req.body;
        const data: any = {};
        if (name) data.name = name;
        if (password) data.passwordHash = await hashPassword(password);
        if (openAiKey !== undefined) data.openAiKey = openAiKey;
        if (geminiKey !== undefined) data.geminiKey = geminiKey;

        if (Object.keys(data).length > 0) {
            await db.user.update({ where: { id: req.userId }, data });
        }
        res.json({ success: true });
    } catch (e) { next(e); }
});

workerRouter.get('/dashboard/token', async (req: any, res, next) => {
    try {
        const token = generateToken({ userId: req.userId });
        res.json({ token });
    } catch (e) { next(e); }
});

workerRouter.post('/dashboard/withdraw', async (req: any, res, next) => {
    try {
        const { amount, destination } = req.body;
        const pts = parseFloat(amount);
        if (isNaN(pts) || pts <= 0) return res.status(400).json({ error: 'Invalid amount' });

        const user = await db.user.findUnique({ where: { id: req.userId } });
        if (!user || (user.points || 0) < pts) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }

        await db.$transaction([
            db.user.update({
                where: { id: req.userId },
                data: { points: { decrement: pts } }
            }),
            db.pointTransaction.create({
                data: {
                    userId: req.userId,
                    type: 'WITHDRAW',
                    amount: pts,
                    status: 'pending',
                    description: `Requested to: ${destination}`
                }
            })
        ]);

        res.json({ success: true, message: 'Withdrawal submitted successfully' });
    } catch (e) { next(e); }
});

// ワーカー: 取引履歴
workerRouter.get('/transactions', async (req: any, res, next) => {
    try {
        const txs = await db.pointTransaction.findMany({
            where: { userId: req.userId },
            orderBy: { createdAt: 'desc' },
            take: 100
        });
        res.json({ transactions: txs });
    } catch (e) { next(e); }
});

// [HTTP Fallback] ノードHTTP登録エンドポイント（WebSocket非対応環境用）
// エージェントがWebSocketに接続できない場合（例：本番Cloud Run環境）に使用
workerRouter.post('/node/register', async (req: any, res, next) => {
    try {
        const nodeInfo = req.body;
        const nodeId = nodeInfo.id;
        if (!nodeId) return res.status(400).json({ error: 'Node ID required' });

        // ownerId は req.userId（JWT認証済み）を使う
        const ownerId = req.userId;

        await db.node.upsert({
            where: { id: nodeId },
            update: {
                status: 'idle',
                name: nodeInfo.name,
                performanceScore: nodeInfo.performanceScore,
                publicKey: nodeInfo.publicKey,
                ownerId: ownerId
            },
            create: {
                id: nodeId,
                name: nodeInfo.name,
                type: nodeInfo.type || 'agent',
                publicKey: nodeInfo.publicKey || '',
                performanceScore: nodeInfo.performanceScore || 50,
                ownerId: ownerId,
                status: 'idle'
            }
        });

        // In-memory nodes mapにも追加（診断などで参照される）
        if (!nodes.has(nodeId)) {
            nodes.set(nodeId, { ws: null as any, info: { ...nodeInfo, status: 'idle', ownerId } });
        }

        console.log(`[HTTP] Node ${nodeId} registered via HTTP (Owner: ${ownerId})`);
        firestoreService.updateNode(nodeId, { ...nodeInfo, status: 'idle', ownerId });
        bqLog.nodeConnected(nodeId, nodeInfo.trustScore || 50);

        res.json({ success: true, ownerId });
    } catch (e) { next(e); }
});

// [HTTP Fallback] ノードハートビート（ステータス更新）
workerRouter.post('/node/heartbeat', async (req: any, res, next) => {
    try {
        const { nodeId, status, cpuUsage, memUsage, performanceScore } = req.body;
        if (!nodeId) return res.status(400).json({ error: 'Node ID required' });

        // In-memory map を更新
        const node = nodes.get(nodeId);
        if (node) {
            node.info.status = status || 'idle';
            node.info.cpuUsage = cpuUsage;
            node.info.memUsage = memUsage;
            if (req.body.name) (node.info as any).name = req.body.name;
            firestoreService.updateNode(nodeId, node.info);
        } else {
            // 未登録ノードはハートビートを無視（先にregisterを呼ぶ必要がある）
        }

        // DBのステータスも更新
        await db.node.update({
            where: { id: nodeId },
            data: { status: status || 'idle', performanceScore: performanceScore }
        }).catch(() => { }); // ノードが未登録なら無視

        res.json({ success: true });
    } catch (e) { next(e); }
});

// [Phase 37] Worker Task Execution Endpoints
workerRouter.post('/task/fetch', async (req: any, res, next) => {
    try {
        // P5: DBからワーカーのtrustScoreを取得してキューのフィルタに渡す
        const node = await db.node.findUnique({ where: { id: req.userId } });
        const trustScore = node?.trustScore ?? 50;
        const task = globalQueue.getNextTask(req.userId, trustScore);
        if (!task) {
            return res.status(204).send(); // No tasks available
        }
        res.json({ task });
    } catch (e) { next(e); }
});

workerRouter.post('/task/result', async (req: any, res, next) => {
    try {
        const { taskId, result, score } = req.body;
        // P2: submitResult が JobProgress を返すようになった（報酬額が含まれる）
        const job = globalQueue.submitResult(req.userId, taskId, result);

        if (job) {
            // P2: ジョブコストの70%をチャンク数で按分した動的報酬を付与
            const reward = job.workerRewardPerChunk;
            // P6: プラットフォームマージンをログ出力
            const margin = parseFloat((job.jobCost * 0.30 / job.totalChunks).toFixed(2));
            console.log(`[Reward] Worker ${req.userId} earned ${reward} PTS. Platform margin: ${margin} PTS (30%)`);

            await db.user.update({
                where: { id: req.userId },
                data: { points: { increment: reward } }
            });
            await db.pointTransaction.create({
                data: {
                    userId: req.userId,
                    type: 'REWARD',
                    amount: reward,
                    description: `Task Reward: ${taskId}`
                }
            });
            // P5: タスク成功でtrustScore微増
            await db.node.update({
                where: { id: req.userId },
                data: { trustScore: { increment: 0.1 } }
            }).catch(() => { }); // ノードが未登録なら無視

            bqLog.taskCompleted('N/A', taskId, reward, req.userId); // [BigQuery]
            res.json({ success: true, message: `Result accepted. Rewarded ${reward} PTS`, reward });
        } else {
            // P5: タスク失敗・タイムアウトでtrustScore微減
            await db.node.update({
                where: { id: req.userId },
                data: { trustScore: { decrement: 0.5 } }
            }).catch(() => { });
            res.status(400).json({ error: 'Failed to submit result or task timed out' });
        }
    } catch (e) { next(e); }
});

// ==========================================
// [Support] Worker Support & Debug Endpoints
// ==========================================
workerRouter.post('/support/ticket', async (req: any, res, next) => {
    try {
        const { category, subject, message } = req.body;
        if (!subject || !message) return res.status(400).json({ error: 'Subject and message are required' });
        const ticket = await db.supportTicket.create({
            data: { userId: req.userId, userType: 'worker', category: category || 'other', subject, message }
        });
        console.log(`[Support] Worker ticket created: ${ticket.id} by ${req.userId}`);
        res.json({ success: true, ticket });
    } catch (e) { next(e); }
});

workerRouter.get('/support/tickets', async (req: any, res, next) => {
    try {
        const tickets = await db.supportTicket.findMany({ where: { userId: req.userId } });
        res.json({ tickets });
    } catch (e) { next(e); }
});

workerRouter.get('/support/diagnostics', async (req: any, res, next) => {
    try {
        const user = await db.user.findUnique({ where: { id: req.userId } });
        const userNodes = await db.node.findMany({ where: { userId: req.userId } });
        const recentTxs = await db.pointTransaction.findMany({
            where: { userId: req.userId },
            orderBy: { createdAt: 'desc' },
            take: 10
        });

        // ノードのWebSocket接続状況を確認
        const connectedNodes = Array.from(nodes.values())
            .filter(n => n.info.id === req.userId)
            .map(n => ({
                id: n.info.id,
                status: n.info.status,
                wsState: n.ws.readyState,
                cpuUsage: n.info.cpuUsage,
                memUsage: n.info.memUsage
            }));

        res.json({
            diagnostics: {
                account: {
                    id: user?.id,
                    email: user?.email,
                    points: user?.points ?? 0,
                    earningsYen: user?.earningsYen ?? 0,
                    createdAt: user?.createdAt
                },
                nodes: {
                    registered: userNodes.length,
                    connected: connectedNodes.length,
                    details: connectedNodes
                },
                recentTransactions: recentTxs.length,
                serverInfo: {
                    uptime: process.uptime(),
                    totalNodes: nodes.size,
                    pendingTasks: activeTasks.size,
                    queueStatus: globalQueue.getQueueStatus()
                }
            }
        });
    } catch (e) { next(e); }
});

// Developer Routes
devRouter.use(authMiddleware);
devRouter.post('/payment/checkout', validate(CheckoutSchema), async (req: any, res, next) => {
    try {
        const user = await db.user.findUnique({ where: { id: req.userId } });
        if (!user) throw { status: 404, message: 'User not found' };
        const session = await stripe.checkout.sessions.create({
            customer_email: user.email,
            line_items: [{ price_data: { currency: 'usd', product_data: { name: 'GigaCompute Points' }, unit_amount: req.body.amountPoints }, quantity: 1 }],
            mode: 'payment',
            success_url: `https://${localIp}:8081/stripe/success`,
            cancel_url: `https://${localIp}:8081/stripe/cancel`,
            metadata: { userId: user.id, amountPoints: req.body.amountPoints.toString() }
        });
        res.json({ url: session.url });
    } catch (e) { next(e); }
});

devRouter.post('/task/submit', validate(TaskSubmitSchema), async (req: any, res, next) => {
    try {
        const task: TaskRequest = { ...req.body, requesterId: req.userId };
        submitTaskInternal(task);
        res.json({ success: true, taskId: task.taskId });
    } catch (e) { next(e); }
});

app.use('/v1/dev', devRouter);
app.use('/v1/worker', workerRouter);

// ==========================================
// [Phase 36] Client Portal API 
// ==========================================
const clientRouter = express.Router();
clientRouter.use(clientAuthMiddleware);

clientRouter.get('/dashboard', async (req: any, res, next) => {
    try {
        const user = await db.user.findUnique({ where: { id: req.userId } });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const recentJobs = await db.clientJob.findMany({
            where: { userId: req.userId },
            // orderBy: { createdAt: 'desc' }, // Removed to avoid index requirement
            take: 50
        });
        recentJobs.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        const activeJobs = await db.clientJob.count({
            where: { userId: req.userId, status: { in: ['pending', 'processing'] } }
        });
        const totalJobs = await db.clientJob.count({ where: { userId: req.userId } });

        // aggregate spent PTS
        const spentObj = await db.clientJob.aggregate({
            _sum: { cost: true },
            where: { userId: req.userId }
        });
        const totalSpent = spentObj._sum.cost || 0;

        // Fetch the most recent active API key for magic link
        const latestKey = await db.clientApiKey.findFirst({
            where: { userId: req.userId, isActive: true },
            orderBy: { createdAt: 'desc' }
        });

        res.json({
            points: user.points,
            language: user.language || 'ja',
            name: user.name,
            accessKey: latestKey ? latestKey.key : null,
            stats: {
                totalJobs,
                activeJobs,
                totalSpent: totalSpent
            },
            recentJobs
        });
    } catch (e) { next(e); }
});

clientRouter.put('/profile', async (req: any, res, next) => {
    try {
        const { name, language } = req.body;
        const data: any = {};
        if (name) data.name = name;
        if (language) data.language = language;

        if (Object.keys(data).length > 0) {
            await db.user.update({ where: { id: req.userId }, data });
        }
        res.json({ success: true });
    } catch (e) { next(e); }
});

clientRouter.get('/transactions', async (req: any, res, next) => {
    try {
        // To avoid "The query requires an index" (FAILED_PRECONDITION) in Firestore when using where + orderBy,
        // we fetch and sort in memory for this PoC/Demo.
        const txs = await db.pointTransaction.findMany({
            where: { userId: req.userId },
            // orderBy: { createdAt: 'desc' }, // Removed to avoid index requirement
            take: 100 // Fetch a bit more to allow sorting
        });

        // Sort in memory
        txs.sort((a: any, b: any) => {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

        res.json({ transactions: txs.slice(0, 50) });
    } catch (e) { next(e); }
});

clientRouter.get('/apikeys', async (req: any, res, next) => {
    try {
        const keys = await db.clientApiKey.findMany({
            where: { userId: req.userId, isActive: true },
            // orderBy: { createdAt: 'desc' }, // Removed to avoid index requirement
            select: { key: true, name: true, createdAt: true, lastUsedAt: true }
        });
        keys.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        res.json({ keys });
    } catch (e) { next(e); }
});

clientRouter.post('/apikeys', async (req: any, res, next) => {
    try {
        const { name } = req.body || {};
        const prefix = 'gcp_live_';
        const randomBytes = crypto.randomBytes(32).toString('base64url');
        const newKey = `${prefix}${randomBytes}`;
        await db.clientApiKey.create({
            data: { key: newKey, name: name || 'Unnamed Key', userId: req.userId }
        });
        res.status(201).json({ success: true, key: newKey });
    } catch (e) { next(e); }
});

clientRouter.put('/apikeys/:key', async (req: any, res, next) => {
    try {
        const { key } = req.params;
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });
        const updated = await db.clientApiKey.update({
            where: { key, userId: req.userId },
            data: { name }
        });
        if (!updated) return res.status(404).json({ error: 'Key not found' });
        res.json({ success: true });
    } catch (e) { next(e); }
});

clientRouter.delete('/apikeys/:key', async (req: any, res, next) => {
    try {
        const { key } = req.params;
        const deleted = await db.clientApiKey.delete({
            where: { key, userId: req.userId }
        });
        if (!deleted) return res.status(404).json({ error: 'Key not found' });
        res.json({ success: true });
    } catch (e) { next(e); }
});

clientRouter.get('/payments/config', async (req: any, res, next) => {
    try {
        const publishableKey = process.env.STRIPE_PUBLIC_KEY || 'pk_test_dummy';
        res.json({ publishableKey });
    } catch (e) {
        next(e);
    }
});

clientRouter.post('/payments/checkout', async (req: any, res, next) => {
    try {
        const { amountPts } = req.body;
        const pts = parseInt(amountPts);
        if (isNaN(pts) || pts <= 0) return res.status(400).json({ error: 'Invalid amount' });

        const stripeSecretKey = process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder';
        const isForceMock = process.env.NODE_ENV !== 'production'; // Force mock in dev for automation stability

        console.log(`[Payment Checkout (Elements)] User: ${req.userId}, PTS: ${pts}, usingMock: ${isForceMock || !stripeSecretKey || stripeSecretKey.startsWith('mock_')}`);

        const productID = 'prod_U4So75qWJMIBOd';
        const unitPrice = 50; // 50 JPY per unit
        const totalBase = unitPrice * pts;
        const totalWithFee = Math.ceil(totalBase / (1 - 0.036));

        if (isForceMock || !stripeSecretKey || stripeSecretKey.startsWith('mock_')) {
            console.warn('[Stripe] STRIPE_SECRET_KEY is missing. Returning a mock client secret.');
            const mockIntentId = `pi_test_mock_${Date.now()}`;
            await db.mockSession.create({
                data: {
                    id: mockIntentId,
                    pts,
                    userId: req.userId
                }
            });
            console.log(`[Payment Checkout] Created mock payment intent: ${mockIntentId}`);
            return res.json({ clientSecret: `mock_secret_${mockIntentId}` });
        }

        const paymentIntent = await stripe.paymentIntents.create({
            amount: totalWithFee,
            currency: 'jpy',
            description: `GigaCompute PTS Pack: ${pts} PTS`,
            metadata: { userId: req.userId, pts: pts.toString(), productID }
        });

        res.json({ clientSecret: paymentIntent.client_secret });
    } catch (e: any) {
        console.error('[Stripe Checkout Error]', e);
        res.status(500).json({ error: e.message || 'Payment integration error' });
    }
});

clientRouter.post('/payments/verify', async (req: any, res, next) => {
    try {
        const { payment_intent_id } = req.body;
        console.log(`[Payment Verify] Start verification for PaymentIntent: ${payment_intent_id}`);
        if (!payment_intent_id) return res.status(400).json({ error: 'PaymentIntent ID required' });

        // Prevent double crediting by checking DB
        const existingTx = await db.pointTransaction.findUnique({ where: { stripeSessionId: payment_intent_id } });
        if (existingTx) {
            console.log(`[Payment Verify] PaymentIntent already credited: ${payment_intent_id}`);
            return res.json({ success: true, message: 'Already credited' });
        }

        let pts = 0;
        let userId = req.userId;

        const currentEnv = process.env.NODE_ENV;
        const isMockPattern = payment_intent_id.startsWith('pi_test_mock_') || (currentEnv !== 'production' && payment_intent_id.startsWith('pi_'));
        console.log(`[Payment Verify] ID: ${payment_intent_id}, Env: ${currentEnv}, isMock: ${isMockPattern}`);

        if (isMockPattern) {
            console.log(`[Payment Verify] Processing MOCK intent (Force Dev): ${payment_intent_id}`);
            // If it's a real pi_ ID but we are in dev and forcing mock, we might not find it in db.mockSession.
            // Let's check db.mockSession first.
            let mockData = await db.mockSession.findUnique({ where: { id: payment_intent_id } });

            if (!mockData && process.env.NODE_ENV !== 'production') {
                // For automation scripts that might just pass a dummy ID
                console.log(`[Payment Verify] Mock data not found for ${payment_intent_id}, using default values for Dev.`);
                pts = 1000;
                userId = req.userId;
            } else if (mockData) {
                pts = mockData.pts;
                userId = mockData.userId;
                await db.mockSession.delete({ where: { id: payment_intent_id } });
            } else {
                return res.status(400).json({ error: 'Invalid mock intent' });
            }
        } else {
            console.log(`[Payment Verify] Processing REAL Stripe intent: ${payment_intent_id}`);
            // Real Stripe intent verification
            const intent = await stripe.paymentIntents.retrieve(payment_intent_id);
            // In test mode, we might want to allow non-succeeded intents to be credited for automation
            const isTestIntent = intent.livemode === false || intent.id.startsWith('pi_test');
            if (intent.status !== 'succeeded' && !isTestIntent) {
                console.warn(`[Payment Verify] Stripe intent status is not succeeded: ${intent.status}`);
                return res.status(400).json({ error: 'Payment not completed' });
            }
            pts = parseInt(intent.metadata?.pts || '0');
            userId = intent.metadata?.userId || req.userId;
            console.log(`[Payment Verify] Stripe intent verified. Extracted PTS: ${pts}, User: ${userId}`);
        }

        // Add pts
        console.log(`[Payment Verify] Updating user points. User: ${userId}, Increment: ${pts}`);
        await db.user.update({
            where: { id: userId },
            data: { points: { increment: pts } }
        });

        console.log(`[Payment Verify] Creating transaction record.`);
        await db.pointTransaction.create({
            data: {
                userId,
                type: 'PURCHASE', // Standardized
                amount: pts,
                stripeSessionId: payment_intent_id, // Store intent ID instead of session ID
                description: `Purchased PTS (via Elements)`
            }
        });
        console.log(`[Payment Verify] Transaction successful. Sending response.`);
        bqLog.deposit(userId, pts); // [BigQuery]

        res.json({ success: true, added: pts });
    } catch (e: any) {
        console.error('[Payment Verify Error]', e);
        res.status(500).json({ error: e.message || 'Verification error' });
    }
});

clientRouter.post('/task/submit', async (req: any, res, next) => {
    try {
        const { type, payload, isSensitive, region } = req.body;

        // P1: marketEngine を使って動的コスト計算（チャンク数を考慮）
        let pObj: any = { isChunked: false, chunks: [] };
        try { pObj = JSON.parse(payload); } catch { }
        const chunkCount = (pObj.isChunked && Array.isArray(pObj.chunks)) ? pObj.chunks.length : 1;
        const pricing = marketEngine.estimateClientCost(
            type || 'custom_task',
            isSensitive === true,
            region,
            5, // baseChunkCost
            activeTasks.size,
            nodes.size
        );
        const estimatedCost = pricing.cost * chunkCount;

        const user = await db.user.findUnique({ where: { id: req.userId } });
        if (!user || user.points < estimatedCost) {
            return res.status(400).json({
                error: `Insufficient PTS balance. Required: ${estimatedCost} PTS, Balance: ${user?.points ?? 0} PTS`
            });
        }

        // Deduct pts and create job in transaction
        const [job] = await db.$transaction([
            db.clientJob.create({
                data: {
                    type: type || 'custom_task',
                    payload: payload || '',
                    cost: estimatedCost,
                    userId: req.userId,
                    status: 'pending'
                }
            }),
            db.user.update({
                where: { id: req.userId },
                data: { points: { decrement: estimatedCost } }
            }),
            db.pointTransaction.create({
                data: {
                    userId: req.userId,
                    type: 'PURCHASE',
                    amount: -estimatedCost,
                    description: `Task Payment: ${type || 'custom_task'}`
                }
            })
        ]);

        console.log(`[Billing] Job ${job.id}: cost=${estimatedCost} PTS (multiplier=${pricing.multiplier}x), margin=${pricing.platformMargin * chunkCount} PTS`);

        // P2: enqueueJob にジョブコストを渡して報酬を動的計算させる
        if (pObj.isChunked && Array.isArray(pObj.chunks)) {
            globalQueue.enqueueJob(job.id, pObj.chunks, estimatedCost);
        } else {
            globalQueue.enqueueJob(job.id, [{ instruction: 'Process task', code: payload }], estimatedCost);
        }

        res.json({ success: true, jobId: job.id, estimatedCost, multiplier: pricing.multiplier });
    } catch (e) { next(e); }
});

// [PoC] Demo data initialization for LP
clientRouter.post('/poc/init-data', async (req, res) => {
    try {
        await initDemoData();
        res.json({ success: true, message: 'Demo data initialized' });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// [Support] Client Support & Debug Endpoints
// ==========================================
clientRouter.post('/support/ticket', async (req: any, res, next) => {
    try {
        const { category, subject, message } = req.body;
        if (!subject || !message) return res.status(400).json({ error: 'Subject and message are required' });
        const ticket = await db.supportTicket.create({
            data: { userId: req.userId, userType: 'client', category: category || 'other', subject, message }
        });
        console.log(`[Support] Client ticket created: ${ticket.id} by ${req.userId}`);
        res.json({ success: true, ticket });
    } catch (e) { next(e); }
});

clientRouter.get('/support/tickets', async (req: any, res, next) => {
    try {
        const tickets = await db.supportTicket.findMany({ where: { userId: req.userId } });
        res.json({ tickets });
    } catch (e) { next(e); }
});

clientRouter.get('/support/diagnostics', async (req: any, res, next) => {
    try {
        const user = await db.user.findUnique({ where: { id: req.userId } });
        const apiKeys = await db.clientApiKey.findMany({ where: { userId: req.userId } });
        const jobs = await db.clientJob.findMany({
            where: { userId: req.userId },
            orderBy: { createdAt: 'desc' },
            take: 10
        });
        const recentTxs = await db.pointTransaction.findMany({
            where: { userId: req.userId },
            orderBy: { createdAt: 'desc' },
            take: 10
        });

        const activeJobCount = jobs.filter((j: any) => j.status === 'pending' || j.status === 'processing').length;

        res.json({
            diagnostics: {
                account: {
                    id: user?.id,
                    email: user?.email,
                    name: user?.name,
                    points: user?.points ?? 0,
                    createdAt: user?.createdAt
                },
                apiKeys: {
                    total: apiKeys.length,
                    active: apiKeys.filter((k: any) => k.isActive).length
                },
                jobs: {
                    recent: jobs.length,
                    active: activeJobCount,
                    statuses: jobs.reduce((acc: any, j: any) => {
                        acc[j.status] = (acc[j.status] || 0) + 1;
                        return acc;
                    }, {})
                },
                recentTransactions: recentTxs.length,
                serverInfo: {
                    uptime: process.uptime(),
                    totalNodes: nodes.size,
                    pendingTasks: activeTasks.size,
                    queueStatus: globalQueue.getQueueStatus()
                }
            }
        });
    } catch (e) { next(e); }
});

app.use('/v1/client', clientRouter);
// app.use('/v1/worker', workerRouter); // Duplicate removed

// --- PERFORMANCE METRICS LOGIC ---
function calculateTotalTflops(): number {
    let total = 0;
    nodes.forEach(n => {
        // performanceScore (0-100) を TFLOPS に簡易換算 (例: 100 = 10 TFLOPS)
        const score = n.info.performanceScore || 50;
        total += (score / 10);
    });
    return parseFloat(total.toFixed(2));
}

function calculate24hTasks(): number {
    // 過去24時間のタスク数を取得
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const historyCount = taskHistory.filter(t => t.timestamp > oneDayAgo).length;
    // 実数のみを返す（デモ用の加算値を廃止）
    return historyCount;
}

// GET /api/stats/realtime — リアルタイム統計
app.get('/api/stats/realtime', (req, res) => {
    res.json({
        tflops: calculateTotalTflops(),
        activeNodes: nodes.size,
        pendingTasks: activeTasks.size,
        tasks24h: calculate24hTasks(),
        timestamp: Date.now()
    });
});


const ADMIN_TOKEN = "LEGACY_PHASED_OUT"; // Maintain variable name to avoid breakage, but it's no longer used for auth

// Migrated to firebaseAdminAuth

// ワーカーポータル (/work) — 収益・エージェント状態確認
app.use('/work', express.static(path.join(rootDir, 'server/public/worker')));
// クライアントポータル (/client) — ジョブ発注・API キー管理
app.use('/client', express.static(path.join(rootDir, 'server/public/client-portal')));

app.use('/branding', express.static(path.join(rootDir, 'branding')));
app.use('/admin', express.static(path.join(rootDir, 'server/public/admin')));

// --- ADMIN API ---
// Public admin routes (no auth required for basic connectivity check)
adminRouter.get('/ping', (req, res) => {
    res.json({ status: 'ok', message: 'Admin API is reachable', timestamp: new Date().toISOString() });
});

adminRouter.use(firebaseAdminAuth);   // Firebase Token + App Check - Protected from here down

// GET /admin/api/stats — システム全体のサマリー
adminRouter.get('/stats', (req, res) => {
    const queueStatus = globalQueue.getQueueStatus();
    res.json({
        connectedNodes: nodes.size,
        activeTasks: activeTasks.size,
        queuePending: queueStatus.pending,
        queueProcessing: queueStatus.processing,
        activeJobs: queueStatus.activeJobs,
        uptime: process.uptime(),
    });
});

// GET /admin/api/config — 現在の実行時設定を取得
adminRouter.get('/config', (req, res) => {
    res.json({
        bqEnabled: process.env.BQ_ENABLED === 'true',
        bqDataset: process.env.BQ_DATASET || 'gigacompute_analytics'
    });
});

// GET /admin/api/config/algorithm — アルゴリズム設定を取得
adminRouter.get('/config/algorithm', (req, res) => {
    res.json({
        market: marketEngine.getConfig(),
        timeoutMs: globalQueue.getTimeout(),
        currentStats: {
            pendingTasks: activeTasks.size,
            activeNodes: nodes.size
        }
    });
});

// GET /admin/api/algorithm/manifest — アルゴリズムの構造・論理情報を取得
adminRouter.get('/algorithm/manifest', (req, res) => {
    res.json(marketEngine.getStrategyManifest());
});

// POST /admin/api/config — 実行時設定を更新
adminRouter.post('/config', (req, res) => {
    const { bqEnabled, bqDataset } = req.body;
    if (bqEnabled !== undefined) process.env.BQ_ENABLED = String(bqEnabled);
    if (bqDataset !== undefined) process.env.BQ_DATASET = bqDataset;

    console.log(`[Admin] Configuration UPDATED: BQ_ENABLED=${process.env.BQ_ENABLED}, BQ_DATASET=${process.env.BQ_DATASET}`);
    res.json({ success: true, message: 'Settings saved successfully' });
});

// POST /admin/api/config/algorithm — アルゴリズム設定を更新
adminRouter.post('/config/algorithm', (req, res) => {
    const { geoPremium, sensitivePremium, fineTuningPremium, demandSensitivity, defaultTrust, sensitiveTrust, timeoutMs } = req.body;

    if (timeoutMs !== undefined) globalQueue.setTimeout(Number(timeoutMs));

    marketEngine.setConfig({
        geoPremium: geoPremium !== undefined ? Number(geoPremium) : undefined,
        sensitivePremium: sensitivePremium !== undefined ? Number(sensitivePremium) : undefined,
        fineTuningPremium: fineTuningPremium !== undefined ? Number(fineTuningPremium) : undefined,
        demandSensitivity: demandSensitivity !== undefined ? Number(demandSensitivity) : undefined,
        defaultTrust: defaultTrust !== undefined ? Number(defaultTrust) : undefined,
        sensitiveTrust: sensitiveTrust !== undefined ? Number(sensitiveTrust) : undefined
    });

    console.log(`[Admin] Algorithm Configuration UPDATED`);
    res.json({ success: true, message: 'Algorithm settings saved successfully' });
});

// GET /admin/api/env — システム環境変数の取得 (Allowlist方式)
adminRouter.get('/env', (req, res) => {
    const safeEnv: any = {};
    const envData: any = {};
    // Only allow specific non-sensitive keys
    const allowedKeys = [
        'PORT', 'NODE_ENV', 'BQ_ENABLED', 'BQ_DATASET',
        'K_SERVICE', 'FUNCTION_NAME', 'FIREBASE_CONFIG'
    ];

    allowedKeys.forEach(k => {
        if (process.env[k]) {
            envData[k] = process.env[k];
        }
    });

    // Extra diagnostics for Stripe (don't reveal keys, just status)
    envData['STRIPE_CONFIGURED'] = !!process.env.STRIPE_SECRET_KEY;
    envData['STRIPE_WEBHOOK_CONFIGURED'] = !!process.env.STRIPE_WEBHOOK_SECRET;
    envData['STRIPE_PUBLIC_KEY_CONFIGURED'] = !!process.env.STRIPE_PUBLIC_KEY;

    res.json(envData);
});

// GET /admin/api/nodes — 接続中ノード一覧
adminRouter.get('/nodes', (req, res) => {
    const list = Array.from(nodes.values()).map(n => ({
        ...n.info,
        wsReadyState: n.ws.readyState
    }));
    res.json({ nodes: list });
});

// GET /admin/api/users — 全ユーザー一覧
adminRouter.get('/users', async (req, res, next) => {
    try {
        const usersData = await db.user.findMany();
        const users = usersData.map((u: any) => ({
            id: u.id,
            email: u.email,
            name: u.name,
            points: u.points,
            createdAt: u.createdAt
        }));
        res.json({ users });
    } catch (e) { next(e); }
});

// POST /admin/api/users/:userId/points — ポイント付与・調整
adminRouter.post('/users/:userId/points', async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { amount, description } = req.body;
        const pts = parseFloat(amount);
        if (isNaN(pts)) return res.status(400).json({ error: 'Invalid amount' });

        const user = await db.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(404).json({ error: 'User not found' });

        await db.user.update({
            where: { id: userId },
            data: { points: { increment: pts } }
        });

        await db.pointTransaction.create({
            data: {
                userId,
                type: 'DEPOSIT',
                amount: pts,
                description: description || `Admin adjustment: ${pts} PTS`
            }
        });

        res.json({ success: true, newBalance: user.points + pts });
    } catch (e) { next(e); }
});

// GET /admin/api/jobs — 全クライアントジョブ
adminRouter.get('/jobs', async (req, res, next) => {
    try {
        const jobs = await db.clientJob.findMany({ where: { userId: '*' } });
        res.json({ jobs });
    } catch (e) { next(e); }
});

// GET /admin/api/transactions — ポイントトランザクション
adminRouter.get('/transactions', async (req, res, next) => {
    try {
        const transactions = await db.pointTransaction.findMany({ orderBy: { createdAt: 'desc' } });
        res.json({ transactions });
    } catch (e) { next(e); }
});

// GET /admin/api/active-tasks — アクティブタスク（WebSocket経由）
adminRouter.get('/active-tasks', (req, res) => {
    res.json({ activeTasks: Array.from(activeTasks.values()) });
});

// POST /admin/api/kick/:nodeId — ノード強制切断
adminRouter.post('/kick/:nodeId', (req, res) => {
    const { nodeId } = req.params;
    const node = nodes.get(nodeId);
    if (!node) return res.status(404).json({ error: 'Node not found' });
    node.ws.close(1008, 'Kicked by admin');
    nodes.delete(nodeId);
    broadcastSystemState();
    res.json({ success: true, message: `Node ${nodeId} disconnected.` });
});

// GET /admin/api/withdrawals/pending — 保留中の出金申請一覧
adminRouter.get('/withdrawals/pending', async (req, res, next) => {
    try {
        const txs = await db.pointTransaction.findMany({
            where: { type: 'WITHDRAW', status: 'pending' },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ transactions: txs });
    } catch (e) { next(e); }
});

// POST /admin/api/withdrawals/:id/approve — 出金申請を承認
adminRouter.post('/withdrawals/:id/approve', async (req, res, next) => {
    try {
        const { id } = req.params;
        const tx = await db.pointTransaction.findUnique({ where: { id } });

        if (!tx || tx.type !== 'WITHDRAW' || tx.status !== 'pending') {
            return res.status(400).json({ error: 'Invalid or already processed transaction' });
        }

        await db.$transaction([
            db.pointTransaction.update({
                where: { id },
                data: { status: 'completed', approvedAt: new Date().toISOString() }
            }),
            db.user.update({
                where: { id: tx.userId },
                data: { earningsYen: { increment: tx.amount } }
            })
        ]);

        console.log(`[Admin] Approved withdrawal ${id} (Amount: ${tx.amount})`);
        res.json({ success: true, message: 'Withdrawal approved' });
    } catch (e) { next(e); }
});

// POST /admin/api/withdrawals/:id/reject — 出金申請を却下（ポイント返還）
adminRouter.post('/withdrawals/:id/reject', async (req, res, next) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const tx = await db.pointTransaction.findUnique({ where: { id } });

        if (!tx || tx.type !== 'WITHDRAW' || tx.status !== 'pending') {
            return res.status(400).json({ error: 'Invalid or already processed transaction' });
        }

        await db.$transaction([
            db.pointTransaction.update({
                where: { id },
                data: { status: 'rejected', rejectReason: reason || 'Admin rejected', rejectedAt: new Date().toISOString() }
            }),
            db.user.update({
                where: { id: tx.userId },
                data: { points: { increment: tx.amount } }
            }),
            db.pointTransaction.create({
                data: {
                    userId: tx.userId,
                    type: 'DEPOSIT',
                    amount: tx.amount,
                    description: `Refund for rejected withdrawal: ${id}`
                }
            })
        ]);

        console.log(`[Admin] Rejected withdrawal ${id} (Refunded: ${tx.amount} PTS)`);
        res.json({ success: true, message: 'Withdrawal rejected and points refunded' });
    } catch (e) { next(e); }
});

// --- MAINTENANCE & SECURITY API ---

// GET /admin/api/maintenance/certs — 証明書の有効期限チェック
adminRouter.get('/maintenance/certs', async (req, res) => {
    try {
        const certFiles = ['ca.crt', 'server.crt', 'client.crt'];
        const results = certFiles.map(file => {
            const certPath = path.join(certsDir, file);
            if (!fs.existsSync(certPath)) return { file, error: 'Not Found' };

            const pem = fs.readFileSync(certPath, 'utf8');
            const cert = new crypto.X509Certificate(pem);

            return {
                file,
                subject: cert.subject,
                notBefore: cert.validFrom,
                notAfter: cert.validTo,
                daysRemaining: Math.floor((new Date(cert.validTo).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            };
        });
        res.json({ certs: results });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// GET /admin/api/maintenance/db/backup — DBバックアップ (Firestore移行済みのため現在は非対応)
adminRouter.get('/maintenance/db/backup', (req, res) => {
    // Firestoreに移行済みのため、JSONファイルは存在しない
    return res.status(410).json({ error: 'Database backup via file download is no longer supported. Data is stored in Firestore.' });
});

// GET /admin/api/maintenance/assets — 公開配布物のステータス
adminRouter.get('/maintenance/assets', (req, res) => {
    const publicDir = path.join(__dirname, '../public');
    const files = [
        { name: 'zenken-agent.zip', label: 'Agent (Windows/Linux)' },
        { name: 'zenken-agent-mac.zip', label: 'Agent (macOS)' },
        { name: 'vscode-zenken.vsix', label: 'VSCode Extension' }
    ];

    const results = files.map(f => {
        const filePath = path.join(publicDir, f.name);
        if (!fs.existsSync(filePath)) return { ...f, exists: false };

        const stats = fs.statSync(filePath);
        return {
            ...f,
            exists: true,
            size: stats.size,
            updatedAt: stats.mtime,
            version: f.name.includes('vscode') ? '0.1.0' : 'Alpha' // Simple versioning for PoC
        };
    });

    res.json({ assets: results });
});

// POST /admin/api/maintenance/certs/renew — 証明書の再生成
adminRouter.post('/maintenance/certs/renew', async (req, res) => {
    const scriptPath = path.join(projRoot, 'scripts/gen-certs.mjs');
    const { exec } = await import('child_process');

    exec(`node ${scriptPath}`, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ error: error.message, stderr });
        }
        res.json({ success: true, message: 'Certificates renewed. Please restart server for changes to take effect.', stdout });
    });
});

// POST /admin/api/tasks/test — 全ノードへテストタスクを投入
adminRouter.post('/tasks/test', (req, res) => {
    const testTask = {
        taskId: `test-run-${Date.now()}`,
        type: 'simulation',
        payload: 'Admin initiated fleet-wide benchmark',
        requesterId: 'ADMIN_CONSOLE'
    };
    submitTaskInternal(testTask as any);
    res.json({ success: true, message: 'Test task dispatched to all idle nodes', taskId: testTask.taskId });
});

// POST /admin/api/tasks/submit — 管理画面からのタスク手動投入
adminRouter.post('/tasks/submit', (req, res) => {
    const { type, payload } = req.body;
    if (!payload) return res.status(400).json({ success: false, error: 'Payload is required' });

    const task = {
        taskId: `admin-task-${Date.now()}`,
        type: type || 'custom',
        payload: payload,
        requesterId: 'ADMIN_CONSOLE'
    };
    submitTaskInternal(task as any);
    res.json({ success: true, taskId: task.taskId, message: 'Task dispatched to network' });
});

// GET /v1/version - Latest approved version for agents
app.get('/v1/version', (req, res) => {
    res.json(currentApprovedVersion);
});

// Stable Redirect Endpoint for LP & Dashboards
app.get('/api/download/latest/:os', (req, res) => {
    const os = req.params.os;
    const arch = req.query.arch as string; // Optional arch param (e.g. arm64)

    if (os === 'win') {
        res.redirect(currentApprovedVersion.downloadUrl);
    } else if (os === 'mac') {
        if (arch === 'arm64' && (currentApprovedVersion as any).macArmDownloadUrl) {
            res.redirect((currentApprovedVersion as any).macArmDownloadUrl);
        } else {
            res.redirect(currentApprovedVersion.macDownloadUrl);
        }
    } else if (os === 'linux') {
        res.redirect(currentApprovedVersion.linuxDownloadUrl || '/downloads/ZENKEN_AGENT_v1.3.2.zip');
    } else {
        res.status(400).send('Invalid OS');
    }
});

interface Version {
    version: string;
    downloadUrl: string;
    macDownloadUrl: string;
    macArmDownloadUrl: string;
    linuxDownloadUrl?: string; // Optional linux support
    releaseNotes: string;
    isPublic: boolean;
}
// Admin Version Control
adminRouter.get('/version', (req, res) => {
    res.json(currentApprovedVersion);
});

adminRouter.post('/version', (req, res) => {
    const { version, downloadUrl, macDownloadUrl, macArmDownloadUrl, linuxDownloadUrl, releaseNotes, isPublic } = req.body;
    currentApprovedVersion = {
        version: version || currentApprovedVersion.version,
        downloadUrl: downloadUrl || currentApprovedVersion.downloadUrl,
        macDownloadUrl: macDownloadUrl || currentApprovedVersion.macDownloadUrl,
        macArmDownloadUrl: macArmDownloadUrl || (currentApprovedVersion as any).macArmDownloadUrl,
        linuxDownloadUrl: linuxDownloadUrl || currentApprovedVersion.linuxDownloadUrl,
        releaseNotes: releaseNotes || currentApprovedVersion.releaseNotes,
        isPublic: isPublic !== undefined ? isPublic : currentApprovedVersion.isPublic
    };
    saveVersion();

    // Broadcast update to all connected agents
    if (currentApprovedVersion.isPublic) {
        nodes.forEach(node => {
            if (node.ws.readyState === WebSocket.OPEN) {
                node.ws.send(JSON.stringify({
                    type: 'update_notification',
                    payload: currentApprovedVersion
                }));
            }
        });
    }

    res.json({ success: true, version: currentApprovedVersion });
});

// POST /admin/api/upload/agent — エージェントZIPのアップロード
adminRouter.post('/upload/agent', upload.fields([
    { name: 'agent_win', maxCount: 1 },
    { name: 'agent_mac', maxCount: 1 }
]), async (req: any, res) => {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const results: any = {};

    const uploadPromises = [];

    if (files.agent_win) {
        const file = files.agent_win[0];
        const winFilename = file.originalname || 'zen-agent.zip';
        const bucket = getStorage().bucket('gigacompute-downloads');
        const blob = bucket.file(`downloads/${winFilename}`);

        const p = new Promise((resolve, reject) => {
            const blobStream = blob.createWriteStream({ resumable: false });
            blobStream.on('error', reject);
            blobStream.on('finish', () => {
                console.log(`[Storage] Upload finished (win): ${winFilename}`);
                resolve(true);
            });
            blobStream.end(file.buffer);
        });
        uploadPromises.push(p);

        results.win = { success: true, filename: winFilename };
        currentApprovedVersion.downloadUrl = `/downloads/${winFilename}`;
    }

    if (files.agent_mac) {
        const file = files.agent_mac[0];
        const macFilename = file.originalname || 'zen-agent-mac.zip';
        const bucket = getStorage().bucket('gigacompute-downloads');
        const blob = bucket.file(`downloads/${macFilename}`);

        const p = new Promise((resolve, reject) => {
            const blobStream = blob.createWriteStream({ resumable: false });
            blobStream.on('error', reject);
            blobStream.on('finish', () => {
                console.log(`[Storage] Upload finished (mac): ${macFilename}`);
                resolve(true);
            });
            blobStream.end(file.buffer);
        });
        uploadPromises.push(p);

        results.mac = { success: true, filename: macFilename };
        currentApprovedVersion.macDownloadUrl = `/downloads/${macFilename}`;
    }

    try {
        await Promise.all(uploadPromises);
        saveVersion();
        res.json({ success: true, version: currentApprovedVersion });
    } catch (e) {
        console.error('[Storage] Multi-upload error:', e);
        res.status(500).json({ success: false, error: 'Upload to storage failed' });
    }
});

// ==========================================
// [Support] Admin Support Ticket Management
// ==========================================
adminRouter.get('/support/tickets', async (req, res, next) => {
    try {
        const tickets = await db.supportTicket.findMany({});
        res.json({ tickets });
    } catch (e) { next(e); }
});

adminRouter.post('/support/tickets/:id/reply', async (req, res, next) => {
    try {
        const { id } = req.params;
        const { message } = req.body;
        if (!message) return res.status(400).json({ error: 'Message is required' });

        const ticket = await db.supportTicket.findUnique({ where: { id } });
        if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

        const replies = ticket.replies || [];
        replies.push({ from: 'admin', message, createdAt: new Date().toISOString() });

        const updated = await db.supportTicket.update({
            where: { id },
            data: { replies, status: 'replied' }
        });
        console.log(`[Support] Admin replied to ticket ${id}`);
        res.json({ success: true, ticket: updated });
    } catch (e) { next(e); }
});

adminRouter.post('/support/tickets/:id/close', async (req, res, next) => {
    try {
        const { id } = req.params;
        const ticket = await db.supportTicket.findUnique({ where: { id } });
        if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

        const updated = await db.supportTicket.update({
            where: { id },
            data: { status: 'closed' }
        });
        console.log(`[Support] Ticket ${id} closed`);
        res.json({ success: true, ticket: updated });
    } catch (e) { next(e); }
});

app.use('/admin/api', adminRouter);
app.use(errorHandler);

// --- TASK LOGIC ---
function updateTaskStep(taskId: string, step: TaskStep, details?: string, requesterId?: string, deposit?: number) {
    const existing = activeTasks.get(taskId);
    const newState: any = {
        taskId,
        requesterId: requesterId || existing?.requesterId || 'unknown',
        step,
        lastUpdate: Date.now(),
        details
    };
    if (existing && (existing as any).deposit) newState.deposit = (existing as any).deposit;
    if (deposit !== undefined) newState.deposit = deposit;

    activeTasks.set(taskId, newState as ActiveTaskState);
    firestoreService.updateTask(taskId, newState);
    broadcastSystemState();
}

function submitTaskInternal(task: TaskRequest, sourceWs?: WebSocket) {
    const base = task.deposit || 10;
    task.deposit = Math.ceil(base * (task.type === 'wasm' ? 1.2 : 1.0));
    updateTaskStep(task.taskId, 'submitted', `Deposit: ${task.deposit} GCP`, task.requesterId, task.deposit);
    let bidded = 0;
    console.log(`[Server] Submitting task ${task.taskId}. Total nodes available: ${nodes.size}`);
    nodes.forEach(n => {
        console.log(`[Server] Evaluated Node ID: ${n.info.id}, Type: ${n.info.type}, Status: ${n.info.status}`);
        if (n.info.status === 'idle' && n.info.type === 'agent') {
            console.log(`[Server] -> Sending auction_invite to ${n.info.id}`);
            n.ws.send(JSON.stringify({ type: 'auction_invite', payload: task }));
            bidded++;
        } else {
            console.log(`[Server] -> Skipped ${n.info.id}`);
        }
    });

    if (bidded === 0) {
        console.log(`[Server] No eligible agents found. Evaluated ${nodes.size} nodes.`);
        if (sourceWs) sourceWs.send(JSON.stringify({ type: 'error', payload: { message: 'No nodes' } }));
    }
}

function broadcastSystemState() {
    const tflops = calculateTotalTflops();
    const state = {
        type: 'system_state',
        payload: {
            nodes: Array.from(nodes.values()).map(n => n.info),
            activeTasks: Array.from(activeTasks.values()),
            totalTflops: tflops
        }
    };
    nodes.forEach(n => n.ws.send(JSON.stringify(state)));
}

// --- SERVER & WS STARTUP (STANDALONE ONLY) ---
const startStandaloneServer = () => {
    let server: any;
    try {
        const keyPath = path.join(certsDir, 'server.key');
        const certPath = path.join(certsDir, 'server.crt');
        const caPath = path.join(certsDir, 'ca.crt');

        if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
            const serverOptions = {
                key: fs.readFileSync(keyPath),
                cert: fs.readFileSync(certPath),
                ca: fs.existsSync(caPath) ? fs.readFileSync(caPath) : undefined,
                requestCert: true,
                rejectUnauthorized: false
            };
            server = https.createServer(serverOptions, app);
            console.log('[Server] Running Standalone with HTTPS');
        } else {
            server = http.createServer(app);
            console.log('[Server] SSL certs not found, running Standalone with HTTP');
        }
    } catch (e) {
        console.error('[Server] SSL init failed, falling back to HTTP:', e);
        server = http.createServer(app);
    }

    const wss = new WebSocketServer({ server });

    wss.on('connection', (ws: any) => {
        let nodeId: string | null = null;
        ws.on('message', async (data: any) => {
            try {
                const message = JSON.parse(data.toString());
                console.log(`[Server] Received message type: ${message.type} from ${nodeId || 'new connection'}`);
                if (message.type === 'register') {
                    nodeId = message.payload.id;
                    const nodeInfo = { ...message.payload, status: 'idle' };
                    nodes.set(nodeId!, { ws, info: nodeInfo });
                    firestoreService.updateNode(nodeId!, nodeInfo);
                    bqLog.nodeConnected(nodeId!, nodeInfo.trustScore || 50);

                    try {
                        let ownerId = 'system';
                        if (message.payload.token) {
                            const decoded = verifyToken(message.payload.token);
                            if (decoded) ownerId = decoded.userId;
                        }

                        await db.node.upsert({
                            where: { id: nodeId! },
                            update: {
                                status: 'idle',
                                name: nodeInfo.name,
                                performanceScore: nodeInfo.performanceScore,
                                publicKey: nodeInfo.publicKey,
                                ownerId: ownerId
                            },
                            create: {
                                id: nodeId!,
                                name: nodeInfo.name,
                                type: nodeInfo.type || 'agent',
                                publicKey: nodeInfo.publicKey,
                                performanceScore: nodeInfo.performanceScore,
                                ownerId: ownerId,
                                status: 'idle'
                            }
                        });
                        console.log(`[Server] Node ${nodeId} persisted (Owner: ${ownerId})`);

                        // Send confirmation back to node
                        ws.send(JSON.stringify({
                            type: 'registration_result',
                            payload: {
                                success: true,
                                ownerId: ownerId,
                                tokenValid: ownerId !== 'system'
                            }
                        }));
                    } catch (dbErr) {
                        console.error(`[Server] Failed to persist node ${nodeId}:`, dbErr);
                        ws.send(JSON.stringify({
                            type: 'registration_result',
                            payload: { success: false, error: 'Database persistence failed' }
                        }));
                    }
                } else if (message.type === 'task_request') {
                    submitTaskInternal(message.payload, ws);
                } else if (message.type === 'auction_bid') {
                    const { taskId, bidPrice } = message.payload;
                    const task = activeTasks.get(taskId);
                    if (task && task.step === 'submitted') {
                        const t = task as any;
                        if (!t.bids) t.bids = [];
                        t.bids.push({ nodeId: nodeId!, bidPrice, ws });

                        if (!t.auctionTimer) {
                            t.auctionTimer = setTimeout(() => {
                                if (t.bids.length > 0) {
                                    t.bids.sort((a: any, b: any) => a.bidPrice - b.bidPrice);
                                    const winner = t.bids[0];
                                    console.log(`[Server] Auction for ${taskId} won by ${winner.nodeId} at ${winner.bidPrice.toFixed(2)} PTS`);
                                    t.assignedNodeId = winner.nodeId; // Secure the assignment
                                    updateTaskStep(taskId, 'processing', `Awarded to ${winner.nodeId} for ${winner.bidPrice.toFixed(2)} PTS`);
                                    winner.ws.send(JSON.stringify({ type: 'task_award', payload: { taskId } }));
                                }
                            }, 1000);
                        }
                    }

                } else if (message.type === 'task_response') {
                    const response = message.payload as TaskResponse;
                    const task = activeTasks.get(response.taskId);
                    if (task) {
                        // [SECURITY] Verify that the reporting node is the one assigned to the task
                        if ((task as any).assignedNodeId && (task as any).assignedNodeId !== nodeId) {
                            console.warn(`[Security] Spoofed task_response for ${response.taskId} from ${nodeId} (Expected: ${(task as any).assignedNodeId})`);
                            return;
                        }

                        console.log(`[Server] Received task_response for ${response.taskId} from ${nodeId || 'unknown'}`);
                        updateTaskStep(response.taskId, 'verified', 'Task result received and verified');
                        const requester = Array.from(nodes.values()).find(n => n.info.id === task.requesterId);
                        if (requester) {
                            requester.ws.send(JSON.stringify({ type: 'task_response', payload: response }));
                        }
                        // P4: WS型でのワーカー報酬付与（deposit の70%）
                        if (response.workerId) {
                            const wsTaskDeposit = (activeTasks.get(response.taskId) as any)?.deposit || 10;
                            const wsWorkerReward = parseFloat((wsTaskDeposit * 0.70).toFixed(2));
                            const wsMargin = parseFloat((wsTaskDeposit * 0.30).toFixed(2));
                            console.log(`[Reward][WS] Worker ${response.workerId} earned ${wsWorkerReward} PTS. Platform margin: ${wsMargin} PTS (30%)`);
                            await db.user.update({
                                where: { id: response.workerId },
                                data: { points: { increment: wsWorkerReward } }
                            }).catch(e => console.error('[Reward][WS] Failed to reward worker:', e));

                            await db.pointTransaction.create({
                                data: {
                                    userId: response.workerId,
                                    type: 'REWARD',
                                    amount: wsWorkerReward,
                                    description: `WS Task Reward: ${response.taskId}`
                                }
                            }).catch(e => console.error('[Reward][WS] Failed to record transaction:', e));
                        }

                        // Remove completed task to prevent memory leaks (L-2, L-4)
                        setTimeout(() => {
                            activeTasks.delete(response.taskId);
                            firestoreService.removeTask(response.taskId);
                            broadcastSystemState();
                        }, 5000);
                    }
                } else if (message.type === 'gui_update_task_step') {
                    const { taskId, step, details } = message.payload;
                    updateTaskStep(taskId, step, details, nodeId!);
                } else if (message.type === 'status_update') {
                    const { cpuUsage, memUsage } = message.payload;
                    const node = nodes.get(nodeId!);
                    if (node) {
                        node.info.cpuUsage = cpuUsage;
                        node.info.memUsage = memUsage;
                        node.info.status = message.payload.status || node.info.status;
                        firestoreService.updateNode(nodeId!, node.info);
                    }
                }

                // Broadcast for real-time dashboard tracking
                const tflops = calculateTotalTflops();
                const state = {
                    type: 'system_state',
                    payload: {
                        nodes: Array.from(nodes.values()).map(n => n.info),
                        activeTasks: Array.from(activeTasks.values()),
                        totalTflops: tflops
                    }
                };
                nodes.forEach(n => n.ws.send(JSON.stringify(state)));

            } catch (e) { console.error(e); }
        });
        ws.on('close', () => {
            if (nodeId) {
                nodes.delete(nodeId);
                firestoreService.removeNode(nodeId);
            }
            // Broadcast update
            const tflops = calculateTotalTflops();
            const state = { type: 'system_state', payload: { nodes: Array.from(nodes.values()).map(n => n.info), activeTasks: Array.from(activeTasks.values()), totalTflops: tflops } };
            nodes.forEach(n => n.ws.send(JSON.stringify(state)));
        });
    });

    server.listen(port, "0.0.0.0", async () => {
        await initDemoData();
        logger.info(`[System] ZenKen Secure Server running on: ${port}`);

        // P3: タイムアウトした処理中タスクを定期的に再キューする（15秒ごと）
        setInterval(() => {
            globalQueue.checkTimeouts();
        }, 15000);
        console.log('[Queue] Timeout watchdog started (interval: 15s)');
    });
};

// Auto-seed Demo Account
async function initDemoData() {
    try {
        // 1. Demo Admin
        const adminEmail = 'demo@gigacompute.net';
        const adminUser = await db.user.findUnique({ where: { email: adminEmail } });
        if (!adminUser) {
            await db.user.create({
                data: {
                    id: 'admin-123',
                    email: adminEmail,
                    name: 'Demo Admin',
                    passwordHash: await hashPassword('password123'),
                    points: 1000
                }
            });
            console.log(`[Init] Admin created: ${adminEmail}`);
        }

        // 2. Demo Client (Demand Side)
        const clientEmail = 'demo-client@gigacompute.net';
        const clientUser = await db.user.findUnique({ where: { email: clientEmail } });
        if (!clientUser) {
            await db.user.create({
                data: {
                    id: 'client-demo',
                    email: clientEmail,
                    name: 'Demo Client',
                    passwordHash: await hashPassword('client123'),
                    points: 500,
                    language: 'ja'
                }
            });
            console.log(`[Init] Demo Client created: ${clientEmail} (Pass: client123)`);
        }

        // 3. Demo Worker (Supply Side)
        const workerEmail = 'demo-worker@gigacompute.net';
        const workerUser = await db.user.findUnique({ where: { email: workerEmail } });
        if (!workerUser) {
            await db.user.create({
                data: {
                    id: 'worker-demo',
                    email: workerEmail,
                    name: 'Demo Worker',
                    passwordHash: await hashPassword('worker123'),
                    points: 0,
                    earningsYen: 0
                }
            });
            console.log(`[Init] Demo Worker created: ${workerEmail} (Pass: worker123)`);
        }

        // 4. Seed Stripe Test User Transactions (Maintenance)
        const stripeTestEmail = 'stripe-test@example.com';
        const stripeUser = await db.user.findUnique({ where: { email: stripeTestEmail } });
        if (stripeUser) {
            const txs = await db.pointTransaction.findMany({ where: { userId: stripeUser.id } });
            if (txs.length === 0) {
                await db.pointTransaction.create({
                    data: { userId: stripeUser.id, type: 'CHARGE', amount: 100, description: 'Initial Seed Balance' }
                });
                await db.user.update({ where: { id: stripeUser.id }, data: { points: 100 } });
                console.log(`[Init] Seeded transactions for ${stripeTestEmail}`);
            }
        }
    } catch (err) {
        console.error('[Init] Failed to seed demo account:', err);
    }
}

// 起動方式の決定
// Cloud Run (Direct) またはローカル実行時は standalone server を起動。
// Firebase Functions (Functions Framework) 経由の場合は framework が listen を担当するため、ここでは避ける。
const isFunctionsFramework = !!process.env.FUNCTION_TARGET;

if (!isFunctionsFramework && require.main === module) {
    // ローカル、または Cloud Run (Direct) 環境での直接実行
    startStandaloneServer();
} else {
    process.stderr.write(`[System] Loading as imported module (K_SERVICE: ${process.env.K_SERVICE || 'none'}, FUNCTION_TARGET: ${process.env.FUNCTION_TARGET || 'none'})\n`);
}

process.stderr.write('[System] Exporting api function...\n');
// Export for Firebase Functions (Gen 2)
import { onRequest } from 'firebase-functions/v2/https';

export const api = onRequest(
    {
        cors: true,
        region: 'us-central1',
        maxInstances: 10,
        invoker: 'public',
        memory: '512MiB',
        timeoutSeconds: 120
    },
    app
);
