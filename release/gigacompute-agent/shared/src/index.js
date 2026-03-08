"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalStringify = canonicalStringify;
/**
 * [Phase 27] Deterministic Serialization
 * オブジェクトのキーをソートしてシリアライズし、署名検証の一貫性を保証する。
 */
function canonicalStringify(obj) {
    if (obj === null || typeof obj !== 'object') {
        return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
        return '[' + obj.map(o => canonicalStringify(o)).join(',') + ']';
    }
    const sortedKeys = Object.keys(obj).sort();
    return '{' + sortedKeys.map(k => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`).join(',') + '}';
}
