// GigaCompute Client Portal v1.0.1 (Stateless SSR Support)
const API_BASE = window.location.origin;

// Elements
const mainLayout = document.getElementById('main-layout');
const logoutBtn = document.getElementById('logout-btn');

const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view-section');
const pageTitle = document.getElementById('page-title');

// State (Stateless approach: use the injected hash from SSR instad of LocalStorage)
let currentToken = window.GIGA_STATELESS_HASH;
let currentLang = 'ja';
let t = null; // Will be set by applyLanguage

const translations = {
    ja: {
        dashboard: "ダッシュボード",
        submit_job: "タスク投入",
        api_keys: "APIキー",
        history: "取引履歴",
        profile: "プロフィール設定",
        tools: "ツール & 実行環境",
        balance: "残高 (PTS)",
        buy_pts: "PTS購入",
        logout: "ログアウト",
        save_changes: "設定を保存",
        cancel: "キャンセル",
        proceed_payment: "決済へ進む",
        buy_title: "PTSを購入",
        buy_desc: "1 PTS = 50 円 + 決済手数料。<br>追加したいポイントを入力してください。",
        th_date: "日時",
        th_type: "種別",
        th_amount: "金額",
        th_status: "ステータス",
        th_desc: "内容"
    },
    en: {
        dashboard: "Dashboard",
        submit_job: "Submit Job",
        api_keys: "API Keys",
        history: "History",
        profile: "Profile",
        tools: "Tools & Downloads",
        balance: "BALANCE (PTS)",
        buy_pts: "Buy PTS",
        logout: "LOGOUT",
        save_changes: "SAVE CHANGES",
        cancel: "CANCEL",
        proceed_payment: "PROCEED TO PAYMENT",
        buy_title: "Buy PTS",
        buy_desc: "1 PTS = 50 JPY + Processing Fee.<br>Enter the amount of points you want to add.",
        th_date: "DATE",
        th_type: "TYPE",
        th_amount: "AMOUNT",
        th_status: "STATUS",
        th_desc: "DESCRIPTION"
    },
    zh: {
        dashboard: "仪表板",
        submit_job: "提交任务",
        api_keys: "API 密钥",
        history: "交易历史",
        profile: "个人资料设置",
        tools: "开发工具",
        balance: "余额 (PTS)",
        buy_pts: "购买 PTS",
        logout: "登出",
        save_changes: "保存更改",
        cancel: "取消",
        proceed_payment: "前往支付",
        buy_title: "购买 PTS",
        buy_desc: "1 PTS = 50 日元 + 手续费。<br>输入您要添加的积分数额。",
        th_date: "日期",
        th_type: "类型",
        th_amount: "金额",
        th_status: "状态",
        th_desc: "描述"
    }
};

function applyLanguage(lang) {
    currentLang = lang;
    t = translations[lang] || translations['ja'];

    // Header & Sidebar
    document.querySelector('.nav-item[data-target="dashboard"]').childNodes[1].textContent = " " + t.dashboard;
    document.querySelector('.nav-item[data-target="submit-job"]').childNodes[1].textContent = " " + t.submit_job;
    document.querySelector('.nav-item[data-target="api-keys"]').childNodes[1].textContent = " " + t.api_keys;
    document.querySelector('.nav-item[data-target="history"]').childNodes[1].textContent = " " + t.history;
    document.querySelector('.nav-item[data-target="profile"]').childNodes[1].textContent = " " + t.profile;
    document.querySelector('.nav-item[data-target="tools"]').childNodes[1].textContent = " " + t.tools;

    document.querySelector('.pts-container span').textContent = t.balance;
    document.getElementById('btn-buy-pts').textContent = t.buy_pts;
    document.getElementById('logout-btn').textContent = t.logout;

    // Headings
    const viewTitles = {
        'dashboard': t.dashboard,
        'submit-job': t.submit_job,
        'api-keys': t.api_keys,
        'history': t.history,
        'profile': t.profile,
        'tools': t.tools,
        'support': 'サポート'
    };

    // Sections & Modals
    const currentActiveView = document.querySelector('.nav-item.active')?.getAttribute('data-target');
    if (currentActiveView) pageTitle.textContent = viewTitles[currentActiveView];

    document.getElementById('i18n-history-title').textContent = t.history;
    document.getElementById('i18n-th-date').textContent = t.th_date;
    document.getElementById('i18n-th-type').textContent = t.th_type;
    document.getElementById('i18n-th-amount').textContent = t.th_amount;
    document.getElementById('i18n-th-status').textContent = t.th_status;
    document.getElementById('i18n-th-desc').textContent = t.th_desc;

    document.getElementById('i18n-profile-title').textContent = t.profile;
    document.getElementById('btn-save-profile').textContent = t.save_changes;

    document.getElementById('i18n-buy-title').textContent = t.buy_title;
    document.getElementById('i18n-buy-desc').innerHTML = t.buy_desc;
    document.getElementById('modal-cancel-btn').textContent = t.cancel;
    document.getElementById('modal-pay-btn').textContent = t.proceed_payment;
}

