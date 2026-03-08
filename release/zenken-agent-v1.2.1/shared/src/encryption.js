"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.encrypt = encrypt;
exports.decrypt = decrypt;
exports.deriveKey = deriveKey;
exports.signResult = signResult;
exports.verifySignature = verifySignature;
exports.generateNodeKeypair = generateNodeKeypair;
const crypto = __importStar(require("crypto"));
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
function encrypt(data, key) {
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
function decrypt(encrypted, key, iv, authTag) {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted;
}
/**
 * Generates a key from a string (for PoC purposes).
 * In production, this would be a real random key exchanged via RSA/ECC.
 */
function deriveKey(secret) {
    return crypto.createHash('sha256').update(secret).digest();
}
/**
 * node Trust Protocol: Sign data with a private key.
 * Currently using ed25519 for high-performance signatures.
 */
function signResult(data, privateKey) {
    return crypto.sign(null, data, privateKey);
}
/**
 * Node Trust Protocol: Verify signature with a public key.
 */
function verifySignature(data, signature, publicKey) {
    return crypto.verify(null, data, publicKey, signature);
}
/**
 * Helper to generate a new keypair for a node.
 */
function generateNodeKeypair() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    return { publicKey, privateKey };
}
