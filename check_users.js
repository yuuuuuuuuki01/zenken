const admin = require('./server/node_modules/firebase-admin');
const serviceAccount = require('./server/serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function checkUsers() {
    console.log("--- Users in Firestore ---");
    const snapshot = await db.collection('users').get();
    snapshot.forEach(doc => {
        console.log(`ID: ${doc.id}`);
        console.log(JSON.stringify(doc.data(), null, 2));
        console.log("------------------------");
    });
}

checkUsers().catch(console.error);