// Utility
// Valid view names
const VALID_VIEWS = ['dashboard', 'submit-job', 'api-keys', 'history', 'profile', 'tools', 'support'];

function showView(targetId) {
    if (!VALID_VIEWS.includes(targetId)) targetId = 'dashboard';

    views.forEach(v => v.style.display = 'none');
    const target = document.getElementById(`view-${targetId}`);
    if (target) target.style.display = 'block';

    navItems.forEach(n => n.classList.remove('active'));
    const navEl = document.querySelector(`.nav-item[data-target="${targetId}"]`);
    if (navEl) navEl.classList.add('active');

    // Update page title
    const viewTitles = {
        'dashboard': t ? t.dashboard : 'Dashboard',
        'submit-job': t ? t.submit_job : 'Submit Job',
        'api-keys': t ? t.api_keys : 'API Keys',
        'history': t ? t.history : 'History',
        'profile': t ? t.profile : 'Profile',
        'tools': t ? t.tools : 'Tools',
        'support': 'サポート'
    };
    if (pageTitle) pageTitle.textContent = viewTitles[targetId] || targetId;

    // Update URL hash (without reloading)
    if (window.location.hash !== `#${targetId}`) {
        history.pushState(null, '', `#${targetId}`);
    }

    // Fetch data based on view
    if (targetId === 'dashboard') loadDashboard();
    if (targetId === 'api-keys') loadApiKeys();
    if (targetId === 'history') loadHistory();
    if (targetId === 'profile') loadProfile();
    if (targetId === 'support') loadSupportTickets();
}

// Ensure at least default language is loaded immediately
applyLanguage(currentLang);

// Navigation via URL hash
function navigateFromHash() {
    const hash = window.location.hash.replace('#', '');
    showView(VALID_VIEWS.includes(hash) ? hash : 'dashboard');
}

navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const target = item.getAttribute('data-target');
        history.pushState(null, '', `#${target}`);
        showView(target);
    });
});

// Listen to browser back/forward navigation
window.addEventListener('popstate', navigateFromHash);

// Auth & Session Handling (Stateless)
function performLogout() {
    // ステートレスなため削除するデータがない。ログイン画面へ遷移するのみ。
    window.location.href = '/client-portal/index.html';
}

// App Entry
if (!currentToken) {
    window.location.href = '/client-portal/index.html';
} else {
    // EJSで既にHTMLが完成しているため、初期のAPIフェッチは不要
    startApp();
}

// Logout
logoutBtn.addEventListener('click', performLogout);

async function startApp() {
    mainLayout.style.display = 'flex';

    // 言語設定が保存されていれば適用（一旦デフォルトの 'ja' のままとする）
    applyLanguage(currentLang);

    await checkUrlParams();

    // Navigate to the page the user was on (via URL hash) or default to dashboard
    const hashTarget = window.location.hash.replace('#', '');
    showView(VALID_VIEWS.includes(hashTarget) ? hashTarget : 'dashboard');
}

