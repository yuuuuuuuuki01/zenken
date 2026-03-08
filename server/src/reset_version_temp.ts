import admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

async function resetVersion() {
    console.log('--- Resetting Firestore Version to v1.3.2 ---');

    // Load service account from local path (standard in this repo)
    const serviceAccountPath = path.resolve(process.cwd(), 'serviceAccountKey.json');
    if (!fs.existsSync(serviceAccountPath)) {
        console.error('Service account key not found at:', serviceAccountPath);
        return;
    }

    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });

    const db = admin.firestore();
    const versionData = {
        version: 'v1.3.2',
        downloadUrl: '/downloads/ZENKEN_AGENT_v1.3.2.exe',
        macDownloadUrl: '/downloads/ZENKEN_AGENT_v1.3.2_macos_x64.zip',
        macArmDownloadUrl: '/downloads/ZENKEN_AGENT_v1.3.2_macos_arm64.zip',
        releaseNotes: 'v1.3.2 アップデート：ショートカット作成機能の修正と、起動時にターミナルがすぐに消えてしまう問題への対応。',
        isPublic: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    try {
        await db.collection('system').doc('versioning').set(versionData, { merge: false });
        console.log('✅ Successfully reset Firestore version to v1.3.2');
    } catch (error) {
        console.error('❌ Error resetting version:', error);
    } finally {
        process.exit(0);
    }
}

resetVersion();
