const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

let JWT_SECRET = process.env.JWT_SECRET;
let ACTUAL_SECRET = JWT_SECRET || 'dev-fallback-non-secure-key-2026';

function ensureSecret() {
    JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
        process.stderr.write('[WARN] CRITICAL: JWT_SECRET environment variable is not set. Security compromised.\n');
        // Do not throw here to prevent Firebase framework initialization crash
    }
    ACTUAL_SECRET = JWT_SECRET || 'dev-fallback-non-secure-key-2026';
}

export async function hashPassword(password: string): Promise<string> {
    return await bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(password, hash);
}

export function generateToken(payload: any): string {
    ensureSecret();
    return jwt.sign(payload, ACTUAL_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): any {
    ensureSecret();
    try {
        return jwt.verify(token, ACTUAL_SECRET);
    } catch (e) {
        return null;
    }
}
