// [App Module]
// WebSocket handling, Drag & Drop, and Action triggers

const ws = new WebSocket(`ws://${location.host}`);
const dropOverlay = document.getElementById('drop-overlay');

ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'init' || msg.type === 'update') {
        if (msg.payload.session && msg.payload.session.token) {
            window.gigaToken = msg.payload.session.token;
        }
        if (msg.payload.serverUrl) {
            window.serverUrl = msg.payload.serverUrl;
        }
        if (window.GigaUI) window.GigaUI.update(msg.payload);

        // Update connection status
        const statusBadge = document.getElementById('connection-status');
        if (statusBadge) {
            statusBadge.textContent = 'オンライン';
            statusBadge.className = 'status-badge connected';
        }
    } else if (msg.type === 'update_notification') {
        // Handle new version notification
        const modal = document.getElementById('update-modal');
        const label = document.getElementById('update-version-label');
        const notes = document.getElementById('update-notes');
        const btn = document.getElementById('btn-update-download');

        if (modal && label && notes && btn) {
            label.textContent = msg.payload.version;
            notes.textContent = msg.payload.releaseNotes;

            btn.onclick = () => {
                btn.disabled = true;
                btn.textContent = 'アップデート中...';
                ws.send(JSON.stringify({
                    type: 'accept_update',
                    payload: msg.payload
                }));
            };

            modal.style.display = 'flex';
        }
    } else if (msg.type === 'update_status') {
        const btn = document.getElementById('btn-update-download');
        const notes = document.getElementById('update-notes');
        if (msg.payload.status === 'downloading') {
            if (notes) notes.textContent = '📥 最新版をダウンロード中...';
        } else if (msg.payload.status === 'extracting') {
            if (notes) notes.textContent = '📦 ファイルを展開・適用中...';
        } else if (msg.payload.status === 'success') {
            if (notes) notes.textContent = '✅ アップデート完了！再起動しています...';
            setTimeout(() => location.reload(), 3500);
        } else if (msg.payload.status === 'failed') {
            if (notes) notes.textContent = '❌ エラー: ' + msg.payload.error;
            if (btn) {
                btn.disabled = false;
                btn.textContent = '再試行';
            }
        }
    }
};

ws.onclose = () => {
    const statusBadge = document.getElementById('connection-status');
    if (statusBadge) {
        statusBadge.textContent = 'オフライン';
        statusBadge.className = 'status-badge disconnected';
    }
};

// Drag & Drop Handling
window.addEventListener('dragenter', (e) => { e.preventDefault(); dropOverlay.style.display = 'flex'; });
dropOverlay.addEventListener('dragleave', (e) => { e.preventDefault(); dropOverlay.style.display = 'none'; });
dropOverlay.addEventListener('dragover', (e) => { e.preventDefault(); });
dropOverlay.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropOverlay.style.display = 'none';
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.zip')) {
        console.log("Importing package:", file.name);
        try {
            const zip = await JSZip.loadAsync(file);
            const configJson = await zip.file("config.json").async("string");
            const caCrt = await zip.file("certs/ca.crt").async("string");
            const clientCrt = await zip.file("certs/client.crt").async("string");
            const clientKey = await zip.file("certs/client.key").async("string");

            ws.send(JSON.stringify({
                type: 'import_package',
                payload: { config: JSON.parse(configJson), ca: caCrt, cert: clientCrt, key: clientKey }
            }));
            alert("インバイトパッケージを受信しました。再接続します...");
        } catch (err) {
            console.error("Failed to parse package:", err);
            alert("無効なインバイトパッケージです。");
        }
    }
});

