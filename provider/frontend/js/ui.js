// [UI Module]
// State-reactive UI updates (Tables, Badges, Stats)

function updateUI(data) {
    const { nodeInfo, walletStats, localTasks } = data;

    // Node Stats
    document.getElementById('display-id').textContent = nodeInfo.name || nodeInfo.id;
    document.getElementById('stat-perf').textContent = nodeInfo.performanceScore;
    document.getElementById('stat-trust').textContent = nodeInfo.trustScore.toFixed(2);

    // Trust Progress Bar (based on score 0-100 logic or similar)
    const trustProgress = Math.min(100, (nodeInfo.trustScore / 10) * 100); // Assuming 10 is a milestone
    const trustBar = document.getElementById('trust-progress-bar');
    if (trustBar) trustBar.style.width = `${trustProgress}%`;

    // Wallet & ROI Calculation
    const totalIncome = walletStats.totalIncome;
    const uptimeMs = Date.now() - nodeInfo.uptimeStart;

    // Default config values
    const roi = data.roiStats || { costPerMsUsd: 0, costPerHourYen: 0, totalApiExpenseUsd: 0 };

    // Electrical Cost based on uptime
    const currentElectricalCostUsd = roi.costPerMsUsd * uptimeMs;
    const totalEstimatedCost = currentElectricalCostUsd + roi.totalApiExpenseUsd;
    const netProfit = totalIncome - totalEstimatedCost;

    // Monthly Projection: Extrapolate current profit per millisecond to 30 days
    const msInMonth = 30 * 24 * 60 * 60 * 1000;
    const profitPerMs = netProfit / (uptimeMs > 0 ? uptimeMs : 1);
    const monthlyForecast = Math.max(0, profitPerMs * msInMonth);

    // Update Dashboard Display
    // Sync Ticker to Net Profit Instead of Gross
    const prevAmount = parseFloat(document.getElementById('ticker-amount').textContent) || 0;
    document.getElementById('ticker-amount').textContent = totalIncome.toFixed(6);

    if (totalIncome > prevAmount && prevAmount > 0) {
        const tickerContainer = document.querySelector('.ticker-container');
        tickerContainer.classList.remove('reward-pulse');
        void tickerContainer.offsetWidth; // Trigger reflow
        tickerContainer.classList.add('reward-pulse');
        showEarningsParticle(totalIncome - prevAmount);
    }

    if (window.GigaTicker) {
        window.GigaTicker.update(netProfit);
    }
    // Activity Status
    const activeTask = localTasks.find(t => t.status === 'processing');
    const activityContainer = document.getElementById('current-activity');
    if (activeTask) {
        if (window.GigaTicker) window.GigaTicker.setRate(`+${(Math.random() * 0.05).toFixed(3)} / sec`, true);
        activityContainer.innerHTML = `
            <div style="font-family: Orbitron; color: var(--accent-primary); font-size: 1.1rem; letter-spacing: 2px;">SECURE SANDBOX ACTIVE</div>
            <div class="sandbox-shield">
                <div class="shield-core"></div>
                <div class="shield-ring"></div>
            </div>
            <div style="font-size: 0.7rem; margin: 10px 0; opacity: 0.8; color: var(--accent-primary);">EXECUTING: ${activeTask.taskId}</div>
            <div class="progress-bar" style="max-width: 80%; margin: 15px auto;"><div class="progress-fill" style="width: 60%"></div></div>
        `;
    } else {
        if (window.GigaTicker) window.GigaTicker.setRate(`IDLE - STANDBY`, false);
        activityContainer.innerHTML = `<div class="empty-msg">Waiting for workload...</div>`;
    }

    // History Table
    const historyBody = document.getElementById('history-body');
    historyBody.innerHTML = localTasks.slice(0, 10).map(t => `
        <tr>
            <td><small>${t.taskId.substring(0, 8)}...</small></td>
            <td><span class="status-pill ${t.status}">${t.status.toUpperCase()}</span></td>
            <td>
                ${t.status === 'completed' ? `
                    <div style="font-size: 0.65rem; color: var(--accent-success);">+${(t.rewardPoints || 0).toFixed(1)}</div>
                    <div style="font-size: 0.55rem; color: var(--text-secondary); margin-top: 2px;">
                        [${t.resources?.cpuCores || '--'}C / ${t.resources?.memoryGb || '--'}G]
                    </div>
                ` : '---'}
            </td>
        </tr>
    `).join('');

    // Staging List
    const stagingList = document.getElementById('staging-list');
    if (data.pendingStaging && data.pendingStaging.length > 0) {
        stagingList.innerHTML = data.pendingStaging.map(id => `
            <div style="margin-bottom: 10px; font-size: 0.7rem; border: 1px solid var(--glass-border); padding: 10px;">
                <div>TASK: ${id}</div>
                <button onclick="app.mergeTask('${id}')" class="btn-confirm" style="margin-top:10px; padding:5px; font-size:0.6rem;">MERGE</button>
            </div>
        `).join('');
    } else {
        stagingList.innerHTML = '<div class="empty-msg">No pending results.</div>';
    }

    // Update Resource Sliders if not yet initialized
    if (!window.GigaUI.initialized) {
        initResourceControls(nodeInfo);
        window.GigaUI.initialized = true;
    }
}

