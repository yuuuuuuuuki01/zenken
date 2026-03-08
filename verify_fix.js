const { db } = require('./server/src/db');
const admin = require('./server/node_modules/firebase-admin');
const serviceAccount = require('./server/serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

async function verify() {
    console.log("--- Verifying db.ts Fix ---");
    const email = 'demo@gigacompute.net';
    const user = await db.user.findUnique({ where: { email } });

    console.log(`Found user by email: ${email}`);
    console.log(`Returned user.id: ${user.id}`);
    console.log(`Firestore document ID should be: FYk9xssUCWC5HrK2fuJu`);

    if (user.id === 'FYk9xssUCWC5HrK2fuJu') {
        console.log("✅ SUCCESS: Correct ID returned.");
    } else {
        console.log("❌ FAILURE: ID still being overridden!");
    }
}

verify().catch(console.error);