// App Actions
window.app = {
    withdraw() {
        console.log("Requesting browser launch for withdrawal...");
        const base = window.serverUrl ? window.serverUrl.replace('ws://', 'http://').replace('wss://', 'https://') : 'http://localhost:8080';
        ws.send(JSON.stringify({ type: 'open_browser', payload: { url: `${base}/withdraw?token=${window.gigaToken}` } }));
    },
    openWebDashboard() {
        console.log("Requesting browser launch for Web Dashboard...");
        const base = window.serverUrl ? window.serverUrl.replace('ws://', 'http://').replace('wss://', 'https://') : 'http://localhost:8080';
        ws.send(JSON.stringify({ type: 'open_browser', payload: { url: `${base}/worker-portal` } }));
    },
    mergeTask(taskId) {
        ws.send(JSON.stringify({ type: 'gui_merge_task', payload: { taskId } }));
    },
    updateResourceLimits(cpu, mem) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'update_resource_limits',
                payload: { cpuCores: cpu, memoryGb: mem }
            }));
        }
    },
    onWizardPair(payload) {
        return new Promise((resolve, reject) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'wizard_pair', payload }));
                resolve({ success: true });
            } else {
                reject(new Error("WebSocket is not open."));
            }
        });
    },
    setQuickMode(mode) {
        if (window.GigaUI && window.GigaUI.setQuickMode) {
            window.GigaUI.setQuickMode(mode);
        }
    }
};

// Settings Flow
const settingsBtn = document.getElementById('btn-settings');
const closeSettingsBtn = document.getElementById('btn-close-settings');
const saveSettingsBtn = document.getElementById('btn-save-settings');
const settingsMsg = document.getElementById('settings-msg');