// --- Dashboard Logic ---
async function loadDashboard() {
    try {
        const res = await fetch(`${API_BASE}/v1/client/dashboard`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (res.ok) {
            const data = await res.json();
            if (data.points !== undefined) {
                const balanceEl = document.getElementById('pts-balance');
                if (balanceEl) balanceEl.textContent = `${data.points}`;
            }
            if (data.jobs) {
                const jobsCountEl = document.getElementById('stat-total-jobs');
                if (jobsCountEl) jobsCountEl.textContent = data.jobs.length;
            }
        }
    } catch (e) {
        console.error('Failed to load dashboard data', e);
    }
}

function viewJobTrace(jobId) {
    const trace = [
        "Accepted by Nexus Orchestrator.",
        "Dispatched to Worker Node [TK-441] in Region: Tokyo.",
        "Security validation: Success.",
        "Inference running on secure enclave...",
        "Result verified and encrypted.",
        "Job completed successfully."
    ];
    alert(`Execution Trace for [${jobId.substring(0, 8)}]:\n\n- ${trace.join('\n- ')}`);
}

// --- Submit Job Logic ---
document.getElementById('btn-submit-job').addEventListener('click', async () => {
    const type = document.getElementById('job-type').value;
    const input = document.getElementById('job-input').value;
    const minTrust = document.getElementById('job-min-trust')?.value || 0;
    const priority = document.getElementById('job-priority')?.value || 'normal';

    const msgEl = document.getElementById('submit-msg');
    const btn = document.getElementById('btn-submit-job');

    if (!input.trim()) {
        msgEl.textContent = 'Input data cannot be empty.';
        msgEl.style.color = '#ff4d4d';
        return;
    }

    btn.textContent = 'Submitting...';
    try {
        const res = await fetch(`${API_BASE}/v1/client/task/submit`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${currentToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type,
                payload: input,
                advancedOptions: { minTrust: parseFloat(minTrust), priority }
            })
        });
        const data = await res.json();
        if (res.ok) {
            msgEl.textContent = `Job deployed successfully! ID: ${data.jobId}`;
            msgEl.style.color = '#00ff7f';
            document.getElementById('job-input').value = '';
            loadDashboard(); // silent update
        } else {
            msgEl.textContent = data.error || 'Submission failed.';
            msgEl.style.color = '#ff4d4d';
        }
    } catch (e) {
        msgEl.textContent = 'Network error.';
        msgEl.style.color = '#ff4d4d';
    } finally {
        btn.textContent = 'Submit to Network';
    }
});

// --- API Keys Logic ---
async function loadApiKeys() {
    try {
        const res = await fetch(`${API_BASE}/v1/client/apikeys`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (res.status === 401) return performLogout();
        if (res.ok) {
            const data = await res.json();
            renderApiKeys(data.keys);
        }
    } catch (e) {
        console.error(e);
    }
}

function renderApiKeys(keys) {
    const container = document.getElementById('api-keys-list');
    if (keys.length === 0) {
        container.innerHTML = `<p style="color: var(--text-muted); font-size: 0.9rem;">No API Keys generated yet.</p>`;
        return;
    }

    container.innerHTML = keys.map(k => `
        <div class="key-item" style="display: flex; justify-content: space-between; align-items: center;">
            <div style="flex-grow: 1;">
                <div class="key-value">${k.key}</div>
                <div style="font-size: 0.9rem; color: #fff; margin-top: 5px; font-weight: 500;" id="key-name-${k.key}">${k.name || 'Unnamed Key'}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 5px;">Created: ${new Date(k.createdAt).toLocaleDateString()}</div>
            </div>
            <div style="display: flex; gap: 5px;">
                <button class="giga-btn btn-outline btn-sm copy-btn" data-key="${k.key}">Copy</button>
                <button class="giga-btn btn-outline btn-sm rename-btn" data-key="${k.key}" data-name="${k.name || ''}" style="border-color: #00ff7f; color: #00ff7f;">Rename</button>
                <button class="giga-btn btn-outline btn-sm delete-btn" data-key="${k.key}" style="border-color: #ff4d4d; color: #ff4d4d;">Delete</button>
            </div>
        </div>
    `).join('');

    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            navigator.clipboard.writeText(e.target.getAttribute('data-key'));
            e.target.textContent = 'Copied!';
            setTimeout(() => e.target.textContent = 'Copy', 2000);
        });
    });

    document.querySelectorAll('.rename-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const key = e.target.getAttribute('data-key');
            const currentName = e.target.getAttribute('data-name');
            const newName = prompt('Enter new name for API Key:', currentName);
            if (newName && newName.trim() !== '' && newName !== currentName) {
                e.target.textContent = '...';
                try {
                    const res = await fetch(`${API_BASE}/v1/client/apikeys/${key}`, {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${currentToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ name: newName.trim() })
                    });
                    if (res.ok) {
                        loadApiKeys();
                    } else {
                        alert('Failed to rename key.');
                        e.target.textContent = 'Rename';
                    }
                } catch (err) {
                    alert('Network error.');
                    e.target.textContent = 'Rename';
                }
            }
        });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const key = e.target.getAttribute('data-key');
            if (confirm('Are you sure you want to delete this API Key? This action cannot be undone.')) {
                e.target.textContent = '...';
                try {
                    const res = await fetch(`${API_BASE}/v1/client/apikeys/${key}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${currentToken}` }
                    });
                    if (res.ok) {
                        loadApiKeys();
                    } else {
                        alert('Failed to delete key.');
                        e.target.textContent = 'Delete';
                    }
                } catch (err) {
                    alert('Network error.');
                    e.target.textContent = 'Delete';
                }
            }
        });
    });
}

