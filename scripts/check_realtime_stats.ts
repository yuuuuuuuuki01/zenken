import axios from 'axios';
import https from 'https';

const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

async function checkStats() {
    try {
        const res = await axios.get('https://localhost:8081/api/stats/realtime', { httpsAgent });
        console.log("--- Real-time Stats ---");
        console.log(JSON.stringify(res.data, null, 2));
    } catch (e: any) {
        console.error("Error:", e.response?.data || e.message);
    }
}

checkStats();
