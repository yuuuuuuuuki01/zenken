const API_BASE = window.location.origin;
let adminToken = '';
let currentView = 'overview';
let refreshInterval = null;
let throughputData = []; // Store recent TFLOPS for the chart

// --- Firebase Configuration ---
// Note: You must replace these values with your Firebase Project settings
const firebaseConfig = {
    apiKey: "AIzaSyCvH331RDeT6e3MbluAq9PjcQNFPNNfZBw",
    authDomain: "gigacompute-fleet.firebaseapp.com",
    projectId: "gigacompute-fleet",
    storageBucket: "gigacompute-fleet.firebasestorage.app",
    messagingSenderId: "821089499950",
    appId: "1:821089499950:web:6ce50cb0647857003858bf",
    measurementId: "G-6NQ1HQ23MR"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();

// App Check (Debug token enabled for local testing)
// self.FIREBASE_APPCHECK_DEBUG_TOKEN = true; 
const appCheck = firebase.appCheck();
appCheck.activate(new firebase.appCheck.ReCaptchaV3Provider('6LeZ-3ssAAAAAHpxIE7JEn7TfG9v01bVztB8nRcL'), true);

// ========== Auth ==========
auth.onAuthStateChanged(async (user) => {
    if (user) {
        adminToken = await user.getIdToken();
        localStorage.setItem('giga_admin_token', adminToken);
        console.log("[Auth] Session active:", user.email);
        if (document.getElementById('main-layout').style.display === 'none') {
            showMainLayout();
        }
    } else {
        adminToken = '';
        localStorage.removeItem('giga_admin_token');
        document.getElementById('main-layout').style.display = 'none';
        document.getElementById('auth-overlay').style.display = 'flex';
    }
});

document.getElementById('auth-btn').addEventListener('click', async () => {
    try {
        const result = await auth.signInWithPopup(provider);
        // Token will be handled by onAuthStateChanged
    } catch (error) {
        console.error("Auth error:", error);
        document.getElementById('auth-error').textContent = '認証失敗: ' + error.message;
    }
});

document.getElementById('logout-btn').addEventListener('click', () => {
    auth.signOut();
    adminToken = '';
    clearInterval(refreshInterval);
});

async function showMainLayout() {
    document.getElementById('auth-overlay').style.display = 'none';
    document.getElementById('main-layout').style.display = 'flex';
    await refreshAll();
    if (!refreshInterval) {
        refreshInterval = setInterval(refreshAll, 10000);
    }
}

// ========== Navigation ==========
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
        e.preventDefault();
        const view = item.getAttribute('data-view');
        switchView(view);
        item.closest('.sidebar-nav').querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');
    });
});

function switchView(view) {
    currentView = view;
    document.querySelectorAll('.view-section').forEach(s => s.style.display = 'none');
    document.getElementById(`view-${view}`).style.display = 'block';
    const titles = {
        overview: 'Overview',
        nodes: 'ノード管理',
        tasks: 'タスクキュー',
        users: 'ユーザー管理',
        transactions: '取引履歴',
        settings: 'システム設定',
        dispatch: 'アルゴリズム実行',
        maintenance: 'システム維持管理',
        versioning: 'バージョン管理',
        withdrawals: '出金管理',
        support: 'サポート管理'
    };
    document.getElementById('page-title').textContent = titles[view] || view;
    refreshAll();
}

document.getElementById('refresh-btn').addEventListener('click', () => refreshAll());

async function getAuthHeaders(forceRefresh = false) {
    let appCheckToken = '';
    try {
        const result = await appCheck.getToken();
        appCheckToken = result.token;
    } catch (e) { console.error("AppCheck error", e); }

    // If we have a user, get a fresh ID token
    if (auth.currentUser) {
        adminToken = await auth.currentUser.getIdToken(forceRefresh);
        localStorage.setItem('giga_admin_token', adminToken);
    }

    return {
        'Authorization': `Bearer ${adminToken}`,
        'x-firebase-appcheck': appCheckToken
    };
}

// ========== API Calls ==========
async function apiFetch(path, isRetry = false) {
    const headers = await getAuthHeaders(isRetry);
    const res = await fetch(`${API_BASE}/admin/api${path}`, { headers });

    if (res.status === 401 && !isRetry) {
        console.warn("[API] 401 Unauthorized, retrying with fresh token...");
        return apiFetch(path, true);
    }

    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
}

