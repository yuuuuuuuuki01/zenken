import axios from 'axios';

async function verifyFundMovementProduction() {
    const serverUrl = 'https://api-821089499950.us-central1.run.app';
    console.log(`--- Verifying Fund Movement in Production: ${serverUrl} ---`);

    // We expect the direct API to work for HTTP endpoints.
    try {
        const versionRes = await axios.get(`${serverUrl}/v1/version`);
        console.log('Current Version (Live):', versionRes.data);

        // [Manual Check Required] 
        // Production validation requires real auth tokens or an admin-level test bypass.
        // For this automated verification, we will check if the endpoints are RESPONDING normally.

        console.log('Testing /v1/client/payments/checkout connectivity...');
        try {
            // This should fail with 401 if auth is working correctly.
            await axios.post(`${serverUrl}/v1/client/payments/checkout`, { amountPoints: 1000 });
        } catch (e: any) {
            if (e.response && e.response.status === 401) {
                console.log('✅ Auth is active (401 received)');
            } else {
                console.warn('⚠️ Unexpected response:', e.message);
            }
        }

        console.log('--- Checking Download Link Stability ---');
        const downloadUrl = `${serverUrl}/api/download/latest/win`;
        try {
            // Note: Axios will follow redirect.
            const res = await axios.head(downloadUrl);
            console.log('✅ Download link responded with status:', res.status);
            console.log('Redirect Destination:', res.request.res.responseUrl);
        } catch (e: any) {
            console.error('❌ Download link failed:', e.message);
            if (e.response) console.error('Status:', e.response.status);
        }

    } catch (error: any) {
        console.error('❌ Verification failed:', error.message);
    }
}

verifyFundMovementProduction();