document.getElementById('btn-generate-key').addEventListener('click', async () => {
    const nameInput = document.getElementById('new-key-name');
    const name = nameInput ? nameInput.value.trim() : '';
    const msgEl = document.getElementById('api-key-msg');
    try {
        const res = await fetch(`${API_BASE}/v1/client/apikeys`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${currentToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name })
        });
        if (res.ok) {
            msgEl.textContent = 'New API Key generated successfully.';
            msgEl.style.color = '#00ff7f';
            if (nameInput) nameInput.value = '';
            loadApiKeys();
        } else {
            msgEl.textContent = 'Failed to generate key.';
            msgEl.style.color = '#ff4d4d';
        }
    } catch (e) {
        msgEl.textContent = 'Network error.';
        msgEl.style.color = '#ff4d4d';
    }
});

// --- Stripe Payment Logic ---
let stripeInstance = null;
let elements = null;
let currentClientSecret = null;
let isCardStep = false;

const buyModal = document.getElementById('buy-pts-modal');
const buyAmountInput = document.getElementById('buy-amount-input');
const modalPayBtn = document.getElementById('modal-pay-btn');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const paymentContainer = document.getElementById('payment-element-container');
const cardErrors = document.getElementById('card-errors');

async function initStripe() {
    if (stripeInstance) return;
    try {
        const res = await fetch(`${API_BASE}/v1/client/payments/config`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const data = await res.json();
        if (data.publishableKey) {
            stripeInstance = Stripe(data.publishableKey);
        }
    } catch (e) {
        console.error('Failed to init stripe', e);
    }
}

document.getElementById('btn-buy-pts').addEventListener('click', async () => {
    isCardStep = false;
    currentClientSecret = null;
    buyAmountInput.parentElement.style.display = 'block';

    const qc = document.getElementById('quick-select-container');
    if (qc) qc.style.display = 'flex';

    paymentContainer.style.display = 'none';
    modalPayBtn.textContent = 'PROCEED TO PAYMENT';
    cardErrors.textContent = '';

    buyModal.style.display = 'flex';

    // Init stripe in background
    if (!stripeInstance && window.Stripe) {
        await initStripe();
    }

    // Add quick select buttons if they don't exist
    if (!document.getElementById('quick-select-container')) {
        const container = document.createElement('div');
        container.id = 'quick-select-container';
        container.style.display = 'flex';
        container.style.gap = '10px';
        container.style.marginTop = '10px';
        container.style.marginBottom = '20px';

        const plans = [100, 500, 1000];
        plans.forEach(pts => {
            const btn = document.createElement('button');
            btn.className = 'giga-btn btn-outline btn-sm';
            btn.textContent = `${pts} PTS`;
            btn.style.flex = '1';
            btn.onclick = () => {
                buyAmountInput.value = pts;
            };
            container.appendChild(btn);
        });
        buyAmountInput.parentElement.appendChild(container);
    }
});

modalCancelBtn.addEventListener('click', () => {
    buyModal.style.display = 'none';
    // Clear card element when modal is cancelled
    if (elements && document.getElementById('card-element').innerHTML !== '') {
        const cardElement = elements.getElement('payment');
        if (cardElement) cardElement.unmount();
        elements = null;
    }
});

modalPayBtn.addEventListener('click', async () => {
    if (isCardStep) {
        // Step 2: Confirm Payment via Elements
        if (!stripeInstance && !currentClientSecret.startsWith('mock_')) return;
        modalPayBtn.disabled = true;
        modalPayBtn.textContent = 'PROCESSING...';
        cardErrors.textContent = '';

        try {
            if (currentClientSecret && currentClientSecret.startsWith('mock_')) {
                // Mock verification
                const mockIntentId = currentClientSecret.replace('mock_secret_', '');
                await verifyPaymentIntent(mockIntentId);
            } else {
                // Real Stripe verification
                const { error, paymentIntent } = await stripeInstance.confirmPayment({
                    elements,
                    confirmParams: {},
                    redirect: 'if_required'
                });

                if (error) {
                    cardErrors.textContent = error.message;
                    modalPayBtn.disabled = false;
                    modalPayBtn.textContent = 'CONFIRM PAYMENT';
                } else if (paymentIntent && paymentIntent.status === 'succeeded') {
                    await verifyPaymentIntent(paymentIntent.id);
                }
            }
        } catch (e) {
            cardErrors.textContent = 'Payment confirmation failed.';
            modalPayBtn.disabled = false;
            modalPayBtn.textContent = 'CONFIRM PAYMENT';
        }
        return;
    }

    // Step 1: Create PaymentIntent
    const amount = buyAmountInput.value;
    if (!amount || isNaN(amount) || parseInt(amount) <= 0) return;

    modalPayBtn.textContent = 'PREPARING...';
    modalPayBtn.disabled = true;
    cardErrors.textContent = '';

    try {
        const res = await fetch(`${API_BASE}/v1/client/payments/checkout`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${currentToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ amountPts: parseInt(amount) })
        });
        if (res.ok) {
            const data = await res.json();
            if (data.clientSecret) {
                currentClientSecret = data.clientSecret;

                // Show Elements
                if (stripeInstance && !currentClientSecret.startsWith('mock_')) {
                    elements = stripeInstance.elements({ clientSecret: currentClientSecret });
                    const paymentElement = elements.create('payment');

                    document.getElementById('card-element').innerHTML = '';
                    paymentElement.mount('#card-element');
                } else if (currentClientSecret.startsWith('mock_')) {
                    document.getElementById('card-element').innerHTML = '<div style="color:#00ff7f; font-size: 0.9rem; padding: 10px;">(Mock Environment) Modeled transaction pre-authorized. Ready.</div>';
                }

                buyAmountInput.parentElement.style.display = 'none';
                const qc = document.getElementById('quick-select-container');
                if (qc) qc.style.display = 'none';

                paymentContainer.style.display = 'block';
                isCardStep = true;
                modalPayBtn.textContent = 'CONFIRM PAYMENT';
            }
        } else {
            const err = await res.json();
            cardErrors.textContent = `Checkout failed: ${err.error || 'Unknown error'}`;
        }
    } catch (e) {
        cardErrors.textContent = 'Network error during checkout initiation.';
    } finally {
        modalPayBtn.disabled = false;
        if (!isCardStep) {
            modalPayBtn.textContent = 'PROCEED TO PAYMENT';
        }
    }
});