async function apiPost(path, body = null, isRetry = false) {
    const headers = await getAuthHeaders(isRetry);
    const opts = {
        method: 'POST',
        headers: headers
    };
    if (body) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }

    const res = await fetch(`${API_BASE}/admin/api${path}`, opts);

    if (res.status === 401 && !isRetry) {
        console.warn("[API] 401 Unauthorized, retrying with fresh token...");
        return apiPost(path, body, true);
    }

    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
}

async function refreshAll() {
    let statsOk = false;
    try {
        const stats = await apiFetch('/stats');
        updateStats(stats);
        updateServerStatus(true, stats.uptime);
        statsOk = true;
    } catch (e) {
        console.error("Stats API failed:", e);
        updateServerStatus(false, 0);
        return;
    }

    if (!statsOk) return;

    try {
        if (currentView === 'overview') {
            const tasks = await apiFetch('/active-tasks');
            renderActiveTasks(tasks.activeTasks || []);
            // users count for stat card
            const users = await apiFetch('/users');
            document.getElementById('stat-users').textContent = users.users.length;
        } else if (currentView === 'nodes') {
            const data = await apiFetch('/nodes');
            renderNodes(data.nodes || []);
        } else if (currentView === 'tasks') {
            const [tasksData, jobsData, statsData] = await Promise.all([
                apiFetch('/active-tasks'),
                apiFetch('/jobs'),
                apiFetch('/stats')
            ]);
            renderTasks(tasksData.activeTasks || [], statsData);
            renderJobs(jobsData.jobs || []);
        } else if (currentView === 'users') {
            const data = await apiFetch('/users');
            renderUsers(data.users || []);
        } else if (currentView === 'transactions') {
            const data = await apiFetch('/transactions');
            renderTransactions(data.transactions || []);
        } else if (currentView === 'settings') {
            const [config, envs, algo] = await Promise.all([
                apiFetch('/config'),
                apiFetch('/env'),
                apiFetch('/config/algorithm')
            ]);
            renderSettings(config, envs, algo);
        } else if (currentView === 'maintenance') {
            const [certsData, assetsData] = await Promise.all([
                apiFetch('/maintenance/certs'),
                apiFetch('/maintenance/assets')
            ]);
            renderMaintenance(certsData, assetsData);
        } else if (currentView === 'dispatch') {
            const manifest = await apiFetch('/algorithm/manifest');
            renderAlgoManifest(manifest);
        } else if (currentView === 'versioning') {
            const versionData = await apiFetch('/version');
            renderVersioning(versionData);
        } else if (currentView === 'withdrawals') {
            const data = await apiFetch('/withdrawals/pending');
            renderWithdrawals(data.transactions || []);
        } else if (currentView === 'support') {
            const data = await apiFetch('/support/tickets');
            renderSupportTickets(data.tickets || []);
        }
    } catch (e) {
        console.error("View data refresh error:", e);
    }
}

