const { execSync } = require('child_process');

const env = {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/zenken_test'
};

try {
    const stdout = execSync('npx prisma validate', { encoding: 'utf8', env });
    console.log("SUCCESS:", stdout);
} catch (e) {
    console.log("STDOUT:", e.stdout);
    console.log("STDERR:", e.stderr);
    console.log("ERROR:", e.message);
}
