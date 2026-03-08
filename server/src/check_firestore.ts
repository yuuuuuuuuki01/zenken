import admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

async function checkFirestore() {
    const serviceAccountPath = path.resolve(process.cwd(), 'serviceAccountKey.json');
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    }

    const db = admin.firestore();
    const doc = await db.collection('system').doc('versioning').get();

    if (doc.exists) {
        console.log('--- Firestore Document: system/versioning ---');
        console.log(JSON.stringify(doc.data(), null, 2));
    } else {
        console.log('--- Firestore Document NOT FOUND ---');
    }
    process.exit(0);
}

checkFirestore();
