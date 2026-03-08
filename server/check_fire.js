const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

async function checkFirestoreVersion() {
    const serviceAccountPath = path.resolve(__dirname, 'serviceAccountKey.json');
    if (!fs.existsSync(serviceAccountPath)) {
        console.error('Service account key not found at:', serviceAccountPath);
        process.exit(1);
    }

    if (admin.apps.length === 0) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccountPath)
        });
    }

    const db = admin.firestore();
    console.log('--- Fetching system/versioning from Firestore ---');
    const doc = await db.collection('system').doc('versioning').get();

    if (doc.exists) {
        console.log('Document Data:', JSON.stringify(doc.data(), null, 2));
    } else {
        console.log('Document does not exist!');
    }
}

checkFirestoreVersion().catch(err => console.error('Error:', err));
