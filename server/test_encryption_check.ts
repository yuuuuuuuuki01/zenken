import { encrypt, decrypt } from './src/utils/encryption';

const testKey = 'sk-abcdefg1234567890';
console.log('Original Key:', testKey);

const encrypted = encrypt(testKey);
console.log('Encrypted:', encrypted);

const decrypted = decrypt(encrypted);
console.log('Decrypted:', decrypted);

if (testKey === decrypted) {
    console.log('✅ Success: Decrypted key matches original.');
} else {
    console.error('❌ Failure: Decrypted key does not match original.');
    process.exit(1);
}

// Test migration case (plain text)
const plainText = 'already-plain-text';
const result = decrypt(plainText);
console.log('Plain text test:', result);
if (result === plainText) {
    console.log('✅ Success: Plain text handled correctly.');
}
