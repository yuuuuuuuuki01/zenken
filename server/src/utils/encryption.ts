import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

// Get encryption key from environment or use a stable fallback for development
// In production, ENCRYPTION_KEY MUST be set (32 bytes / 64 hex chars)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
    ? Buffer.from(process.env.ENCRYPTION_KEY, 'hex')
    : crypto.scryptSync(process.env.JWT_SECRET || 'giga-compute-fallback-salt', 'salt', 32);

/**
 * Encrypts text using AES-256-GCM
 */
export function encrypt(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');

    // Format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts text using AES-256-GCM
 */
export function decrypt(cipherText: string): string {
    try {
        const [ivHex, authTagHex, encryptedHex] = cipherText.split(':');
        if (!ivHex || !authTagHex || !encryptedHex) {
            throw new Error('Invalid cipher text format');
        }

        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        console.error('[Encryption] Decryption failed:', error);
        // If decryption fails, it might be plain text (for migration) or wrong key
        return cipherText;
    }
}
