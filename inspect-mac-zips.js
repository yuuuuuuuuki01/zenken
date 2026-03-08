const AdmZip = require('adm-zip');
const fs = require('fs');

const files = [
    'c:/agent/gigacompute/server/public/downloads/zen-agent-mac-x64.zip',
    'c:/agent/gigacompute/server/public/downloads/zen-agent-mac-arm64.zip'
];

files.forEach(zipPath => {
    if (!fs.existsSync(zipPath)) {
        console.error('File not found:', zipPath);
    } else {
        const zip = new AdmZip(zipPath);
        const zipEntries = zip.getEntries();
        console.log(`Entries in ${zipPath}:`);
        zipEntries.forEach(entry => {
            console.log(` - ${entry.entryName} (${entry.header.size} bytes)`);
        });
    }
});
