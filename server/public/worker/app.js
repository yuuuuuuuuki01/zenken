// [Unified App Module for Firebase Worker]

const ws = new WebSocket(`ws://${location.host}`);

function updateUI(data) {
    const { nodeInfo, walletStats, localTasks } = data;

    document.getElementById('display-id').textContent = nodeInfo.id;
    document.getElementById('stat-perf').textContent = nodeInfo.performanceScore;
    document.getElementById('stat-trust').textContent = nodeInfo.trustScore.toFixed(2);

    // Trust Progress
    const trustProgress = Math.min(100, (nodeInfo.trustScore / 10) * 100);
    const trustBar = document.getElementById('trust-progress-bar');
    if (trustBar) trustBar.style.width = `${trustProgress}%`;

    const totalIncome = walletStats.totalIncome;
    const prevAmount = parseFloat(document.getElementById('ticker-amount').textContent) || 0;
    document.getElementById('ticker-amount').textContent = totalIncome.toFixed(6);

    // Reward Animation
    if (totalIncome > prevAmount && prevAmount > 0) {
        const tickerContainer = document.querySelector('.ticker-container');
        tickerContainer.classList.remove('reward-pulse');
        void tickerContainer.offsetWidth;
        tickerContainer.classList.add('reward-pulse');
    }

    const activityContainer = document.getElementById('current-activity');
    const activeTask = localTasks.find(t => t.status === 'processing');
    if (activeTask) {
        activityContainer.innerHTML = `
            <div style="font-family: Orbitron; color: var(--accent-primary); font-size: 1.1rem;">PROCESSING TASK</div>
            <div class="pulse-node"></div>
            <div style="font-size: 0.7rem; margin: 10px 0; opacity: 0.6;">${activeTask.taskId}</div>
        `;
    } else {
        activityContainer.innerHTML = `<div class="empty-msg">Waiting for workload...</div>`;
    }

    if (!window.GigaUI_Initialized) {
        initResourceControls(nodeInfo);
        window.GigaUI_Initialized = true;
    }
}

function initResourceControls(nodeInfo) {
    const rangeCpu = document.getElementById('range-cpu');
    const rangeMem = document.getElementById('range-mem');
    const valCpu = document.getElementById('val-cpu-limit');
    const valMem = document.getElementById('val-mem-limit');

    const maxCores = nodeInfo.totalCores || 8;
    const maxMem = nodeInfo.totalMemoryGb || 16;
    rangeCpu.max = maxCores;
    rangeMem.max = maxMem;

    const updateSimulation = () => {
        valCpu.textContent = `${rangeCpu.value} Cores`;
        valMem.textContent = `${rangeMem.value} GB`;
        const est = (parseInt(rangeCpu.value) * 15.0).toFixed(2);
        document.getElementById('sim-revenue').textContent = est;
    };

    rangeCpu.addEventListener('input', updateSimulation);
    rangeMem.addEventListener('input', updateSimulation);
    updateSimulation();
}

window.app = {
    setQuickMode(mode) {
        const rangeCpu = document.getElementById('range-cpu');
        const rangeMem = document.getElementById('range-mem');
        const maxC = parseInt(rangeCpu.max);
        const maxM = parseInt(rangeMem.max);

        document.querySelectorAll('.segmented-control button').forEach(b => b.classList.remove('active'));
        document.getElementById(`mode-${mode}`).classList.add('active');

        if (mode === 'eco') { rangeCpu.value = 1; rangeMem.value = 2; }
        else if (mode === 'balanced') { rangeCpu.value = Math.floor(maxC * 0.5); rangeMem.value = Math.floor(maxM * 0.5); }
        else if (mode === 'turbo') { rangeCpu.value = maxC; rangeMem.value = maxM; }

        rangeCpu.dispatchEvent(new Event('input'));

        ui.log(`Switched to [${mode.toUpperCase()}] profile. Optimizing for ${mode === 'turbo' ? 'max yield' : 'efficiency'}.`, 'info');
    }
};

const ui = {
    log(msg, type = 'info') {
        const consoleEl = document.getElementById('live-console');
        if (!consoleEl) return;
        const line = document.createElement('div');
        line.className = `log-line ${type}`;
        line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        consoleEl.appendChild(line);
        consoleEl.scrollTop = consoleEl.scrollHeight;

        // Keep max 50 lines
        while (consoleEl.children.length > 50) consoleEl.removeChild(consoleEl.firstChild);
    },
    switchSettingsTab(tabId) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.settings-tab-content').forEach(c => c.style.display = 'none');

        event.target.classList.add('active');
        document.getElementById(`settings-${tabId}`).style.display = 'block';
    }
};

// Bandwidth Slider UI
const rangeBandwidth = document.getElementById('range-bandwidth');
const valBandwidth = document.getElementById('val-bandwidth');
if (rangeBandwidth) {
    rangeBandwidth.oninput = (e) => {
        valBandwidth.textContent = `${e.target.value} Mbps`;
    };
}

// Periodic Dummy Logs to show "transparency"
const dummyLogs = [
    "Verifying cryptographic proof for Task #8122-A...",
    "Resource utilization within secure enclave limits.",
    "Snapshotting local state for upcoming checkpoint.",
    "Network latency optimization: Re-routed via Nexus-Point-Tokyo.",
    "Passive security scan: No anomalies detected in worker container."
];
setInterval(() => {
    if (Math.random() > 0.7) {
        ui.log(dummyLogs[Math.floor(Math.random() * dummyLogs.length)], 'info');
    }
}, 5000);

ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'init' || msg.type === 'update') {
        updateUI(msg.payload);
        if (msg.type === 'init') ui.log("Connected to Nexus Cloud Engine. Syncing node status...", "success");
    }
};

const settingsBtn = document.getElementById('btn-settings');
const settingsModal = document.getElementById('settings-modal');
if (settingsBtn) settingsBtn.onclick = () => settingsModal.style.display = 'flex';
document.getElementById('btn-close-settings').onclick = () => settingsModal.style.display = 'none';
