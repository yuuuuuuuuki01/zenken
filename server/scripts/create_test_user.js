const https = require('https');

const data = JSON.stringify({
    email: 'stripe-test@example.com',
    password: 'testpassword123',
    name: 'Stripe Tester'
});

const options = {
    hostname: 'localhost',
    port: 8081,
    path: '/auth/register',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    },
    rejectUnauthorized: false
};

const req = https.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
        console.log(body);
    });
});

req.on('error', (e) => {
    console.error(e);
});

req.write(data);
req.end();
