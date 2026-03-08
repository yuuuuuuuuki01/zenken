const API_BASE = window.location.origin; // Dynamic for tunnel access
let currentToken = null;
let pollInterval = null;

// DOM Elements
const loginOverlay = document.getElementById('login-overlay');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');
const refreshBtn = document.getElementById('refresh-btn');
const nodeGrid = document.getElementById('node-grid');

// Init
function init() {
    const savedToken = localStorage.getItem('giga_web_token');
    if (savedToken) {
        currentToken = savedToken;
        showDashboard();
    } else {
        loginOverlay.classList.add('active');
    }

    loginForm.addEventListener('submit', handleLogin);
    logoutBtn.addEventListener('click', handleLogout);
    refreshBtn.addEventListener('click', fetchDashboardData);
}

// Auth State
let isLoginMode = true;
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const nameGroup = document.getElementById('name-group');
const authSubmitBtn = document.getElementById('auth-submit-btn');

tabLogin.addEventListener('click', () => {
    isLoginMode = true;
    tabLogin.classList.add('active');
    tabLogin.style.borderBottomColor = 'var(--accent-primary)';
    tabRegister.classList.remove('active');
    tabRegister.style.borderBottomColor = 'transparent';
    nameGroup.style.display = 'none';
    document.getElementById('consent-group').style.display = 'none';
    authSubmitBtn.innerText = 'Connect to Nexus';
    loginError.innerText = '';
});

tabRegister.addEventListener('click', () => {
    isLoginMode = false;
    tabRegister.classList.add('active');
    tabRegister.style.borderBottomColor = 'var(--accent-primary)';
    tabLogin.classList.remove('active');
    tabLogin.style.borderBottomColor = 'transparent';
    nameGroup.style.display = 'block';
    document.getElementById('consent-group').style.display = 'block';
    authSubmitBtn.innerText = 'Register Account';
    loginError.innerText = '';
});

// Authentication
async function handleLogin(e) {
    e.preventDefault();
    loginError.innerText = '';
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const name = document.getElementById('name').value || email.split('@')[0];

    if (!isLoginMode) {
        const termsConsent = document.getElementById('reg-terms-consent').checked;
        const workerConsent = document.getElementById('reg-worker-consent').checked;
        if (!termsConsent || !workerConsent) {
            loginError.innerText = '利用規約およびワーカー参加規約への同意が必要です。';
            return;
        }
    }

    const endpoint = isLoginMode ? '/auth/login' : '/auth/register';
    const payload = isLoginMode ? { email, password } : { email, password, name };

    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (res.ok) {
            currentToken = data.token;
            localStorage.setItem('giga_web_token', currentToken);
            showDashboard();
        } else {
            loginError.innerText = data.error || (isLoginMode ? 'Login failed' : 'Registration failed');
        }
    } catch (err) {
        console.error('Auth Error:', err);
        loginError.innerText = 'Network error. Ensure server is running.';
    }
}

function handleLogout() {
    currentToken = null;
    localStorage.removeItem('giga_web_token');
    if (pollInterval) clearInterval(pollInterval);
    appContainer.classList.add('app-hidden');
    loginOverlay.classList.add('active');
    document.getElementById('email').value = '';
    document.getElementById('password').value = '';
}

// Dashboard Flow
function showDashboard() {
    loginOverlay.classList.remove('active');
    appContainer.classList.remove('app-hidden');
    fetchDashboardData();

    // Poll every 10 seconds to reduce network load but stay relatively fresh
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(fetchDashboardData, 10000);
}

async function fetchDashboardData() {
    if (!currentToken) return;

    try {
        refreshBtn.style.transform = 'rotate(180deg)'; // Spin animation hint
        const res = await fetch(`${API_BASE}/v1/worker/dashboard/data`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });

        if (res.status === 401) {
            handleLogout();
            return;
        }

        let data = await res.json();
        // The endpoint returns a Prisma User object: { id, email, name, nodes: [...] }
        renderDashboard(data);
        setTimeout(() => refreshBtn.style.transform = 'rotate(0deg)', 300);
    } catch (err) {
        console.error('Failed to fetch data:', err);
    }
}

let currentUserData = null;

// Profile Flow
const profileModal = document.getElementById('profile-modal');
const profileBtn = document.getElementById('profile-btn');
const closeProfileBtn = document.getElementById('close-profile-btn');
const profileForm = document.getElementById('profile-form');
const profileError = document.getElementById('profile-error');
const profileSuccess = document.getElementById('profile-success');

