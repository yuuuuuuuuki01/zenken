import * as crypto from 'crypto';

function signResult(data: Buffer, privateKey: string): Buffer {
    return crypto.sign(null, data, privateKey);
}

function verifySignature(data: Buffer, signature: Buffer, publicKey: string): boolean {
    return crypto.verify(null, data, publicKey, signature);
}

function generateNodeKeypair() {
    return crypto.generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
}

const keys = generateNodeKeypair();
const result = 40;
const data = Buffer.from(JSON.stringify(result));
const signature = signResult(data, keys.privateKey);

const isValid = verifySignature(data, signature, keys.publicKey);
console.log('Is valid:', isValid);
console.log('Public Key starts with:', keys.publicKey.substring(0, 30));
console.log('Signature length:', signature.length);
