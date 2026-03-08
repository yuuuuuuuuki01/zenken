const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const agentBackendDir = path.join(rootDir, 'provider/backend');
const buildDir = path.join(rootDir, 'dist/package_agent');

async function packageAgent() {
    console.log('[Packager] Preparing flat build structure...');

    // 1. Clean and create build directory
    if (fs.existsSync(buildDir)) {
        try {
            fs.removeSync(buildDir);
        } catch (e) {
            console.warn('[Packager] Warning: Could not remove old build dir, cleaning contents instead...');
            fs.emptyDirSync(buildDir);
        }
    }
    fs.ensureDirSync(buildDir);

    // 2. Build TypeScript
    console.log('[Packager] Compiling TypeScript...');
    const tscBin = path.join(rootDir, 'node_modules/.bin/tsc');
    try {
        // Run tsc in the backend dir
        execSync(`npx tsc`, { cwd: agentBackendDir, stdio: 'inherit' });
    } catch (e) {
        console.warn('[Packager] tsc reported errors or warnings, but will attempt to proceed if build dir is ready.');
    }

    // 3. Copy compiled JS (Flattening)
    const tscOutDir = path.join(agentBackendDir, 'dist/provider/backend');
    const sharedOutDir = path.join(agentBackendDir, 'dist/shared');

    console.log(`[Packager] Copying JS from ${tscOutDir} to ${buildDir}`);
    fs.copySync(tscOutDir, buildDir);
    fs.copySync(sharedOutDir, path.join(buildDir, 'shared'));

    // 4. Copy Assets
    console.log('[Packager] Copying assets...');
    fs.copySync(path.join(rootDir, 'provider/frontend'), path.join(buildDir, 'frontend'));
    fs.copySync(path.join(rootDir, 'certs'), path.join(buildDir, 'certs'));

    const configPath = path.join(rootDir, 'provider/config.json');
    if (fs.existsSync(configPath)) {
        fs.copySync(configPath, path.join(buildDir, 'config.json'));
    } else {
        fs.writeFileSync(path.join(buildDir, 'config.json'), JSON.stringify({ serverUrl: 'wss://localhost:8081' }, null, 2));
    }

    // Read provider backend package.json to grab dependencies
    const backendPkgPath = path.join(agentBackendDir, 'package.json');
    let dependencies = {};
    if (fs.existsSync(backendPkgPath)) {
        const backendPkg = JSON.parse(fs.readFileSync(backendPkgPath, 'utf8'));
        dependencies = backendPkg.dependencies || {};
    }

    // 5. Create a comprehensive package.json for pkg
    const pkgJson = {
        name: "gigacompute-agent",
        version: "1.0.0",
        main: "index.js",
        bin: "index.js",
        dependencies: dependencies,
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

    // 6. Install dependencies freshly inside buildDir
    console.log('[Packager] Installing dependencies in flat structure...');
    execSync(`npm install --omit=dev`, { cwd: buildDir, stdio: 'inherit' });

    // 7. Run pkg
    console.log('[Packager] Running pkg on flat structure...');
    const outBinDir = path.join(rootDir, 'dist/bin');
    fs.ensureDirSync(outBinDir);

    // We use npx pkg on the buildDir
    const targets = pkgJson.pkg.targets.join(',');
    execSync(`npx -y pkg@5.8.1 . --targets ${targets} --out-path ${outBinDir}`, { cwd: buildDir, stdio: 'inherit' });

    // 8. Rename executable for clarity (Windows)
    const winExe = path.join(outBinDir, 'gigacompute-agent-win-x64.exe');
    if (fs.existsSync(winExe)) {
        fs.renameSync(winExe, path.join(outBinDir, 'START_GIGACOMPUTE.exe'));
        console.log('[Packager] Renamed Windows binary to START_GIGACOMPUTE.exe');
    }

    console.log('[Packager] Done! Binaries are in dist/bin');
}

packageAgent().catch(err => {
    console.error('[Packager] Failed:', err);
    process.exit(1);
});
