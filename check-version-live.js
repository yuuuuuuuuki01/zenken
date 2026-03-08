
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function checkVersion() {
    const doc = await db.collection('system').doc('version').get();
    if (doc.exists) {
        console.log('Current Firestore Version Data:');
        console.log(JSON.stringify(doc.data(), null, 2));
    } else {
        console.log('No version document found in Firestore.');
    }
    process.exit(0);
}

checkVersion();
