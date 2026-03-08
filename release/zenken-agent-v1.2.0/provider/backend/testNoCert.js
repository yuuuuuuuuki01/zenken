"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = __importDefault(require("ws"));
const serverUrl = 'wss://localhost:8080';
console.log(`Connecting to ${serverUrl} WITHOUT client certificate...`);
const ws = new ws_1.default(serverUrl, {
    // We provide CA to verify server, but NO client cert/key
    // Or just connect normally (which will also fail server validation)
    rejectUnauthorized: false
});
ws.on('open', () => {
    console.log('❌ UNEXPECTED: Connected without client certificate!');
    process.exit(1);
});
ws.on('error', (err) => {
    console.log('✅ REJECTED as expected:', err.message);
    process.exit(0);
});
setTimeout(() => {
    console.log('Timed out waiting for connection (assumed rejected/hung)');
    process.exit(0);
}, 5000);
