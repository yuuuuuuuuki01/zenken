// [Portal Module]
const portal = {
    apiKeyVisible: false,

    async init() {
        console.log("[Portal] Initializing Developer Dashboard...");
        this.updateStats();
        this.setupWS();
    },

    async updateStats() {
        // Mocking balance for PoC
        document.getElementById('points-balance').textContent = '50,000';
        document.getElementById('node-count').textContent = '128';
    },

    async buyPoints() {
        const amount = prompt("チャージするポイント額を入力してください (GCP)", "5000");
        if (!amount) return;

        try {
            // Simulated Stripe Checkout call to /v1/dev/payment/checkout
            alert(`Stripe Checkout Session を作成中...\n(Target: /v1/dev/payment/checkout for ${amount} GCP)`);
            // In a real flow: window.location.href = data.url;
        } catch (e) {
            console.error("Payment failed", e);
        }
    },

    toggleKey() {
        this.apiKeyVisible = !this.apiKeyVisible;
        const input = document.getElementById('api-key');
        input.type = this.apiKeyVisible ? 'text' : 'password';
    },

    setupWS() {
        const ws = new WebSocket(`wss://${location.host}`);
        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === 'system_state') {
                this.updateNetworkState(msg.payload);
            }
        };
    },

    updateNetworkState(payload) {
        const list = document.getElementById('active-tasks-list');
        const tasks = payload.activeTasks || [];

        if (tasks.length === 0) {
            list.innerHTML = '<div class="empty-msg">実行中のタスクはありません。</div>';
            return;
        }

        list.innerHTML = tasks.map(task => `
            <div class="task-card">
                <div>
                    <div class="task-id">ID: ${task.taskId}</div>
                    <div class="info small">Req: ${task.requesterId}</div>
                </div>
                <div class="task-status">${this.getStatusJp(task.step)}</div>
                <div class="task-timer">${new Date(task.lastUpdate).toLocaleTimeString()}</div>
            </div>
        `).join('');
    },

    getStatusJp(step) {
        const map = {
            'submitted': '提出済み',
            'verifying': '検証中',
            'executing': '実行中',
            'verified': '完了',
            'failed': '失敗'
        };
        return map[step.toLowerCase()] || step.toUpperCase();
    },

    openTab(evt, tabName) {
        const tabcontent = document.getElementsByClassName("tab-content");
        for (let i = 0; i < tabcontent.length; i++) tabcontent[i].style.display = "none";
        const tablinks = document.getElementsByClassName("tab-link");
        for (let i = 0; i < tablinks.length; i++) tablinks[i].classList.remove("active");
        document.getElementById(tabName).style.display = "block";
        evt.currentTarget.classList.add("active");
    },

    showToast(message, type = 'info') {
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<span>${type === 'success' ? '✅' : 'ℹ️'}</span> ${message}`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    async downloadAgent(osType, url) {
        const btn = event.currentTarget;
        const originalText = btn.innerHTML;

        btn.classList.add('loading');
        btn.innerHTML = `<span class="icon">⌛</span> 準備中...`;

        this.showToast(`${osType} 用パッケージを準備しています...`, 'info');

        // Simulate preparation time
        await new Promise(r => setTimeout(r, 1500));

        this.showToast('ダウンロードを開始しました。', 'success');

        // Trigger actual download
        const link = document.createElement('a');
        link.href = url;
        link.download = '';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => {
            btn.classList.remove('loading');
            btn.innerHTML = originalText;
        }, 1000);
    }
};

window.portal = portal;
portal.init();
