const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');

const zipPath = 'c:/agent/gigacompute/server/public/downloads/zen-agent.zip';
if (!fs.existsSync(zipPath)) {
    console.error('File not found:', zipPath);
} else {
    const zip = new AdmZip(zipPath);
    const zipEntries = zip.getEntries();
    console.log('Entries in zen-agent.zip:');
    zipEntries.forEach(entry => {
        console.log(` - ${entry.entryName} (${entry.header.size} bytes)`);
    });
}
