const { execSync } = require('child_process');
const path = require('path');

const serverDir = path.resolve(__dirname, '..');

console.log('[InitDB] Synchronizing schema with Prisma...');

try {
    // 1. Generate client
    console.log('[InitDB] Generating Prisma client...');
    execSync('npx prisma generate', { cwd: serverDir, stdio: 'inherit' });

    // 2. Push schema to DB
    console.log('[InitDB] Pushing schema to SQLite...');
    execSync('npx prisma db push --accept-data-loss --skip-generate', { cwd: serverDir, stdio: 'inherit' });

    console.log('[InitDB] Database is ready!');
} catch (e) {
    console.error('[InitDB] Failed to initialize database:', e.message);
    process.exit(1);
}
