import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

const serviceAccountPath = path.join(__dirname, 'server', 'serviceAccountKey.json');
if (!fs.existsSync(serviceAccountPath)) {
    console.error('Service account key not found at:', serviceAccountPath);
    process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkUserData(userId: string) {
    console.log(`--- Checking Data for User: ${userId} ---`);

    // Check User
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
        console.log('User Document Found:', userDoc.data());
    } else {
        console.log('User Document NOT FOUND');
    }

    // Check Transactions
    const txSnapshot = await db.collection('transactions').where('userId', '==', userId).get();
    console.log(`Found ${txSnapshot.size} transactions:`);
    txSnapshot.docs.forEach(doc => {
        console.log(`- [${doc.id}]:`, doc.data());
    });

    // Check all users to see if there are other candidates
    console.log('\n--- List of all users ---');
    const allUsers = await db.collection('users').limit(10).get();
    allUsers.forEach(u => console.log(`- ${u.id}: ${u.data().email} (Points: ${u.data().points})`));
}

// target userId from logs: 7eqRX1i24lmW2W49aZSj
checkUserData('7eqRX1i24lmW2W49aZSj').then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