function renderWithdrawals(txs) {
    document.getElementById('withdrawals-count').textContent = txs.length;
    const tbody = document.getElementById('withdrawals-tbody');
    if (txs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">保留中の申請はありません</td></tr>';
        return;
    }
    tbody.innerHTML = txs.map(t => `
        <tr>
            <td style="color:var(--text-muted)">${(t.id || '').substring(0, 10)}</td>
            <td style="color:var(--text-muted)">${(t.userId || '').substring(0, 10)}...</td>
            <td style="color:var(--accent); font-weight:600">${t.amount} JPY</td>
            <td style="color:var(--text-muted)">${t.createdAt ? new Date(t.createdAt).toLocaleString('ja-JP') : '—'}</td>
            <td style="color:var(--text-muted); font-size:0.85rem">${t.description || '—'}</td>
            <td>
                <div style="display:flex; gap:8px;">
                    <button class="btn-primary-sm" onclick="approveWithdrawal('${t.id}')">承認</button>
                    <button class="btn-outline-sm" style="border-color:var(--error); color:var(--error)" onclick="rejectWithdrawal('${t.id}')">却下</button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function approveWithdrawal(id) {
    if (!confirm('この出金申請を承認しますか？ユーザーの earningsYen が更新されます。')) return;
    try {
        const res = await apiPost(`/withdrawals/${id}/approve`);
        if (res.success) {
            alert('承認しました');
            refreshAll();
        } else throw new Error(res.error);
    } catch (e) { alert('承認失敗: ' + e.message); }
}

async function rejectWithdrawal(id) {
    const reason = prompt('却下理由を入力してください（ユーザーにポイントが返還されます）:', '振込先不備');
    if (reason === null) return;
    try {
        const res = await apiPost(`/withdrawals/${id}/reject`, { reason });
        if (res.success) {
            alert('却下し、ポイントを返還しました');
            refreshAll();
        } else throw new Error(res.error);
    } catch (e) { alert('却下失敗: ' + e.message); }
}

function renderAlgoManifest(m) {
    const el = document.getElementById('algo-manifest-container');
    if (!m) return;

    el.innerHTML = `
        <div class="algo-header">
            <div class="algo-title-group">
                <h3>${m.name}</h3>
                <div class="step-desc">${m.description}</div>
            </div>
            <div class="algo-version">${m.version}</div>
        </div>

        <div class="logic-flow">
            ${m.logicFlow.map(step => `
                <div class="logic-step ${step.active ? 'active' : ''}">
                    <div class="logic-step-label">
                        <span class="step-num">STEP ${step.step}</span>
                        <span class="step-name">${step.label}</span>
                        ${step.active ? '<span class="badge badge-success" style="font-size:0.6rem">ENABLED</span>' : ''}
                    </div>
                    <div class="step-desc">${step.desc}</div>
                </div>
            `).join('')}
        </div>

        <div class="algo-requirements">
            <div class="req-item">
                <div class="req-label">Default Trust Reg.</div>
                <div class="req-value">${m.requirements.defaultTrust}</div>
            </div>
            <div class="req-item">
                <div class="req-label">Sensitive Trust Reg.</div>
                <div class="req-value" style="color:var(--warning)">${m.requirements.sensitiveTrust}</div>
            </div>
        </div>
    `;
}

function updateServerStatus(online, uptime) {
    const dot = document.getElementById('server-dot');
    const txt = document.getElementById('server-status-text');
    if (online) {
        dot.className = 'status-dot online';
        txt.textContent = 'サーバー稼働中';
        document.getElementById('uptime-label').textContent = `Uptime: ${formatUptime(uptime)}`;
    } else {
        dot.className = 'status-dot offline';
        txt.textContent = 'サーバー停止';
    }
}

function formatUptime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function updateStats(s) {
    document.getElementById('stat-nodes').textContent = s.connectedNodes;
    document.getElementById('stat-queue-pending').textContent = s.queuePending;
    document.getElementById('stat-queue-processing').textContent = s.queueProcessing;
    document.getElementById('stat-active-tasks').textContent = s.activeTasks;
    document.getElementById('stat-active-jobs').textContent = s.activeJobs;
    if (s.totalTflops !== undefined) {
        document.getElementById('stat-tflops').textContent = s.totalTflops.toFixed(2);
        updateThroughputChart(s.totalTflops);
    }
}

function updateThroughputChart(currentTflops) {
    const chartEl = document.getElementById('throughput-chart');
    if (!chartEl) return;

    throughputData.push(currentTflops);
    if (throughputData.length > 50) throughputData.shift();

    const maxVal = Math.max(...throughputData, 1);
    chartEl.innerHTML = throughputData.map(val => {
        const height = (val / maxVal) * 100;
        return `<div class="bar" style="height: ${height}%; width: 10px; background: var(--accent); opacity: 0.7; border-radius: 2px 2px 0 0;"></div>`;
    }).join('');
}

function renderJobs(jobs) {
    document.getElementById('jobs-count').textContent = jobs.length;
    const tbody = document.getElementById('jobs-tbody');
    if (jobs.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">ジョブ履歴なし</td></tr>'; return; }
    tbody.innerHTML = jobs.map(j => `
        <tr>
            <td style="color:var(--accent)">${j.id.substring(0, 16)}...</td>
            <td><code class="tag">${j.type}</code></td>
            <td><span class="st-${j.status}">${j.status}</span></td>
            <td>${j.cost.toFixed(1)}</td>
            <td style="color:var(--text-muted)">${j.userId.substring(0, 8)}...</td>
            <td style="color:var(--text-muted)">${j.createdAt ? new Date(j.createdAt).toLocaleString('ja-JP') : '—'}</td>
        </tr>
    `).join('');
}

// ========== Render Functions ==========
function renderActiveTasks(tasks) {
    const el = document.getElementById('active-tasks-list');
    document.getElementById('active-tasks-count').textContent = tasks.length;
    if (tasks.length === 0) { el.innerHTML = '<p class="empty-msg">アクティブなタスクはありません</p>'; return; }
    el.innerHTML = tasks.map(t => `
        <div class="task-row">
            <div>
                <div class="task-id">${t.taskId}</div>
                <div class="task-detail">Requester: ${t.requesterId || '—'} ${t.details ? '| ' + t.details : ''}</div>
            </div>
            <span class="step-badge step-${t.step}">${t.step}</span>
            <span style="font-size:0.72rem;color:var(--text-muted);font-family:var(--mono)">
                ${timeSince(t.lastUpdate)}
            </span>
        </div>
    `).join('');
}

function renderNodes(nodes) {
    document.getElementById('nodes-count').textContent = nodes.length;
    const tbody = document.getElementById('nodes-tbody');
    if (nodes.length === 0) { tbody.innerHTML = '<tr><td colspan="8" class="empty-msg">接続ノードなし</td></tr>'; return; }
    tbody.innerHTML = nodes.map(n => `
        <tr>
            <td style="color:var(--accent)">${n.id}</td>
            <td>${n.type || 'agent'}</td>
            <td><span class="st-${n.status}">${n.status}</span></td>
            <td>${n.trustScore ?? '--'}</td>
            <td>${n.performanceScore ?? '--'}</td>
            <td>${(n.rewardPoints ?? 0).toFixed(1)}</td>
            <td class="${n.wsReadyState === 1 ? 'ws-open' : 'ws-close'}">${wsStateLabel(n.wsReadyState)}</td>
            <td>
                <button class="btn-kick" onclick="kickNode('${n.id}')">KICK</button>
            </td>
        </tr>
    `).join('');
}

function wsStateLabel(s) {
    return { 0: 'CONNECTING', 1: 'OPEN', 2: 'CLOSING', 3: 'CLOSED' }[s] || '?';
}

async function kickNode(nodeId) {
    if (!confirm(`ノード "${nodeId}" を強制切断しますか？`)) return;
    try {
        const data = await apiPost(`/kick/${nodeId}`);
        alert(data.message || 'Kicked');
        refreshAll();
    } catch (e) { alert('Kick failed: ' + e.message); }
}

function renderTasks(tasks, stats) {
    const queueEl = document.getElementById('queue-stats');
    queueEl.innerHTML = `
        <div class="q-stat">待機中: <span>${stats.queuePending}</span></div>
        <div class="q-stat">処理中: <span>${stats.queueProcessing}</span></div>
        <div class="q-stat">アクティブジョブ: <span>${stats.activeJobs}</span></div>
    `;
    const tbody = document.getElementById('tasks-tbody');
    if (tasks.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">タスクなし</td></tr>'; return; }
    tbody.innerHTML = tasks.map(t => `
        <tr>
            <td style="color:var(--accent)">${t.taskId}</td>
            <td style="color:var(--text-muted)">${(t.jobId || '').substring(0, 10) || '—'}</td>
            <td><span class="step-badge step-${t.step}">${t.step}</span></td>
            <td>${t.requesterId || '—'}</td>
            <td style="color:var(--text-muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.details || '—'}</td>
            <td style="color:var(--text-muted)">${timeSince(t.lastUpdate)}</td>
        </tr>
    `).join('');
}

function renderUsers(users) {
    document.getElementById('users-count').textContent = users.length;
    document.getElementById('stat-users').textContent = users.length;
    const tbody = document.getElementById('users-tbody');
    if (users.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">ユーザーなし</td></tr>'; return; }
    tbody.innerHTML = users.map(u => `
        <tr>
            <td style="color:var(--text-muted)">${u.id.substring(0, 12)}...</td>
            <td>${u.email}</td>
            <td>${u.name || '—'}</td>
            <td style="color:var(--accent)">${(u.points || 0).toFixed(1)} PTS</td>
            <td style="color:var(--text-muted)">${u.createdAt ? new Date(u.createdAt).toLocaleDateString('ja-JP') : '—'}</td>
            <td>
                <button class="btn-primary-sm" onclick="grantPoints('${u.id}', '${u.name || u.email}')">付与</button>
            </td>
        </tr>
    `).join('');
}

let selectedUserId = null;

async function grantPoints(userId, userName) {
    selectedUserId = userId;
    document.getElementById('pts-modal-user').textContent = `ユーザー: ${userName} (${userId.substring(0, 8)}...)`;
    document.getElementById('pts-amount-input').value = '100';
    document.getElementById('pts-desc-input').value = 'Admin manual grant';
    document.getElementById('pts-modal').style.display = 'flex';
}

// Modal Event Listeners
document.getElementById('close-pts-modal').addEventListener('click', () => {
    document.getElementById('pts-modal').style.display = 'none';
});

document.getElementById('pts-modal').addEventListener('click', (e) => {
    if (e.target.id === 'pts-modal') {
        document.getElementById('pts-modal').style.display = 'none';
    }
});

document.getElementById('confirm-pts-btn').addEventListener('click', async () => {
    const amount = document.getElementById('pts-amount-input').value;
    const description = document.getElementById('pts-desc-input').value;
    const btn = document.getElementById('confirm-pts-btn');

    if (!amount || isNaN(parseFloat(amount))) {
        alert('有効な数値を入力してください');
        return;
    }

    btn.disabled = true;
    btn.textContent = '処理中...';

    try {
        const data = await apiPost(`/users/${selectedUserId}/points`, {
            amount: parseFloat(amount),
            description: description || 'Admin manual grant'
        });
        if (data.success) {
            alert(`正常に付与されました。新残高: ${data.newBalance.toFixed(1)} PTS`);
            document.getElementById('pts-modal').style.display = 'none';
            refreshAll();
        } else {
            throw new Error(data.error || 'Failed to grant points');
        }
    } catch (e) {
        alert('付与失敗: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '付与を実行';
    }
});

function renderTransactions(txs) {
    const tbody = document.getElementById('transactions-tbody');
    if (txs.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">取引なし</td></tr>'; return; }
    tbody.innerHTML = txs.map(t => `
        <tr>
            <td style="color:var(--text-muted)">${(t.id || '').substring(0, 10)}</td>
            <td><span class="tx-${t.type}" style="font-weight:600">${t.type}</span></td>
            <td style="color:${t.type === 'WITHDRAW' ? 'var(--warning)' : 'var(--success)'}">${t.amount > 0 ? '+' : ''}${t.amount}</td>
            <td style="color:var(--text-muted)">${(t.userId || '').substring(0, 10)}...</td>
            <td style="font-family:var(--mono); font-size:0.75rem; color: #818cf8;">
                ${t.stripeSessionId ? t.stripeSessionId.substring(0, 12) + '...' : '<span style="color:var(--text-muted)">Manual</span>'}
            </td>
            <td style="color:var(--text-muted)">${t.description || '—'}</td>
            <td style="color:var(--text-muted)">${t.createdAt ? new Date(t.createdAt).toLocaleString('ja-JP') : '—'}</td>
        </tr>
    `).join('');
}

async function renderSettings(config, envs, algo) {
    document.getElementById('setting-bq-enabled').checked = config.bqEnabled;
    document.getElementById('setting-bq-dataset').value = config.bqDataset || '';

    // Render Algorithm Settings
    if (algo) {
        document.getElementById('algo-geo-premium').value = algo.market.geoPremium;
        document.getElementById('algo-sensitive-premium').value = algo.market.sensitivePremium;
        document.getElementById('algo-finetune-premium').value = algo.market.fineTuningPremium;
        document.getElementById('algo-default-trust').value = algo.market.defaultTrust;
        document.getElementById('algo-sensitive-trust').value = algo.market.sensitiveTrust;
        document.getElementById('algo-demand-sensitivity').value = algo.market.demandSensitivity || 0.5;
        document.getElementById('algo-timeout').value = Math.floor(algo.timeoutMs / 1000);
    }

    const envEl = document.getElementById('env-list');
    if (!envs || Object.keys(envs).length === 0) {
        envEl.innerHTML = '<p class="empty-msg">環境変数を取得できませんでした</p>';
    } else {
        envEl.innerHTML = Object.entries(envs).map(([k, v]) => `
            <div class="env-row">
                <div class="env-key">${k}</div>
                <div class="env-val">${v}</div>
            </div>
        `).join('');
    }
}

// ========== Event Listeners (Admin Features) ==========
document.getElementById('save-bq-btn').addEventListener('click', async () => {
    const enabled = document.getElementById('setting-bq-enabled').checked;
    const dataset = document.getElementById('setting-bq-dataset').value.trim();

    try {
        const data = await apiPost('/config', { bqEnabled: enabled, bqDataset: dataset });
        alert(data.message || '設定を保存しました');
    } catch (e) {
        alert('保存失敗: ' + e.message);
    }
});

document.getElementById('save-algo-btn').addEventListener('click', async () => {
    const geo = document.getElementById('algo-geo-premium').value;
    const sensitive = document.getElementById('algo-sensitive-premium').value;
    const finetune = document.getElementById('algo-finetune-premium').value;
    const defTrust = document.getElementById('algo-default-trust').value;
    const sensTrust = document.getElementById('algo-sensitive-trust').value;
    const timeout = document.getElementById('algo-timeout').value;

    try {
        const data = await apiPost('/config/algorithm', {
            geoPremium: geo,
            sensitivePremium: sensitive,
            fineTuningPremium: finetune,
            demandSensitivity: document.getElementById('algo-demand-sensitivity').value,
            defaultTrust: defTrust,
            sensitiveTrust: sensTrust,
            timeoutMs: timeout * 1000
        });
        alert(data.message || 'アルゴリズム設定を保存しました');
    } catch (e) {
        alert('保存失敗: ' + e.message);
    }
});

// ========== Init ==========
// Firebase Auth handles session persistence. UI state is managed in onAuthStateChanged.
// ========== Maintenance Functions ==========
function renderMaintenance(certsData, assetsData) {
    // Stats
    const certsOk = certsData.certs.every(c => c.daysRemaining > 30);
    document.getElementById('stat-certs-ok').textContent = certsOk ? '正常' : '要更新';
    document.getElementById('stat-certs-ok').parentElement.style.color = certsOk ? '#4ade80' : '#f87171';
    document.getElementById('stat-assets-count').textContent = assetsData.assets.filter(a => a.exists).length + '個';

    // Certs Table
    const certsBody = document.getElementById('certs-table-body');
    certsBody.innerHTML = certsData.certs.map(c => `
        <tr>
            <td style="font-family:var(--mono)">${c.file}</td>
            <td>${c.subject}</td>
            <td>${new Date(c.notAfter).toLocaleDateString()}</td>
            <td>
                <span style="color: ${c.daysRemaining < 30 ? '#f87171' : 'inherit'}">
                    ${c.daysRemaining} 日
                </span>
            </td>
        </tr>
    `).join('');

    // Assets Table
    const assetsBody = document.getElementById('assets-table-body');
    assetsBody.innerHTML = assetsData.assets.map(a => `
        <tr>
            <td>${a.label}</td>
            <td><code class="tag">${a.version || '—'}</code></td>
            <td>${a.exists ? (a.size / 1024 / 1024).toFixed(2) + ' MB' : '<span style="color:var(--text-muted)">なし</span>'}</td>
            <td>${a.exists ? new Date(a.updatedAt).toLocaleString() : '—'}</td>
        </tr>
    `).join('');
}

// Event Listeners for Maintenance
document.getElementById('db-backup-btn').addEventListener('click', () => {
    // Note: window.open cannot set headers, so DB backup uses query param as fallback
    window.open(`${API_BASE}/admin/api/maintenance/db/backup?admin_token=${adminToken}`, '_blank');
});

document.getElementById('refresh-assets-btn').addEventListener('click', () => refreshAll());

document.getElementById('renew-certs-btn').addEventListener('click', async () => {
    if (!confirm('全ての証明書を再生成しますか？この操作により既存の接続が切断される可能性があります。')) return;
    try {
        const data = await apiPost('/maintenance/certs/renew');
        alert(data.message || '証明書を更新しました。有効にするにはサーバーを再起動してください。');
        refreshAll();
    } catch (e) {
        alert('更新失敗: ' + e.message);
    }
});

// Dispatch Test Task
if (document.getElementById('dispatch-test-task-btn')) {
    document.getElementById('dispatch-test-task-btn').addEventListener('click', async () => {
        try {
            const data = await apiPost('/tasks/test');
            alert(data.message || 'Dispatch success');
            refreshAll();
        } catch (e) { alert('Dispatch failed: ' + e.message); }
    });
}

// Admin Dispatch Feature
if (document.getElementById('dispatch-submit-btn')) {
    document.getElementById('dispatch-submit-btn').addEventListener('click', async () => {
        const type = document.getElementById('dispatch-type').value;
        const payload = document.getElementById('dispatch-payload').value;
        const statusEl = document.getElementById('dispatch-status');

        if (!payload.trim()) {
            alert('ペイロードを入力してください');
            return;
        }

        statusEl.textContent = '投入中...';
        statusEl.style.color = 'var(--accent)';

        try {
            const data = await apiPost('/tasks/submit', { type, payload });
            if (data.success) {
                statusEl.textContent = '投入成功: ' + data.taskId;
                statusEl.style.color = 'var(--success)';
                document.getElementById('dispatch-payload').value = '';
            } else {
                throw new Error(data.error || 'Unknown error');
            }
        } catch (e) {
            statusEl.textContent = '投入失敗: ' + e.message;
            statusEl.style.color = 'var(--error)';
        }
    });
}

if (document.getElementById('copy-token-btn')) {
    document.getElementById('copy-token-btn').addEventListener('click', () => {
        if (!adminToken) return alert('トークンがありません。ログインしてください。');
        navigator.clipboard.writeText(adminToken);
        alert('トークンをクリップボードにコピーしました');
    });
}

// ========== Versioning Functions ==========
function renderVersioning(v) {
    const el = document.getElementById('current-version-info');
    if (!v) return;

    el.innerHTML = `
        <div style="padding: 15px;">
            <div style="font-family: Orbitron; font-size: 1.5rem; color: var(--accent); margin-bottom: 10px;">${v.version}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 5px;">Public Status: <span class="badge ${v.isPublic ? 'badge-success' : 'badge-warning'}">${v.isPublic ? 'PUBLIC' : 'HIDDEN'}</span></div>
            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px;">
                <strong>Release Notes:</strong><br>
                ${v.releaseNotes}
            </div>
            <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 10px;">
                WIN: <a href="${v.downloadUrl}" target="_blank" style="color: var(--accent)">URL</a> | 
                MAC: <a href="${v.macDownloadUrl}" target="_blank" style="color: var(--accent)">URL</a>
            </div>
        </div>
    `;

    // Pre-fill form
    document.getElementById('ver-input-version').value = v.version;
    document.getElementById('ver-input-url').value = v.downloadUrl;
    document.getElementById('ver-input-mac-url').value = v.macDownloadUrl;
    document.getElementById('ver-input-notes').value = v.releaseNotes;
    document.getElementById('ver-input-public').checked = v.isPublic;
}

if (document.getElementById('btn-save-version')) {
    document.getElementById('btn-save-version').addEventListener('click', async () => {
        const btn = document.getElementById('btn-save-version');
        const winFile = document.getElementById('ver-file-win').files[0];
        const macFile = document.getElementById('ver-file-mac').files[0];

        btn.disabled = true;
        btn.textContent = '処理中...';

        try {
            // 1. Upload files if any
            if (winFile || macFile) {
                const formData = new FormData();
                if (winFile) formData.append('agent_win', winFile);
                if (macFile) formData.append('agent_mac', macFile);

                const uploadRes = await fetch(API_BASE + '/upload/agent', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${adminToken}` },
                    body: formData
                });
                const uploadData = await uploadRes.json();
                if (!uploadData.success) throw new Error(uploadData.error || 'Upload failed');

                // If uploaded, these URLs are now relative to server
                if (winFile) document.getElementById('ver-input-url').value = '/downloads/zen-agent.zip';
                if (macFile) document.getElementById('ver-input-mac-url').value = '/downloads/zen-agent-mac.zip';
            }

            // 2. Save version info
            const payload = {
                version: document.getElementById('ver-input-version').value,
                downloadUrl: document.getElementById('ver-input-url').value,
                macDownloadUrl: document.getElementById('ver-input-mac-url').value,
                releaseNotes: document.getElementById('ver-input-notes').value,
                isPublic: document.getElementById('ver-input-public').checked
            };

            const data = await apiPost('/version', payload);
            if (data.success) {
                alert('バージョン情報を更新しました' + (payload.isPublic ? '（全エージェントに通知されました）' : ''));
                document.getElementById('ver-file-win').value = '';
                document.getElementById('ver-file-mac').value = '';
                refreshAll();
            } else {
                throw new Error(data.error || 'Failed to update version');
            }
        } catch (e) {
            alert('操作失敗: ' + e.message);
        } finally {
            btn.disabled = false;
            btn.textContent = 'バージョンを更新して配布開始';
        }
    });
}

