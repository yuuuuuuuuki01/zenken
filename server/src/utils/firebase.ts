import * as admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

// src 実行時と dist/server/src 実行時で深さが異なるため
function findProjectRoot(dir: string): string {
    if (process.env.K_SERVICE) {
        return process.cwd();
    }
    if (fs.existsSync(path.join(dir, 'package.json')) && (fs.existsSync(path.join(dir, 'prisma')) || dir.endsWith('server'))) {
        return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return dir;
    return findProjectRoot(parent);
}

const projRoot = findProjectRoot(__dirname);

export function getAdmin() {
    if (!admin.apps.length) {
        try {
            const serviceAccountPath = path.resolve(projRoot, 'serviceAccountKey.json');
            if (fs.existsSync(serviceAccountPath)) {
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccountPath)
                });
                process.stdout.write('[Firebase] Admin SDK initialized with serviceAccountKey.json\n');
            } else {
                admin.initializeApp();
                process.stdout.write('[Firebase] Admin SDK initialized with default credentials\n');
            }
        } catch (e) {
            if (admin.apps.length === 0) admin.initializeApp();
        }
    }
    return admin;
}

export const getAuth = () => getAdmin().auth();
export const getFirestore = () => getAdmin().firestore();
export const getStorage = () => getAdmin().storage();
export const getAppCheck = () => {
    try {
        return getAdmin().appCheck();
    } catch (e) {
        return null;
    }
};
