import { firestoreService } from './src/utils/firestore';
import { getAdmin } from './src/utils/firebase';

async function main() {
    console.log('Initializing Firebase Admin...');
    getAdmin();

    const newVersion = {
        version: 'v1.2.1',
        downloadUrl: '/downloads/ZENKEN_AGENT_v1.2.1.exe',
        macDownloadUrl: '/downloads/zen-agent-mac-x64.zip',
        macArmDownloadUrl: '/downloads/zen-agent-mac-arm64.zip',
        releaseNotes: 'スタンドアロン (.exe形式) での配布を開始しました。Node.js のインストールは不要です。',
        isPublic: true
    };

    console.log('Updating version in Firestore:', newVersion);
    await firestoreService.updateVersion(newVersion);

    const verified = await firestoreService.getVersion();
    console.log('Verified Version in Firestore:', verified);
    console.log('Update complete!');
}

main().catch(err => {
    console.error('Update failed:', err);
    process.exit(1);
});