if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
        window.location.href = '/settings.html';
    });
}
if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener('click', () => {
        window.location.href = '/index.html';
    });
}
if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', async () => {
        const openaiKey = document.getElementById('input-openai-key').value;
        const geminiKey = document.getElementById('input-gemini-key').value;
        const cpuLimit = parseInt(document.getElementById('range-cpu').value);
        const memLimit = parseInt(document.getElementById('range-mem').value);

        if (settingsMsg) {
            settingsMsg.textContent = '保存中...';
            settingsMsg.style.color = 'var(--accent-primary)';
        }

        try {
            // [Fix] Using full user token for authenticating save
            const res = await fetch(`${window.serverUrl ? window.serverUrl.replace('ws://', 'http://').replace('wss://', 'https://') : 'https://gigacompute-fleet.web.app'}/v1/worker/dashboard/profile`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${window.gigaToken}` },
                body: JSON.stringify({
                    openAiKey: openaiKey,
                    geminiKey: geminiKey,
                    resourceLimits: { cpuCores: cpuLimit, memoryGb: memLimit }
                })
            });

            if (res.ok) {
                if (settingsMsg) {
                    settingsMsg.textContent = 'クラウドと同期しました！';
                    settingsMsg.style.color = '#0f0';
                }
                setTimeout(() => window.location.href = '/index.html', 1500);
            } else {
                const data = await res.json();
                if (settingsMsg) {
                    settingsMsg.textContent = data.error || '保存に失敗しました';
                    settingsMsg.style.color = '#f00';
                }
            }
        } catch (err) {
            if (settingsMsg) {
                settingsMsg.textContent = 'ネットワークエラー（サーバーに接続できません）';
                settingsMsg.style.color = '#f00';
            }
        }
    });
}

// --- Premium Onboarding Wizard (v3.0) ---
const wizard = {
    steps: ['scan', 'potential', 'settings', 'pair', 'success'],
    currentStepIdx: 0,
    paired: false,
    config: {
        cpu: 4,
        mem: 8,
        disk: 50,
        mode: 'stable'
    },

    init() {
        // The "paired" state is now derived from being on a protected route or having an active session
        const path = window.location.pathname;
        const hashFromPath = path.startsWith('/u/') ? path.split('/')[2] : null;

        if (hashFromPath) {
            // If we are on a hashed URL, we treat this as the active session
            localStorage.setItem('giga_hash', hashFromPath);
            localStorage.setItem('giga_paired', 'true');
        }

        const paired = localStorage.getItem('giga_paired') === 'true';
        const hash = localStorage.getItem('giga_hash');

        if (path.includes('/login.html')) {
            if (paired && hash) {
                window.location.href = `/u/${hash}`;
                return;
            }
            const modal = document.getElementById('wizard-modal');
            if (modal) modal.style.display = 'flex';

            this.runScan();
            this.initEventListeners();
        } else if (path === '/' || path === '/index.html' || path === '') {
            if (paired && hash) {
                window.location.href = `/u/${hash}`;
            } else {
                window.location.href = '/login.html';
            }
        }
    },

    async runScan() {
        const items = ['cpu', 'gpu', 'mem', 'net'];
        for (const id of items) {
            const el = document.getElementById(`scan-${id}`);
            if (!el) continue;
            await new Promise(r => setTimeout(r, 800 + Math.random() * 700));
            el.classList.add('complete');
            if (el.querySelector('.status')) el.querySelector('.status').textContent = 'OPTIMIZED';
        }

        setTimeout(() => this.next(), 800);
    },

    next() {
        const currentId = `wizard-step-${this.steps[this.currentStepIdx]}`;
        const currentEl = document.getElementById(currentId);
        if (currentEl) {
            currentEl.classList.remove('active');
            currentEl.style.display = 'none';
        }

        this.currentStepIdx++;
        if (this.currentStepIdx < this.steps.length) {
            const nextId = `wizard-step-${this.steps[this.currentStepIdx]}`;
            const nextEl = document.getElementById(nextId);
            if (nextEl) {
                nextEl.classList.add('active');
                nextEl.style.display = 'block';
            }

            if (this.steps[this.currentStepIdx] === 'potential') {
                this.updatePotentialDisplay();
            }
        }
    },

    updatePotentialDisplay() {
        // Logic for potential (v3.0 - 円基準)
        const yen = 12500 + Math.floor(Math.random() * 5000);
        const usd = (yen / 150).toFixed(2);
        const yenEl = document.getElementById('p-yen-val');
        const usdEl = document.getElementById('p-usd-val');
        if (yenEl) yenEl.textContent = yen.toLocaleString();
        if (usdEl) usdEl.textContent = usd;
    },

    validateRisk() {
        const checked = document.getElementById('risk-check')?.checked;
        const btn = document.getElementById('btn-potential-next');
        if (btn) btn.disabled = !checked;
    },

    setMode(mode) {
        this.config.mode = mode;
        const btnStable = document.getElementById('mode-stable');
        const btnTurbo = document.getElementById('mode-turbo');

        if (mode === 'stable') {
            if (btnStable) btnStable.classList.add('active');
            if (btnTurbo) btnTurbo.classList.remove('active');
        } else {
            if (btnTurbo) btnTurbo.classList.add('active');
            if (btnStable) btnStable.classList.remove('active');
        }
        this.updateSettingsRevenue();
    },

    updateSettingsRevenue() {
        const cpuEl = document.getElementById('w-range-cpu');
        const memEl = document.getElementById('w-range-mem');
        const diskEl = document.getElementById('w-range-disk');

        if (!cpuEl || !memEl || !diskEl) return;

        const cpu = parseInt(cpuEl.value);
        const mem = parseInt(memEl.value);
        const disk = parseInt(diskEl.value);

        if (document.getElementById('w-cpu-val')) document.getElementById('w-cpu-val').textContent = cpu;
        if (document.getElementById('w-mem-val')) document.getElementById('w-mem-val').textContent = mem;
        if (document.getElementById('w-disk-val')) document.getElementById('w-disk-val').textContent = `${disk} GB`;

        // Mock revenue formula
        let yen = (cpu * 500) + (mem * 200) + (disk * 10);
        if (this.config.mode === 'turbo') yen *= 1.4;

        const revEl = document.querySelector('#w-sim-revenue span');
        if (revEl) revEl.textContent = `¥${Math.floor(yen).toLocaleString()}`;
    },

    initEventListeners() {
        ['w-range-cpu', 'w-range-mem', 'w-range-disk'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', () => this.updateSettingsRevenue());
        });
    },

    switchTab(tab) {
        const tabLogin = document.getElementById('tab-login');
        const tabRegister = document.getElementById('tab-register');
        const formLogin = document.getElementById('form-login');
        const formRegister = document.getElementById('form-register');

        const activeStyle = '2px solid var(--accent-primary)';
        const activeColor = 'var(--accent-primary)';
        const inactiveStyle = '2px solid transparent';
        const inactiveColor = 'var(--text-muted)';

        const status = document.getElementById('wizard-pair-status');
        if (status) status.textContent = ''; // clear status

        if (tab === 'login') {
            if (tabLogin) tabLogin.style.borderBottom = activeStyle;
            if (tabLogin) tabLogin.style.color = activeColor;
            if (tabRegister) tabRegister.style.borderBottom = inactiveStyle;
            if (tabRegister) tabRegister.style.color = inactiveColor;
            if (formLogin) formLogin.style.display = 'block';
            if (formRegister) formRegister.style.display = 'none';
        } else {
            if (tabRegister) tabRegister.style.borderBottom = activeStyle;
            if (tabRegister) tabRegister.style.color = activeColor;
            if (tabLogin) tabLogin.style.borderBottom = inactiveStyle;
            if (tabLogin) tabLogin.style.color = inactiveColor;
            if (formRegister) formRegister.style.display = 'block';
            if (formLogin) formLogin.style.display = 'none';
        }
    },

    async _authenticate(url, bodyData) {
        const status = document.getElementById('wizard-pair-status');
        if (status) {
            status.textContent = "📡 サーバーに認証中...";
            status.style.color = "var(--accent-primary)";
        }

        try {
            const base = window.serverUrl ? window.serverUrl.replace('ws://', 'http://').replace('wss://', 'https://') : 'https://gigacompute-fleet.web.app';
            const res = await fetch(`${base}${url}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyData)
            });

            const data = await res.json();
            if (!res.ok) {
                if (status) {
                    status.textContent = `❌ エラー: ${data.error || '失敗しました'}`;
                    status.style.color = "#f87171";
                }
                return null;
            }

            if (data.user && data.user.hash) {
                localStorage.setItem('giga_hash', data.user.hash);
            }

            return data.token;
        } catch (err) {
            if (status) {
                status.textContent = "❌ 通信エラーが発生しました";
                status.style.color = "#f87171";
            }
            console.error('Pairing Error:', err);
            return null;
        }
    },

    async _pairDevice(token) {
        const status = document.getElementById('wizard-pair-status');
        if (status) status.textContent = "✅ 認証成功！デバイスを紐付けています...";

        ws.send(JSON.stringify({
            type: 'wizard_pair',
            payload: {
                token,
                limits: {
                    cpu: parseInt(document.getElementById('w-range-cpu')?.value || 4),
                    mem: parseInt(document.getElementById('w-range-mem')?.value || 8),
                    disk: parseInt(document.getElementById('w-range-disk')?.value || 50),
                    mode: this.config.mode
                }
            }
        }));

        let attempts = 0;
        const checkPairing = setInterval(() => {
            attempts++;
            if (window.gigaToken && window.gigaToken !== 'dummy-token') {
                clearInterval(checkPairing);
                if (status) {
                    status.textContent = "✅ ペアリング成功！環境を最適化しています...";
                    status.style.color = "var(--accent-success)";
                }
                setTimeout(() => this.next(), 1000);
            } else if (attempts > 30) {
                clearInterval(checkPairing);
                if (status) {
                    status.textContent = "❌ タイムアウト：サーバーが応答しません";
                    status.style.color = "#f87171";
                }
            }
        }, 500);
    },

    // The loginAndPair and registerAndPair functions are now handled by standard HTML <form> POST
    // in login.html to achieve the stateless SSR-like redirect flow.
    // Redundant methods removed.

    openWebPortal() {
        const base = window.serverUrl ? window.serverUrl.replace('ws://', 'http://').replace('wss://', 'https://') : 'https://unable-height-polished-old.trycloudflare.com';
        const url = `${base}/worker-portal/register`;
        ws.send(JSON.stringify({ type: 'open_browser', payload: { url } }));
    },

    close() {
        localStorage.setItem('giga_paired', 'true');
        const hash = localStorage.getItem('giga_hash');
        window.location.href = hash ? `/u/${hash}` : '/index.html'; // Navigate back to dashboard directly
    }
};

// Start Wizard after a short delay
setTimeout(() => wizard.init(), 1000);
