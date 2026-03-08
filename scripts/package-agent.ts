import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const agentBackendDir = path.join(rootDir, 'provider/backend');
const buildDir = path.join(rootDir, 'dist/package_agent');

async function packageAgent() {
    console.log('[Packager] Preparing flat build structure...');

    // 1. Clean and create build directory
    if (fs.existsSync(buildDir)) fs.removeSync(buildDir);
    fs.ensureDirSync(buildDir);

    // 2. Build TypeScript
    console.log('[Packager] Compiling TypeScript...');
    execSync('npm run build', { cwd: agentBackendDir, stdio: 'inherit' });

    // 3. Copy compiled JS (Flattening)
    // tsc output is in agentBackendDir/dist/provider/backend/index.js etc.
    const tscOutDir = path.join(agentBackendDir, 'dist/provider/backend');
    const sharedOutDir = path.join(agentBackendDir, 'dist/shared');

    fs.copySync(tscOutDir, buildDir);
    fs.copySync(sharedOutDir, path.join(buildDir, 'shared'));

    // 4. Copy Assets
    console.log('[Packager] Copying assets...');
    fs.copySync(path.join(rootDir, 'provider/frontend'), path.join(buildDir, 'frontend'));
    fs.copySync(path.join(rootDir, 'certs'), path.join(buildDir, 'certs'));

    // Create a default config.json if not exists in source
    const configPath = path.join(rootDir, 'provider/config.json');
    if (fs.existsSync(configPath)) {
        fs.copySync(configPath, path.join(buildDir, 'config.json'));
    } else {
        fs.writeFileSync(path.join(buildDir, 'config.json'), JSON.stringify({ serverUrl: 'wss://localhost:8081' }, null, 2));
    }

    // 5. Create a minimal package.json for pkg
    const pkgJson = {
        name: "gigacompute-agent",
        version: "1.0.0",
        main: "index.js",
        bin: "index.js",
        dependencies: {
            "ws": "^8.13.0",
            "crypto-js": "^4.1.1",
            "fs-extra": "^11.1.0",
            "node-forge": "^1.3.1",
            "adm-zip": "^0.5.10",
            "http-proxy": "^1.18.1"
        },
        pkg: {
            assets: [
                "frontend/**/*",
                "certs/**/*",
                "config.json"
            ],
            targets: [
                "node18-win-x64"
            ]
        }
    };
    fs.writeFileSync(path.join(buildDir, 'package.json'), JSON.stringify(pkgJson, null, 2));

    // 5.5 Install dependencies in build directory
    console.log('[Packager] Installing dependencies in build directory...');
    execSync('npm install --production', { cwd: buildDir, stdio: 'inherit' });

    // 6. Run pkg
    console.log('[Packager] Running pkg on flat structure...');
    const outBinDir = path.join(rootDir, 'dist/bin');
    fs.ensureDirSync(outBinDir);

    const targets = pkgJson.pkg.targets.join(',');
    execSync(`npx pkg . --targets ${targets} --out-path ${outBinDir}`, { cwd: buildDir, stdio: 'inherit' });

    console.log('[Packager] Done! Binaries are in dist/bin');
}

packageAgent().catch(err => {
    console.error('[Packager] Failed:', err);
    process.exit(1);
});