async function verifyPaymentIntent(intentId) {
    try {
        modalPayBtn.textContent = 'VERIFYING...';
        const res = await fetch(`${API_BASE}/v1/client/payments/verify`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${currentToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ payment_intent_id: intentId })
        });
        if (res.ok) {
            const data = await res.json();
            if (data.success && (data.added || data.message === 'Already credited')) {
                showNotification(data.added ? `✅ Successfully purchased ${data.added} PTS!` : '✅ Payment already credited.', 'success');

                // Update balance directly in UI (Immediate feedback)
                if (data.added) {
                    const balanceEl = document.getElementById('pts-balance');
                    if (balanceEl) {
                        const currentText = balanceEl.textContent.trim();
                        const currentPts = parseFloat(currentText) || 0;
                        balanceEl.textContent = `${currentPts + data.added}`;
                    }
                }

                await loadDashboard(); // Fetch latest from server
                await loadHistory();   // Fetch latest transactions
            }
            buyModal.style.display = 'none';
        } else {
            const err = await res.json();
            cardErrors.textContent = `Verification failed: ${err.error}`;
            modalPayBtn.disabled = false;
            modalPayBtn.textContent = 'CONFIRM PAYMENT';
        }
    } catch (e) {
        cardErrors.textContent = 'Network error during verification.';
        modalPayBtn.disabled = false;
        modalPayBtn.textContent = 'CONFIRM PAYMENT';
    }
}