// ========== Resource Control Logic ==========
function initResourceControls(nodeInfo) {
    const rangeCpu = document.getElementById('range-cpu');
    const rangeMem = document.getElementById('range-mem');
    const valCpu = document.getElementById('val-cpu-limit');
    const valMem = document.getElementById('val-mem-limit');

    // Hardware Specs from Backend
    const maxCores = nodeInfo.totalCores || 8;
    const maxMem = nodeInfo.totalMemoryGb || 16;

    rangeCpu.max = maxCores;
    rangeMem.max = maxMem;

    // Logic-based Recommendation
    const recCores = Math.max(1, maxCores - 2);
    const recMem = Math.max(2, Math.floor(maxMem * 0.7));

    // Update Wizard Recommendations
    const wizCpu = document.getElementById('wiz-cpu-rec');
    const wizMem = document.getElementById('wiz-mem-rec');
    if (wizCpu) wizCpu.textContent = `${recCores} Cores`;
    if (wizMem) wizMem.textContent = `${recMem} GB`;

    const updateSimulation = () => {
        const c = parseInt(rangeCpu.value);
        const m = parseInt(rangeMem.value);

        valCpu.textContent = `${c} Cores`;
        valMem.textContent = `${m} GB`;

        // Mathematical Revenue Model: 
        // Profit = (BaseRate * Cores * MemFactor) - ElectricalCost
        const baseRatePerMonth = 15.0; // $15 base for 1 core
        const memFactor = 1 + (m / 32);
        const estRevenue = (baseRatePerMonth * c * memFactor).toFixed(2);

        document.getElementById('sim-revenue').textContent = estRevenue;

        // Sync with agent backend
        if (window.app && window.app.updateResourceLimits) {
            window.app.updateResourceLimits(c, m);
        }

        // Diff Display
        const diffCpu = document.getElementById('diff-cpu');
        const diffMem = document.getElementById('diff-mem');

        if (c < recCores) {
            diffCpu.textContent = `⚡ 推奨まであと ${recCores - c} コア余裕があります`;
            diffCpu.style.color = 'var(--accent-success)';
        } else if (c > recCores) {
            diffCpu.textContent = `⚠️ 公共利用(OS)への影響が出る可能性があります`;
            diffCpu.style.color = '#f87171';
        } else {
            diffCpu.textContent = `✅ 最適なコア割当です`;
            diffCpu.style.color = 'var(--accent-primary)';
        }

        if (m < recMem) {
            diffMem.textContent = `⚡ 推奨まであと ${recMem - m} GB 余裕があります`;
            diffMem.style.color = 'var(--accent-success)';
        } else if (m > recMem) {
            diffMem.textContent = `⚠️ メモリ不足によるスワップの恐れがあります`;
            diffMem.style.color = '#f87171';
        } else {
            diffMem.textContent = `✅ 最適なメモリ割当です`;
            diffMem.style.color = 'var(--accent-primary)';
        }
    };

    rangeCpu.addEventListener('input', updateSimulation);
    rangeMem.addEventListener('input', updateSimulation);

    // Initial value setup
    rangeCpu.value = recCores;
    rangeMem.value = recMem;
    updateSimulation();
}

/**
 * Handle Quick Mode segment switching
 */
function setQuickMode(mode) {
    const rangeCpu = document.getElementById('range-cpu');
    const rangeMem = document.getElementById('range-mem');
    const maxCores = parseInt(rangeCpu.max);
    const maxMem = parseInt(rangeMem.max);

    // Update active state in UI
    document.querySelectorAll('.segmented-control button').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`mode-${mode}`).classList.add('active');

    if (mode === 'eco') {
        rangeCpu.value = 1;
        rangeMem.value = Math.max(1, Math.floor(maxMem * 0.2));
    } else if (mode === 'balanced') {
        rangeCpu.value = Math.max(1, Math.floor(maxCores * 0.5));
        rangeMem.value = Math.max(1, Math.floor(maxMem * 0.5));
    } else if (mode === 'turbo') {
        rangeCpu.value = maxCores;
        rangeMem.value = maxMem;
    }

    // Trigger input event to update simulation and backend
    rangeCpu.dispatchEvent(new Event('input'));
    rangeMem.dispatchEvent(new Event('input'));
}

function showEarningsParticle(amount) {
    const ticker = document.querySelector('.ticker-value');
    if (!ticker) return;
    const particle = document.createElement('div');
    particle.className = 'earnings-particle';
    particle.textContent = `+$${amount.toFixed(4)}`;
    ticker.appendChild(particle);
    setTimeout(() => { particle.remove(); }, 1500);
}

window.GigaUI = { update: updateUI, initialized: false, setQuickMode };
