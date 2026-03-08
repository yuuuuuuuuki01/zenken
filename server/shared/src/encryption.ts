import * as crypto from 'crypto';

/**
 * GigaCompute Encryption Utilities
 * E2EE (End-to-End Encryption) for task payloads.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypts a buffer with a given key.
 * @param data The data to encrypt
 * @param key A 32-byte key
 */
export function encrypt(data: Buffer, key: Buffer): { encrypted: Buffer; iv: Buffer; authTag: Buffer } {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return { encrypted, iv, authTag };
}

/**
 * Decrypts data.
 * @param encrypted The encrypted data
 * @param key A 32-byte key
 * @param iv The initialization vector
 * @param authTag The authentication tag
 */
export function decrypt(encrypted: Buffer, key: Buffer, iv: Buffer, authTag: Buffer): Buffer {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted;
}

/**
 * Generates a key from a string (for PoC purposes).
 * In production, this would be a real random key exchanged via RSA/ECC.
 */
export function deriveKey(secret: string): Buffer {
    return crypto.createHash('sha256').update(secret).digest();
}

/**
 * node Trust Protocol: Sign data with a private key.
 * Currently using ed25519 for high-performance signatures.
 */
export function signResult(data: Buffer, privateKey: string): Buffer {
    return crypto.sign(null, data, privateKey);
}

/**
 * Node Trust Protocol: Verify signature with a public key.
 */
export function verifySignature(data: Buffer, signature: Buffer, publicKey: string): boolean {
    return crypto.verify(null, data, publicKey, signature);
}

/**
 * Helper to generate a new keypair for a node.
 */
export function generateNodeKeypair(): { publicKey: string, privateKey: string } {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    return { publicKey, privateKey };
}