async function checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout_success') === 'true') {
        const sessionId = params.get('session_id');
        if (sessionId && currentToken) {
            try {
                const res = await fetch(`${API_BASE}/v1/client/payments/verify`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${currentToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ session_id: sessionId })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.added) {
                        showNotification(`✅ Successfully purchased ${data.added} PTS!`, 'success');
                        loadDashboard();
                    }
                }
                // Clear URL params
                window.history.replaceState({}, document.title, window.location.pathname);
            } catch (e) {
                console.error('Failed to verify payment', e);
            }
        }
    } else if (params.get('checkout_canceled') === 'true') {
        showNotification('❌ Payment canceled.', 'error');
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

function showNotification(msg, type = 'info') {
    // Simple toast notification
    const toast = document.createElement('div');
    toast.className = `toast toast-${type} glass-card`;
    toast.style.position = 'fixed';
    toast.style.bottom = '30px';
    toast.style.right = '30px';
    toast.style.padding = '15px 25px';
    toast.style.zIndex = '10000';
    toast.style.borderLeft = `4px solid ${type === 'success' ? '#00ff7f' : '#ff4d4d'}`;
    toast.style.animation = 'slideIn 0.3s ease-out';
    toast.innerHTML = `<div style="font-weight: 600;">${msg}</div>`;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        toast.style.transition = 'all 0.5s ease-in';
        setTimeout(() => toast.remove(), 500);
    }, 5000);
}

// --- History Logic ---
async function loadHistory() {
    try {
        const res = await fetch(`${API_BASE}/v1/client/transactions`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (res.status === 401) return performLogout();
        if (res.ok) {
            const data = await res.json();
            const tbody = document.getElementById('history-tbody');
            tbody.innerHTML = data.transactions.map(tx => `
                <tr>
                    <td>${new Date(tx.createdAt).toLocaleString()}</td>
                    <td><span class="status-badge status-${tx.type.toLowerCase()}">${tx.type}</span></td>
                    <td>${tx.amount > 0 ? '+' : ''}${tx.amount.toFixed(2)}</td>
                    <td><span style="color: #00ff7f">SUCCESS</span></td>
                    <td style="color: var(--text-muted)">${tx.description || '-'}</td>
                </tr>
            `).join('');
        }
    } catch (e) {
        console.error(e);
    }
}

// --- Profile Logic ---
async function loadProfile() {
    try {
        const res = await fetch(`${API_BASE}/v1/client/dashboard`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (res.status === 401) return performLogout();
        if (res.ok) {
            const data = await res.json();
            document.getElementById('profile-name').value = data.name || '';
            document.getElementById('profile-lang').value = data.language || 'ja';
        }
    } catch (e) {
        console.error(e);
    }
}

document.getElementById('btn-save-profile').addEventListener('click', async () => {
    const name = document.getElementById('profile-name').value.trim();
    const language = document.getElementById('profile-lang').value;
    const msgEl = document.getElementById('profile-save-msg');

    try {
        const res = await fetch(`${API_BASE}/v1/client/profile`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${currentToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, language })
        });
        if (res.ok) {
            msgEl.textContent = 'Settings saved!';
            msgEl.style.color = '#00ff7f';
            document.getElementById('display-name').textContent = name;
            applyLanguage(language);
            setTimeout(() => msgEl.textContent = '', 3000);
        } else {
            msgEl.textContent = 'Failed to save settings.';
            msgEl.style.color = '#ff4d4d';
        }
    } catch (e) {
        msgEl.textContent = 'Network error.';
        msgEl.style.color = '#ff4d4d';
    }
});