// ========== Support Ticket Management ==========
let allTickets = [];

function renderSupportTickets(tickets) {
    allTickets = tickets;
    const filter = document.getElementById('ticket-filter')?.value || 'all';
    const filtered = filter === 'all' ? tickets : tickets.filter(t => t.status === filter);
    document.getElementById('tickets-count').textContent = filtered.length;

    const container = document.getElementById('admin-tickets-container');
    if (filtered.length === 0) {
        container.innerHTML = '<p class="empty-msg">チケットなし</p>';
        return;
    }

    container.innerHTML = filtered.map(t => {
        const statusColors = { open: '#f59e0b', replied: '#00e5ff', closed: '#666' };
        const statusLabels = { open: '受付中', replied: '回答済', closed: 'クローズ' };
        const typeLabels = { client: 'クライアント', worker: 'ワーカー' };
        const categoryLabels = { billing: '課金', task: 'タスク', account: 'アカウント', api: 'API', agent: 'エージェント', other: 'その他' };

        const repliesHtml = (t.replies || []).map(r => `
            <div style="margin-top: 8px; padding: 10px 14px; background: rgba(0,229,255,0.05); border-radius: 6px; border-left: 3px solid #00e5ff;">
                <div style="font-size: 0.75rem; color: var(--text-muted);">👤 管理者 ・ ${new Date(r.createdAt).toLocaleString('ja-JP')}</div>
                <div style="font-size: 0.85rem; margin-top: 4px;">${r.message}</div>
            </div>
        `).join('');

        return `
            <div style="padding: 18px; margin-bottom: 15px; background: rgba(0,0,0,0.3); border-radius: 10px; border: 1px solid rgba(255,255,255,0.08);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                    <div>
                        <span style="font-weight: 700; font-size: 1rem;">${t.subject}</span>
                        <span style="margin-left: 10px; font-size: 0.7rem; padding: 2px 8px; background: ${statusColors[t.status] || '#666'}22; color: ${statusColors[t.status] || '#666'}; border-radius: 4px;">${statusLabels[t.status] || t.status}</span>
                        <span style="margin-left: 6px; font-size: 0.7rem; padding: 2px 6px; background: rgba(255,255,255,0.05); border-radius: 4px;">${typeLabels[t.userType] || t.userType}</span>
                        <span style="margin-left: 6px; font-size: 0.7rem; padding: 2px 6px; background: rgba(255,255,255,0.05); border-radius: 4px;">${categoryLabels[t.category] || t.category}</span>
                    </div>
                    <span style="font-size: 0.75rem; color: var(--text-muted);">${new Date(t.createdAt).toLocaleString('ja-JP')}</span>
                </div>
                <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 8px;">ユーザー: ${(t.userId || '').substring(0, 12)}...</div>
                <div style="font-size: 0.9rem; padding: 10px; background: rgba(255,255,255,0.03); border-radius: 6px; margin-bottom: 10px;">${t.message}</div>
                ${repliesHtml}
                ${t.status !== 'closed' ? `
                <div style="margin-top: 12px; display: flex; gap: 10px; align-items: center;">
                    <input type="text" id="reply-${t.id}" class="input-sm" placeholder="返信を入力..." style="flex: 1; padding: 8px 12px;">
                    <button class="btn-primary-sm" onclick="replyTicket('${t.id}')">💬 返信</button>
                    <button class="btn-outline-sm" style="border-color: var(--text-muted);" onclick="closeTicket('${t.id}')">✕ クローズ</button>
                </div>` : ''}
            </div>`;
    }).join('');
}

// Ticket filter change
if (document.getElementById('ticket-filter')) {
    document.getElementById('ticket-filter').addEventListener('change', () => {
        renderSupportTickets(allTickets);
    });
}

async function replyTicket(ticketId) {
    const input = document.getElementById(`reply-${ticketId}`);
    const message = input.value.trim();
    if (!message) return alert('返信内容を入力してください');

    try {
        const data = await apiPost(`/support/tickets/${ticketId}/reply`, { message });
        if (data.success) {
            input.value = '';
            refreshAll();
        } else throw new Error(data.error);
    } catch (e) {
        alert('返信失敗: ' + e.message);
    }
}

async function closeTicket(ticketId) {
    if (!confirm('このチケットをクローズしますか？')) return;
    try {
        const data = await apiPost(`/support/tickets/${ticketId}/close`);
        if (data.success) {
            refreshAll();
        } else throw new Error(data.error);
    } catch (e) {
        alert('クローズ失敗: ' + e.message);
    }
}

// timeSince helper
function timeSince(dateStr) {
    if (!dateStr) return '—';
    const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (secs < 60) return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    return `${Math.floor(secs / 3600)}h ago`;
}
