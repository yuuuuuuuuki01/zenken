#!/usr/bin/env node
/**
 * prepare-sidecar.js
 * ローカル開発時に、プラットフォームに合ったバックエンドバイナリを
 * Tauri が要求する命名規則（gigacompute-backend-[target-triple]）に従って
 * src-tauri/binaries/ に配置するスクリプト。
 *
 * 使い方: node scripts/prepare-sidecar.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// ---- Rust ターゲットトリプルを取得 ----
function getRustTargetTriple() {
    try {
        const output = execSync('rustc -vV').toString();
        const match = output.match(/host:\s+(.+)/);
        if (match) return match[1].trim();
    } catch (e) {
        // rustc が見つからない場合は OS から推測
    }
    const platform = os.platform();
    const arch = os.arch();
    if (platform === 'win32') return 'x86_64-pc-windows-msvc';
    if (platform === 'darwin') return arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
    return 'x86_64-unknown-linux-gnu';
}

// ---- メイン ----
const rootDir = path.resolve(__dirname, '..');
const backendDir = path.join(rootDir, 'provider', 'backend');
const binariesDir = path.join(rootDir, 'provider', 'src-tauri', 'binaries');

const triple = getRustTargetTriple();
const isWindows = triple.includes('windows');
const srcName = isWindows ? 'gigacompute-agent.exe' : 'gigacompute-agent';
const destName = isWindows
    ? `gigacompute-agent-${triple}.exe`
    : `gigacompute-agent-${triple}`;

console.log(`\n[prepare-sidecar] Platform target: ${triple}`);

// binaries/ ディレクトリを作成
if (!fs.existsSync(binariesDir)) {
    fs.mkdirSync(binariesDir, { recursive: true });
    console.log(`[prepare-sidecar] Created: ${binariesDir}`);
}

// ビルド済みバイナリを探す場所（優先順）
const candidates = [
    path.join(backendDir, 'dist', 'bin', srcName),
    path.join(backendDir, srcName),
];

let srcPath = null;
for (const c of candidates) {
    if (fs.existsSync(c)) { srcPath = c; break; }
}

if (!srcPath) {
    console.error(`\n[prepare-sidecar] ERROR: Binary not found. Run 'npm run package' in provider/backend first.`);
    console.error(`  Searched:\n  ${candidates.join('\n  ')}`);
    process.exit(1);
}

const destPath = path.join(binariesDir, destName);
fs.copyFileSync(srcPath, destPath);
if (!isWindows) fs.chmodSync(destPath, '755');

console.log(`[prepare-sidecar] ✅ Copied: ${path.relative(rootDir, srcPath)}`);
console.log(`                        -> ${path.relative(rootDir, destPath)}`);
console.log('\n[prepare-sidecar] Done! You can now run `npm run tauri build`.\n');
