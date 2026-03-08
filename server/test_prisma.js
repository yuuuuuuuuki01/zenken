const { execSync } = require('child_process');
try {
    const stdout = execSync('npx prisma validate', { encoding: 'utf8' });
    console.log("SUCCESS:", stdout);
} catch (e) {
    console.log("STDOUT:", e.stdout);
    console.log("STDERR:", e.stderr);
    console.log("ERROR:", e.message);
}