profileBtn.addEventListener('click', () => {
    profileModal.classList.add('active');
    document.getElementById('profile-name').value = document.getElementById('user-email').innerText.split('(')[0].trim() || '';
    document.getElementById('profile-password').value = '';
    document.getElementById('profile-openai-key').value = currentUserData?.openAiKey || '';
    document.getElementById('profile-gemini-key').value = currentUserData?.geminiKey || '';
    profileError.innerText = '';
    profileSuccess.innerText = '';
});

closeProfileBtn.addEventListener('click', () => profileModal.classList.remove('active'));

profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    profileError.innerText = '';
    profileSuccess.innerText = '';

    const name = document.getElementById('profile-name').value;
    const password = document.getElementById('profile-password').value;
    const openAiKey = document.getElementById('profile-openai-key').value;
    const geminiKey = document.getElementById('profile-gemini-key').value;
    const payload = {};
    if (name) payload.name = name;
    if (password) payload.password = password;
    if (openAiKey) payload.openAiKey = openAiKey; // send even if empty to allow clearing
    if (geminiKey) payload.geminiKey = geminiKey;

    try {
        const res = await fetch(`${API_BASE}/v1/worker/dashboard/profile`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            profileSuccess.innerText = 'プロフィールを更新しました。';
            fetchDashboardData();
            setTimeout(() => profileModal.classList.remove('active'), 1500);
        } else {
            const data = await res.json();
            profileError.innerText = data.error || '更新に失敗しました。';
        }
    } catch (err) {
        profileError.innerText = '通信エラーが発生しました。';
    }
});

// Token Generation Flow
const tokenBtn = document.getElementById('generate-token-btn');
const tokenModal = document.getElementById('token-modal');
const closeTokenBtn = document.getElementById('close-token-btn');
const copyTokenBtn = document.getElementById('copy-token-btn');
const tokenText = document.getElementById('generated-token-text');

tokenBtn.addEventListener('click', async () => {
    try {
        const res = await fetch(`${API_BASE}/v1/worker/dashboard/token`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const data = await res.json();
        if (res.ok) {
            tokenText.value = data.token;
            tokenModal.classList.add('active');
            copyTokenBtn.innerText = 'コピーする';
        }
    } catch (err) { console.error('Token fetch error', err); }
});

closeTokenBtn.addEventListener('click', () => tokenModal.classList.remove('active'));
copyTokenBtn.addEventListener('click', () => {
    tokenText.select();
    document.execCommand('copy');
    copyTokenBtn.innerText = 'コピーしました！';
});

// Withdrawal Flow
const withdrawBtn = document.getElementById('withdraw-btn');
const withdrawModal = document.getElementById('withdraw-modal');
const closeWithdrawBtn = document.getElementById('close-withdraw-btn');
const withdrawForm = document.getElementById('withdraw-form');
const withdrawError = document.getElementById('withdraw-error');
const withdrawSuccess = document.getElementById('withdraw-success');

withdrawBtn.addEventListener('click', () => {
    withdrawModal.classList.add('active');
    document.getElementById('withdraw-balance-display').innerText = document.getElementById('total-revenue').innerText;
    document.getElementById('withdraw-amount').value = '';
    document.getElementById('withdraw-destination').value = '';
    withdrawError.innerText = '';
    withdrawSuccess.innerText = '';
});

closeWithdrawBtn.addEventListener('click', () => withdrawModal.classList.remove('active'));

withdrawForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    withdrawError.innerText = '';
    withdrawSuccess.innerText = '';

    const amount = document.getElementById('withdraw-amount').value;
    const destination = document.getElementById('withdraw-destination').value;

    try {
        const res = await fetch(`${API_BASE}/v1/worker/dashboard/withdraw`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
            body: JSON.stringify({ amount, destination })
        });

        if (res.ok) {
            withdrawSuccess.innerText = '出金申請を受け付けました！';
            setTimeout(() => withdrawModal.classList.remove('active'), 2000);
        } else {
            const data = await res.json();
            withdrawError.innerText = data.error || '申請に失敗しました。';
        }
    } catch (err) {
        withdrawError.innerText = '通信エラーが発生しました。';
    }
});

