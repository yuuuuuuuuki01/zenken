import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const backendDir = path.join(rootDir, 'provider/backend');
const distDir = path.join(rootDir, 'dist/pkg_v3');
const binDir = path.join(rootDir, 'dist/bin');

async function build() {
    console.log('\n📦 GigaCompute Agent Packager v3 (ESM)');
    console.log('===============================\n');

    console.log('--- 1. 清掃 (Cleaning) ---');
    if (fs.existsSync(distDir)) fs.removeSync(distDir);
    fs.ensureDirSync(distDir);
    fs.ensureDirSync(binDir);

    console.log('\n--- 2. バックエンドのビルド (Building Backend) ---');
    try {
        execSync('npm run build', { cwd: backendDir, stdio: 'inherit' });
    } catch (e) {
        console.warn('  ⚠️ tsc warned, but continuing...');
    }

    console.log('\n--- 3. バンドル作成 (Preparing Bundle) ---');
    const tscOut = path.join(backendDir, 'dist');

    // Maintain directory structure to keep relative imports working
    const distBackendDir = path.join(distDir, 'provider/backend');
    const distSharedDir = path.join(distDir, 'shared');
    fs.ensureDirSync(distBackendDir);
    fs.ensureDirSync(distSharedDir);

    fs.copySync(path.join(tscOut, 'provider/backend'), distBackendDir);
    fs.copySync(path.join(tscOut, 'shared'), distSharedDir);

    // Copy Assets to the same relative locations
    fs.copySync(path.join(rootDir, 'provider/frontend'), path.join(distBackendDir, 'frontend'), {
        filter: (src) => !src.includes('node_modules')
    });
    fs.copySync(path.join(rootDir, 'certs'), path.join(distBackendDir, 'certs'));
    fs.copySync(path.join(rootDir, 'branding'), path.join(distBackendDir, 'branding'));

    const configSrc = path.join(rootDir, 'provider/config.json');
    if (fs.existsSync(configSrc)) {
        fs.copySync(configSrc, path.join(distBackendDir, 'config.json'));
    }

    // pkg 用の package.json 作成
    const backendPkg = fs.readJsonSync(path.join(backendDir, 'package.json'));
    const pkgJson = {
        name: "zenken-agent",
        version: "1.3.2",
        main: "provider/backend/index.js", // Point to the structured path
        bin: "provider/backend/index.js",
        pkg: {
            assets: [
                "provider/backend/frontend/**/*",
                "provider/backend/certs/**/*",
                "provider/backend/branding/**/*",
                "provider/backend/config.json",
                "shared/**/*",
                "node_modules/axios/dist/**/*",
                "node_modules/axios/package.json"
            ],
            scripts: [
                "node_modules/axios/dist/node/axios.cjs"
            ],
            targets: [
                "node18-win-x64",
                "node18-macos-x64",
                "node18-macos-arm64"
            ]
        },
        dependencies: backendPkg.dependencies
    };
    fs.writeJsonSync(path.join(distDir, 'package.json'), pkgJson, { spaces: 2 });

    console.log('\n--- 4. 依存関係のインストール (Installing Dependencies) ---');
    execSync('npm install --omit=dev', { cwd: distDir, stdio: 'inherit' });

    // [FIX] pkg@5.8.1 は axios v1.x の package.json の `exports` 条件付き解決に対応していないため、
    // axios の package.json から `exports` フィールドを削除してCJSの `main` にフォールバックさせる
    console.log('\n--- 4.5. axios パッチ適用 (Patching axios for pkg compatibility) ---');
    const axiosPkgPath = path.join(distDir, 'node_modules/axios/package.json');
    if (fs.existsSync(axiosPkgPath)) {
        const axiosPkg = fs.readJsonSync(axiosPkgPath);
        if (axiosPkg.exports) {
            delete axiosPkg.exports;
            // mainは既存の index.js を維持（これはdist/cjs/axios.jsへのshim）
            console.log('  ✅ axios のexportsフィールドを削除しました (pkgとの互換性確保)');
        }
        // dist/node/axios.cjs がaxios v1.xの真のCJSビルド
        axiosPkg.main = 'dist/node/axios.cjs';
        fs.writeJsonSync(axiosPkgPath, axiosPkg, { spaces: 2 });
        console.log(`  ✅ axios package.json を修正: main="${axiosPkg.main}"`);
    } else {
        console.warn('  ⚠️  axios package.json が見つかりません');
    }

    console.log('\n--- 5. アプリケーション化実行 (Running Pkg) ---');
    let iconArg = "";
    const icoPath = path.join(rootDir, 'provider/src-tauri/icons/icon.ico');
    if (fs.existsSync(icoPath)) {
        console.log(`  🎨 Using icon: ${icoPath}`);
        iconArg = `--icon "${icoPath}"`;
    }

    const targets = pkgJson.pkg.targets.join(',');
    const command = `npx -y pkg@5.8.1 . ${iconArg} --targets ${targets} --out-path "${binDir}" --compress GZip`;
    console.log(`  🚀 Executing: ${command}`);

    try {
        execSync(command, { cwd: distDir, stdio: 'inherit' });
    } catch (e) {
        console.warn('\n  ⚠️  Pkg reported some bytecode failures or issues, attempting to proceed...');
    }

    console.log('\n--- 6. リネームと整理 (Renaming & Zipping) ---');
    const mapping = [
        { src: 'zenken-agent-win-x64.exe', dest: 'ZENKEN_AGENT_v1.3.2.exe', zip: 'ZENKEN_AGENT_v1.3.2.zip' },
        { src: 'zenken-agent-macos-x64', dest: 'ZENKEN_AGENT_v1.3.2_macos_x64', zip: 'ZENKEN_AGENT_v1.3.2_macos_x64.zip' },
        { src: 'zenken-agent-macos-arm64', dest: 'ZENKEN_AGENT_v1.3.2_macos_arm64', zip: 'ZENKEN_AGENT_v1.3.2_macos_arm64.zip' }
    ];

    const releaseDir = path.join(rootDir, 'server/public/downloads');
    fs.ensureDirSync(releaseDir);

    for (const item of mapping) {
        const srcPath = path.join(binDir, item.src);
        const destPath = path.join(binDir, item.dest); // Rename to the versioned name in binDir

        if (fs.existsSync(srcPath)) {
            // Rename the binary in binDir
            if (fs.existsSync(destPath)) fs.removeSync(destPath);
            fs.renameSync(srcPath, destPath);
            console.log(`  ✅ Renamed: ${item.dest}`);

            // Copy to release directory
            const rawReleasePath = path.join(releaseDir, item.dest);
            fs.copySync(destPath, rawReleasePath);
            console.log(`  📄 Copied binary to release: ${rawReleasePath}`);

            // Create ZIP for this binary (Simplified - ZIP contains only the EXE)
            const zipPath = path.join(releaseDir, item.zip);
            try {
                // We use powershell to zip just the file, making it easy for the user to download and run
                const cmd = `powershell -Command "Compress-Archive -Path '${rawReleasePath}' -DestinationPath '${zipPath}' -Force"`;
                execSync(cmd);
                console.log(`  📦 ZIP created: ${item.zip}`);
            } catch (err) {
                console.error(`  ❌ ZIP failed: ${err.message}`);
            }
        }
    }

    console.log('\n🎉 配布準備完了 (Done!)');
}

build().catch(err => {
    console.error('\n❌ Fatal Error:', err);
    process.exit(1);
});
