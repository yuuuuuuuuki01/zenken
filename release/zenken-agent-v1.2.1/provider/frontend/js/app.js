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
        if (window.GigaUI) window.GigaUI.update(msg.payload);

        // Update connection status
        const statusBadge = document.getElementById('connection-status');
        if (statusBadge) {
            statusBadge.textContent = 'オンライン';
            statusBadge.className = 'status-badge connected';
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
        ws.send(JSON.stringify({ type: 'open_browser', payload: { url: 'https://localhost:8081/withdraw' } }));
    },
    openWebDashboard() {
        console.log("Requesting browser launch for Web Dashboard...");
        ws.send(JSON.stringify({ type: 'open_browser', payload: { url: 'https://localhost:8081/worker-portal' } }));
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
                // Assuming backend will send a success message or update via init/update
                // For now, we'll resolve immediately for PoC
                resolve({ success: true });
            } else {
                reject(new Error("WebSocket is not open."));
            }
        });
    }
};

// Settings Flow
const settingsBtn = document.getElementById('btn-settings');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('btn-close-settings');
const saveSettingsBtn = document.getElementById('btn-save-settings');
const settingsMsg = document.getElementById('settings-msg');

if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
        settingsModal.style.display = 'flex';
        settingsMsg.textContent = '';
    });
}
if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener('click', () => {
        settingsModal.style.display = 'none';
    });
}
if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', async () => {
        const openaiKey = document.getElementById('input-openai-key').value;
        const geminiKey = document.getElementById('input-gemini-key').value;
        const cpuLimit = parseInt(document.getElementById('range-cpu').value);
        const memLimit = parseInt(document.getElementById('range-mem').value);

        settingsMsg.textContent = '保存中...';
        settingsMsg.style.color = 'var(--accent-primary)';

        try {
            const res = await fetch('https://localhost:8081/v1/worker/dashboard/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${window.gigaToken}` },
                body: JSON.stringify({
                    openAiKey: openaiKey,
                    geminiKey: geminiKey,
                    resourceLimits: { cpuCores: cpuLimit, memoryGb: memLimit }
                })
            });

            if (res.ok) {
                settingsMsg.textContent = 'クラウドと同期しました！';
                settingsMsg.style.color = '#0f0';
                setTimeout(() => settingsModal.style.display = 'none', 1500);
            } else {
                const data = await res.json();
                settingsMsg.textContent = data.error || '保存に失敗しました';
                settingsMsg.style.color = '#f00';
            }
        } catch (err) {
            settingsMsg.textContent = 'ネットワークエラー（サーバーに接続できません）';
            settingsMsg.style.color = '#f00';
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
        if (localStorage.getItem('giga_paired')) return;

        document.getElementById('wizard-modal').style.display = 'flex';
        this.runScan();
        this.initEventListeners();
    },

    async runScan() {
        const items = ['cpu', 'gpu', 'mem', 'net'];
        for (const id of items) {
            const el = document.getElementById(`scan-${id}`);
            await new Promise(r => setTimeout(r, 800 + Math.random() * 700));
            el.classList.add('complete');
            el.querySelector('.status').textContent = 'OPTIMIZED';
        }

        setTimeout(() => this.next(), 800);
    },

    next() {
        const currentId = `wizard-step-${this.steps[this.currentStepIdx]}`;
        document.getElementById(currentId).classList.remove('active');
        document.getElementById(currentId).style.display = 'none';

        this.currentStepIdx++;
        const nextId = `wizard-step-${this.steps[this.currentStepIdx]}`;
        const nextEl = document.getElementById(nextId);
        nextEl.classList.add('active');
        nextEl.style.display = 'block';

        if (this.steps[this.currentStepIdx] === 'potential') {
            this.updatePotentialDisplay();
        }
    },

    updatePotentialDisplay() {
        // Logic for potential (v3.0 - 円基準)
        const yen = 12500 + Math.floor(Math.random() * 5000);
        const usd = (yen / 150).toFixed(2);
        document.getElementById('p-yen-val').textContent = yen.toLocaleString();
        document.getElementById('p-usd-val').textContent = usd;
    },

    validateRisk() {
        const checked = document.getElementById('risk-check').checked;
        document.getElementById('btn-potential-next').disabled = !checked;
    },

    setMode(mode) {
        this.config.mode = mode;
        const btnStable = document.getElementById('mode-stable');
        const btnTurbo = document.getElementById('mode-turbo');

        if (mode === 'stable') {
            btnStable.classList.add('active');
            btnTurbo.classList.remove('active');
        } else {
            btnTurbo.classList.add('active');
            btnStable.classList.remove('active');
        }
        this.updateSettingsRevenue();
    },

    updateSettingsRevenue() {
        const cpu = parseInt(document.getElementById('w-range-cpu').value);
        const mem = parseInt(document.getElementById('w-range-mem').value);
        const disk = parseInt(document.getElementById('w-range-disk').value);

        document.getElementById('w-cpu-val').textContent = cpu;
        document.getElementById('w-mem-val').textContent = mem;
        document.getElementById('w-disk-val').textContent = `${disk} GB`;

        // Mock revenue formula
        let yen = (cpu * 500) + (mem * 200) + (disk * 10);
        if (this.config.mode === 'turbo') yen *= 1.4;

        document.querySelector('#w-sim-revenue span').textContent = `¥${Math.floor(yen).toLocaleString()}`;
    },

    initEventListeners() {
        ['w-range-cpu', 'w-range-mem', 'w-range-disk'].forEach(id => {
            document.getElementById(id).addEventListener('input', () => this.updateSettingsRevenue());
        });

        // Detect auto-token on init
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token') || urlParams.get('pair_token');
        if (token) {
            document.getElementById('wiz-token-input').value = token;
        }
    },

    showManual(show) {
        document.getElementById('pair-section').style.display = show ? 'none' : 'block';
        document.getElementById('manual-token-section').style.display = show ? 'block' : 'none';
    },

    async pair() {
        const tokenInput = document.getElementById('wiz-token-input');
        const status = document.getElementById('wizard-pair-status');
        const token = tokenInput.value || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkdW1teS11c2VyLTEyMyIsImVtYWlsIjoiZGVtb0BnaWdhY29tcHV0ZS5uZXQiLCJpYXQiOjE3NzIyNTM0MzIsImV4cCI6MjA4NzYxMzQzMn0.IcP6f254v38h141UuJ39uVRo0Imbt_UEMoBi7JXNhWs';

        status.textContent = "ペアリング中...";
        status.style.color = "var(--accent-primary)";

        // WebSocket send (Actual logic)
        ws.send(JSON.stringify({
            type: 'wizard_pair',
            payload: {
                token,
                limits: {
                    cpu: parseInt(document.getElementById('w-range-cpu').value),
                    mem: parseInt(document.getElementById('w-range-mem').value),
                    disk: parseInt(document.getElementById('w-range-disk').value),
                    mode: this.config.mode
                }
            }
        }));

        setTimeout(() => {
            status.textContent = "ペアリング成功！環境を最終調整しています...";
            setTimeout(() => this.next(), 1500);
        }, 1200);
    },

    pairManual() {
        const manualInput = document.getElementById('manual-token-input').value;
        if (!manualInput) return alert("トークンを入力してください。");
        document.getElementById('wiz-token-input').value = manualInput;
        this.pair();
    },

    openWebPortal() {
        ws.send(JSON.stringify({ type: 'open_browser', payload: { url: 'https://localhost:8081/worker-portal/register' } }));
    },

    close() {
        localStorage.setItem('giga_paired', 'true');
        document.getElementById('wizard-modal').style.display = 'none';
    }
};

// Start Wizard after a short delay
setTimeout(() => wizard.init(), 1000);