// Rendering
function renderDashboard(data) {
    currentUserData = data;
    const displayName = data.name ? `${data.name} (${data.email})` : data.email;
    document.getElementById('user-email').innerText = displayName || 'Unknown User';

    // Compute totals
    let activeNodes = 0;
    let lifetimeRev = 0;
    let nodeCardsHtml = '';

    if (data.nodes && data.nodes.length > 0) {
        data.nodes.forEach(node => {
            if (node.status === 'idle' || node.status === 'computing') activeNodes++;
            lifetimeRev += (node.totalRevenue || 0);

            let statusClass = node.status === 'idle' ? 'status-idle' :
                node.status === 'computing' ? 'status-computing' : 'status-offline';

            nodeCardsHtml += `
            <div class="node-card">
                <div class="node-header">
                    <span class="node-type">${node.type || 'AGENT'}</span>
                    <span class="node-status-indicator ${statusClass}" title="Status: ${node.status}"></span>
                </div>
                <div class="node-body">
                    <div class="node-id">ID: ${node.id.substring(0, 16)}...</div>
                    <div class="node-stat-row">
                        <span class="label">Status</span>
                        <span style="text-transform: capitalize; color: ${node.status === 'computing' ? 'var(--warning)' : 'inherit'}">${node.status}</span>
                    </div>
                    ${node.currentTask ? `
                    <div class="node-stat-row" style="color: var(--warning); font-size: 0.8rem; border-top: 1px dotted rgba(255,255,255,0.1); padding-top: 4px;">
                        <span class="label">Job</span>
                        <span>${node.currentTask}</span>
                    </div>` : ''}
                </div>
            </div>`;
        });
    } else {
        nodeCardsHtml = `<div class="empty-state">No nodes connected to this account yet. Install the GigaCompute Desktop Agent to get started.</div>`;
    }

    document.getElementById('active-nodes-count').innerText = activeNodes;
    document.getElementById('total-nodes-count').innerText = data.nodes ? data.nodes.length : 0;
    // Format to 2 decimal places USD format for dummy display
    document.getElementById('total-revenue').innerText = (lifetimeRev).toFixed(2);
    nodeGrid.innerHTML = nodeCardsHtml;
}

// Boot
init();

// ==========================================
// --- Support & Debug Logic ---
// ==========================================

// Toggle Support Section
document.getElementById('support-btn').addEventListener('click', () => {
    document.querySelector('.dashboard-grid').style.display = 'none';
    document.getElementById('support-section').style.display = 'block';
    loadWorkerTickets();
});

document.getElementById('back-to-dashboard').addEventListener('click', () => {
    document.querySelector('.dashboard-grid').style.display = 'grid';
    document.getElementById('support-section').style.display = 'none';
});

