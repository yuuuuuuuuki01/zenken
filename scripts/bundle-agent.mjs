import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const releaseDir = path.resolve(rootDir, 'release/gigacompute-agent');

function copyDir(src, dest, exclude = []) {
    fs.mkdirSync(dest, { recursive: true });
    if (!fs.existsSync(src)) {
        console.warn(`  ⚠️  Source not found, skipping: ${src}`);
        return;
    }
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        if (exclude.includes(entry.name)) continue;
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath, exclude);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

console.log('📦 GigaCompute Agent Bundler');
console.log('============================');

// ──────────────────────────────────────────
// 1. TypeScript ビルド
// ──────────────────────────────────────────
console.log('\n🔨 Step 1: TypeScript build...');
try {
    execSync('npm run build', {
        cwd: path.join(rootDir, 'provider/backend'),
        stdio: 'inherit'
    });
    console.log('  ✅ Build succeeded');
} catch (e) {
    console.error('  ❌ Build failed:', e.message);
    process.exit(1);
}

// ──────────────────────────────────────────
// 2. Release dir をクリーン
// ──────────────────────────────────────────
console.log('\n🗑️  Step 2: Cleaning release dir...');
if (fs.existsSync(releaseDir)) {
    fs.rmSync(releaseDir, { recursive: true, force: true });
}
fs.mkdirSync(releaseDir, { recursive: true });

// ──────────────────────────────────────────
// 3. コンパイル済み JS をコピー
//    dist/ の中身を丸ごと → releaseDir/
// ──────────────────────────────────────────
console.log('\n📂 Step 3: Copying compiled output...');
const distDir = path.join(rootDir, 'provider/backend/dist');
copyDir(distDir, releaseDir, []);
console.log(`  ✅ Copied: dist/ → ${releaseDir}`);

// ──────────────────────────────────────────
// 4. フロントエンドをコピー
//    guiServer.ts のパス2 (../frontend) に合わせる
//    → provider/frontend → releaseDir/provider/frontend
// ──────────────────────────────────────────
console.log('\n🎨 Step 4: Copying frontend...');
const frontendSrc = path.join(rootDir, 'provider/frontend');
const frontendDest = path.join(releaseDir, 'provider/frontend');
copyDir(frontendSrc, frontendDest, []);
console.log(`  ✅ Copied: provider/frontend/ → ${frontendDest}`);

// ──────────────────────────────────────────
// 5. node_modules (必要最小限) をコピー
//    ※ provider/backend/node_modules → releaseDir/provider/backend/node_modules
// ──────────────────────────────────────────
console.log('\n📦 Step 5: Copying node_modules...');
const moduleSrc = path.join(rootDir, 'provider/backend/node_modules');
const moduleDest = path.join(releaseDir, 'provider/backend/node_modules');
copyDir(moduleSrc, moduleDest, ['.cache', '.bin']);
console.log(`  ✅ Copied: node_modules`);

// ──────────────────────────────────────────
// 6. 設定ファイルをコピー (provider/config.json をそのまま使用)
// ──────────────────────────────────────────
console.log('\n🌐 Step 6: Copying config.json...');
const configSrc = path.join(rootDir, 'provider/config.json');
const configDest = path.join(releaseDir, 'config.json');
if (fs.existsSync(configSrc)) {
    fs.copyFileSync(configSrc, configDest);
    console.log(`  ✅ config.json copied from ${configSrc}`);
} else {
    console.warn(`  ⚠️  config.json not found in ${configSrc}, fallback to default`);
    const config = { serverUrl: `wss://localhost:8081` };
    fs.writeFileSync(configDest, JSON.stringify(config, null, 2));
}

// ──────────────────────────────────────────
// 7. 起動スクリプト生成
// ──────────────────────────────────────────
console.log('\n📝 Step 7: Creating start scripts...');

// Windows 用 .bat
const batContent = `@echo off
title GigaCompute Agent
echo ==========================================
echo   GigaCompute Agent
echo ==========================================
echo.
node provider/backend/index.js
pause
`;
fs.writeFileSync(path.join(releaseDir, 'start.bat'), batContent, 'utf8');

// README
const readmeContent = `# GigaCompute Agent

## 必要なもの
- Node.js 18 以上 (https://nodejs.org)

## 起動方法

### Windows
start.bat をダブルクリック

### その他
node provider/backend/index.js

## 設定
config.json でサーバーの接続先を変更できます。

## ブラウザUI
起動後 → http://localhost:3001 を開く
`;
fs.writeFileSync(path.join(releaseDir, 'README.md'), readmeContent, 'utf8');

console.log('  ✅ start.bat, README.md created');

// ──────────────────────────────────────────
// 8. ZIP 作成 (名称を zenken-agent.zip に統一)
// ──────────────────────────────────────────
const zipPath = path.resolve(rootDir, 'server/public/downloads/zen-agent.zip');
console.log('\n🗜️  Step 8: Creating ZIP...');
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

try {
    if (os.platform() === 'win32') {
        execSync(`powershell -Command "Compress-Archive -Path '${releaseDir}\\*' -DestinationPath '${zipPath}' -Force"`);
    } else {
        execSync(`cd "${releaseDir}" && zip -r "${zipPath}" .`);
    }
    const sizeMb = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1);
    console.log(`  ✅ ZIP created: ${zipPath} (${sizeMb} MB)`);
} catch (e) {
    console.error('  ❌ ZIP failed:', e.message);
}

console.log('\n🎉 Bundle complete!');
console.log(`   Release dir : ${releaseDir}`);
console.log(`   ZIP         : ${zipPath}`);
console.log('\n配布手順: zenken-agent.zip を送付 → 展開 → start.bat をダブルクリック');
