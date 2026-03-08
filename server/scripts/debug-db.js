const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const serverDir = path.resolve(__dirname, '..');
const logFile = path.join(serverDir, 'prisma-debug.log');

function log(msg) {
    console.log(msg);
    fs.appendFileSync(logFile, msg + '\n');
}

if (fs.existsSync(logFile)) fs.unlinkSync(logFile);

log('[DebugDB] Starting Prisma sync...');

try {
    log('[DebugDB] Running Prisma generate...');
    const genOut = execSync('npx prisma generate', { cwd: serverDir, encoding: 'utf8' });
    log(genOut);

    log('[DebugDB] Running Prisma db push...');
    const pushOut = execSync('npx prisma db push --accept-data-loss --skip-generate', { cwd: serverDir, encoding: 'utf8' });
    log(pushOut);

    log('[DebugDB] Database is ready!');
} catch (e) {
    log('[DebugDB] ERROR: ' + e.message);
    if (e.stdout) log('[DebugDB] STDOUT: ' + e.stdout);
    if (e.stderr) log('[DebugDB] STDERR: ' + e.stderr);
    process.exit(1);
}