// Worker Diagnostics
document.getElementById('btn-worker-diagnostics').addEventListener('click', async () => {
    const btn = document.getElementById('btn-worker-diagnostics');
    btn.textContent = '診断中...';
    btn.disabled = true;
    try {
        const res = await fetch(`${API_BASE}/v1/worker/support/diagnostics`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (res.ok) {
            const data = await res.json();
            const d = data.diagnostics;
            document.getElementById('worker-diag-result').style.display = 'block';

            document.getElementById('wdiag-account').innerHTML = `
                <div style="font-size: 0.85rem; line-height: 1.8;">
                    <div>✉ ${d.account.email || 'N/A'}</div>
                    <div>💰 PTS: <strong style="color: var(--accent-primary);">${d.account.points}</strong></div>
                    <div>💴 収益: ¥${d.account.earningsYen || 0}</div>
                </div>`;

            const wsStates = { 0: '接続中', 1: '接続済', 2: '切断中', 3: '切断済' };
            const nodesHtml = d.nodes.details.length > 0
                ? d.nodes.details.map(n => `
                    <div style="font-size: 0.8rem; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <span style="color: var(--accent-primary);">${n.id.substring(0, 12)}...</span>
                        <span style="margin-left: 8px; color: ${n.status === 'idle' ? '#00ff7f' : '#ffaa00'};">${n.status}</span>
                        <span style="margin-left: 8px; color: var(--text-muted);">WS: ${wsStates[n.wsState] || n.wsState}</span>
                    </div>`).join('')
                : '<div style="font-size: 0.85rem;">接続中のノードなし</div>';

            document.getElementById('wdiag-nodes').innerHTML = `
                <div style="font-size: 0.85rem; line-height: 1.8;">
                    <div>📝 登録済: ${d.nodes.registered} ノード</div>
                    <div>🔗 接続中: ${d.nodes.connected} ノード</div>
                </div>
                ${nodesHtml}`;

            const uptimeMin = Math.floor(d.serverInfo.uptime / 60);
            document.getElementById('wdiag-server').innerHTML = `
                <div style="font-size: 0.85rem; line-height: 1.8;">
                    <div>⬆ 稼働時間: ${uptimeMin} 分</div>
                    <div>🖥 全ノード: ${d.serverInfo.totalNodes}</div>
                    <div>📥 待機タスク: ${d.serverInfo.pendingTasks}</div>
                </div>`;

            document.getElementById('wdiag-txs').innerHTML = `
                <div style="font-size: 0.85rem; line-height: 1.8;">
                    <div>📊 直近取引: ${d.recentTransactions} 件</div>
                </div>`;
        }
    } catch (e) {
        console.error('Worker diagnostics error:', e);
    } finally {
        btn.textContent = '診断実行';
        btn.disabled = false;
    }
});

// Submit Worker Ticket
document.getElementById('btn-w-submit-ticket').addEventListener('click', async () => {
    const category = document.getElementById('w-ticket-category').value;
    const subject = document.getElementById('w-ticket-subject').value.trim();
    const message = document.getElementById('w-ticket-message').value.trim();
    const msgEl = document.getElementById('w-ticket-msg');

    if (!subject || !message) {
        msgEl.textContent = '件名と詳細を入力してください';
        msgEl.style.color = '#ff4d4d';
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/v1/worker/support/ticket`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${currentToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ category, subject, message })
        });
        if (res.ok) {
            msgEl.textContent = '✅ お問い合わせを送信しました';
            msgEl.style.color = '#00ff7f';
            document.getElementById('w-ticket-subject').value = '';
            document.getElementById('w-ticket-message').value = '';
            loadWorkerTickets();
            setTimeout(() => msgEl.textContent = '', 5000);
        } else {
            const err = await res.json();
            msgEl.textContent = err.error || '送信に失敗しました';
            msgEl.style.color = '#ff4d4d';
        }
    } catch (e) {
        msgEl.textContent = 'ネットワークエラー';
        msgEl.style.color = '#ff4d4d';
    }
});

// Load Worker Tickets
async function loadWorkerTickets() {
    const container = document.getElementById('w-ticket-history');
    try {
        const res = await fetch(`${API_BASE}/v1/worker/support/tickets`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (res.ok) {
            const data = await res.json();
            if (!data.tickets || data.tickets.length === 0) {
                container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem;">お問い合わせ履歴はありません。</p>';
                return;
            }
            container.innerHTML = data.tickets.map(t => {
                const statusColors = { open: '#ffaa00', replied: '#00e5ff', closed: '#666' };
                const statusLabels = { open: '受付中', replied: '回答済', closed: 'クローズ' };
                const repliesHtml = (t.replies || []).map(r => `
                    <div style="margin-top: 8px; padding: 8px 12px; background: rgba(${r.from === 'admin' ? '0,229,255' : '255,255,255'},0.05); border-radius: 6px; border-left: 3px solid ${r.from === 'admin' ? '#00e5ff' : '#888'};">
                        <div style="font-size: 0.75rem; color: var(--text-muted);">${r.from === 'admin' ? '👤 管理者' : '👤 自分'} ・ ${new Date(r.createdAt).toLocaleString()}</div>
                        <div style="font-size: 0.85rem; margin-top: 4px;">${r.message}</div>
                    </div>
                `).join('');
                return `
                    <div style="padding: 15px; margin-bottom: 12px; background: rgba(0,0,0,0.3); border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <span style="font-weight: 600;">${t.subject}</span>
                                <span style="margin-left: 10px; font-size: 0.75rem; padding: 2px 8px; background: ${statusColors[t.status] || '#666'}22; color: ${statusColors[t.status] || '#666'}; border-radius: 4px;">${statusLabels[t.status] || t.status}</span>
                            </div>
                            <span style="font-size: 0.75rem; color: var(--text-muted);">${new Date(t.createdAt).toLocaleString()}</span>
                        </div>
                        <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 8px;">${t.message}</div>
                        ${repliesHtml}
                    </div>`;
            }).join('');
        }
    } catch (e) {
        container.innerHTML = '<p style="color: #ff4d4d; font-size: 0.9rem;">読み込みに失敗しました。</p>';
    }
}