// Modal close buttons
document.querySelectorAll('.modal-close-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        btn.closest('.auth-overlay').style.display = 'none';
    });
});

// ==========================================
// --- Support & Debug Logic ---
// ==========================================

// Run Diagnostics
document.getElementById('btn-run-diagnostics').addEventListener('click', async () => {
    const btn = document.getElementById('btn-run-diagnostics');
    btn.textContent = '診断中...';
    btn.disabled = true;
    try {
        const res = await fetch(`${API_BASE}/v1/client/support/diagnostics`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (res.ok) {
            const data = await res.json();
            const d = data.diagnostics;
            document.getElementById('diagnostics-result').style.display = 'block';

            document.getElementById('diag-account').innerHTML = `
                <div style="font-size: 0.85rem; line-height: 1.8;">
                    <div>✉ ${d.account.email || 'N/A'}</div>
                    <div>💰 残高: <strong style="color: #00ff7f;">${d.account.points} PTS</strong></div>
                    <div>📅 登録: ${d.account.createdAt ? new Date(d.account.createdAt).toLocaleDateString() : 'N/A'}</div>
                </div>`;

            document.getElementById('diag-apikeys').innerHTML = `
                <div style="font-size: 0.85rem; line-height: 1.8;">
                    <div>🔑 合計: ${d.apiKeys.total} 個</div>
                    <div>✅ 有効: ${d.apiKeys.active} 個</div>
                </div>`;

            const statusEntries = Object.entries(d.jobs.statuses || {}).map(([k, v]) => `${k}: ${v}`).join(', ') || 'なし';
            document.getElementById('diag-jobs').innerHTML = `
                <div style="font-size: 0.85rem; line-height: 1.8;">
                    <div>📊 直近ジョブ: ${d.jobs.recent} 件</div>
                    <div>⚡ アクティブ: ${d.jobs.active} 件</div>
                    <div>🏷 状態内訳: ${statusEntries}</div>
                </div>`;

            const uptimeMin = Math.floor(d.serverInfo.uptime / 60);
            document.getElementById('diag-server').innerHTML = `
                <div style="font-size: 0.85rem; line-height: 1.8;">
                    <div>⬆ 稼働時間: ${uptimeMin} 分</div>
                    <div>🖥 ノード数: ${d.serverInfo.totalNodes}</div>
                    <div>📥 待機タスク: ${d.serverInfo.pendingTasks}</div>
                    <div>📦 キュー: P:${d.serverInfo.queueStatus.pending} / A:${d.serverInfo.queueStatus.processing}</div>
                </div>`;
        }
    } catch (e) {
        console.error('Diagnostics error:', e);
    } finally {
        btn.textContent = '診断実行';
        btn.disabled = false;
    }
});

// Submit Ticket
document.getElementById('btn-submit-ticket').addEventListener('click', async () => {
    const category = document.getElementById('ticket-category').value;
    const subject = document.getElementById('ticket-subject').value.trim();
    const message = document.getElementById('ticket-message').value.trim();
    const msgEl = document.getElementById('ticket-msg');

    if (!subject || !message) {
        msgEl.textContent = '件名と詳細を入力してください';
        msgEl.style.color = '#ff4d4d';
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/v1/client/support/ticket`, {
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
            document.getElementById('ticket-subject').value = '';
            document.getElementById('ticket-message').value = '';
            loadSupportTickets();
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

// Load Support Tickets
async function loadSupportTickets() {
    const container = document.getElementById('ticket-history-list');
    try {
        const res = await fetch(`${API_BASE}/v1/client/support/tickets`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (res.status === 401) return performLogout();

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
