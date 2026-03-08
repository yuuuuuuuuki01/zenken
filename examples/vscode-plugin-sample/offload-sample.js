// ZEN KEN VSCode Plugin Sample (Task Offloading)
// This is a minimal example showing how a VSCode extension could offload heavy tasks to the ZEN KEN network.

const axios = require('axios');

/**
 * Offloads a computation task to the ZEN KEN network.
 * @param {string} code - The code or prompt to process.
 * @param {string} apiToken - User's API token from Client Portal.
 */
async function offloadToZenKen(code, apiToken) {
    console.log('[ZEN KEN] Offloading task...');

    try {
        const response = await axios.post('https://api.zenken.jp/v1/client/jobs', {
            type: 'script_exec',
            payload: code,
            rewardPerChunk: 0.5
        }, {
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
            }
        });

        const jobId = response.data.jobId;
        console.log(`[ZEN KEN] Job submitted! ID: ${jobId}`);

        // Poll for results (Simplified)
        let completed = false;
        while (!completed) {
            const status = await axios.get(`https://api.zenken.jp/v1/client/jobs/${jobId}`, {
                headers: { 'Authorization': `Bearer ${apiToken}` }
            });

            if (status.data.step === 'accepted') {
                console.log('[ZEN KEN] Task Complete! Result:', status.data.result);
                completed = true;
                return status.data.result;
            }

            console.log(`[ZEN KEN] Processing... Current state: ${status.data.step}`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    } catch (err) {
        console.error('[ZEN KEN] Offloading failed:', err.response?.data || err.message);
    }
}

module.exports = { offloadToZenKen };
