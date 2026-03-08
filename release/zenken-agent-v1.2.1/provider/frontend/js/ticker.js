// [Ticker Module]
// Handles real-time income counting animation

const tickerEl = document.getElementById('roi-net');
const grossEl = document.getElementById('ticker-amount');
const rateEl = document.getElementById('ticker-rate');

let currentProfit = 0;
let targetProfit = 0;
let profitPerMs = 0;
let lastUpdateTime = Date.now();

function animateTicker() {
    if (currentProfit < targetProfit) {
        const now = Date.now();
        const delta = now - lastUpdateTime;
        currentProfit += profitPerMs * delta;
        if (currentProfit > targetProfit) currentProfit = targetProfit;
        if (tickerEl) tickerEl.textContent = currentProfit.toFixed(6);
        lastUpdateTime = now;
    } else {
        lastUpdateTime = Date.now();
    }
    requestAnimationFrame(animateTicker);
}

// Initial Kickoff
animateTicker();

// Export state for other modules to update
window.GigaTicker = {
    update(newProfit) {
        if (newProfit > targetProfit) {
            // Calculate speed to catch up in 1000ms
            profitPerMs = (newProfit - currentProfit) / 1000;
            targetProfit = newProfit;
        } else {
            targetProfit = newProfit;
            currentProfit = newProfit; // Snap if it decreased
            if (tickerEl) tickerEl.textContent = currentProfit.toFixed(6);
        }
    },
    setRate(text, isProcessing) {
        rateEl.textContent = text;
        rateEl.style.color = isProcessing ? "var(--accent-success)" : "var(--text-secondary)";
    }
};
