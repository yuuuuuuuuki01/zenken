const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

const VERSION = 'v1.2.1';
const releaseDir = `C:/agent/gigacompute/release/zenken-agent-${VERSION}`;
const winZipPath = 'C:/agent/gigacompute/server/public/agent.zip';
const macZipPath = 'C:/agent/gigacompute/server/public/agent-mac.zip';

const folderInZip = `zenken-agent-${VERSION}`;

// Create Windows ZIP
const winZip = new AdmZip();
winZip.addLocalFile(path.join(releaseDir, 'start.bat'), folderInZip);
winZip.addLocalFile(path.join(releaseDir, 'setup.bat'), folderInZip);
winZip.addLocalFile(path.join(releaseDir, 'config.json'), folderInZip);
winZip.addLocalFile(path.join(releaseDir, 'README.md'), folderInZip);
winZip.addLocalFile(path.join(releaseDir, 'package.json'), folderInZip);
winZip.addLocalFolder(path.join(releaseDir, 'provider'), `${folderInZip}/provider`);
winZip.addLocalFolder(path.join(releaseDir, 'shared'), `${folderInZip}/shared`);
winZip.addLocalFolder('C:/agent/gigacompute/certs', `${folderInZip}/certs`);
winZip.addLocalFolder('C:/agent/gigacompute/branding', `${folderInZip}/branding`);
winZip.writeZip(winZipPath);
console.log('WIN ZIP created:', (fs.statSync(winZipPath).size / 1024 / 1024).toFixed(2), 'MB');

// Create Mac ZIP
const macZip = new AdmZip();
const commandFile = path.join(releaseDir, 'GigaCompute Agent.command');
const commandContent = fs.readFileSync(commandFile, 'utf8').replace(/\r\n/g, '\n');
macZip.addFile(`${folderInZip}/GigaCompute Agent.command`, Buffer.from(commandContent, 'utf8'));

macZip.addLocalFile(path.join(releaseDir, 'config.json'), folderInZip);
macZip.addLocalFile(path.join(releaseDir, 'README.md'), folderInZip);
macZip.addLocalFile(path.join(releaseDir, 'package.json'), folderInZip);
macZip.addLocalFolder(path.join(releaseDir, 'provider'), `${folderInZip}/provider`);
macZip.addLocalFolder(path.join(releaseDir, 'shared'), `${folderInZip}/shared`);
macZip.addLocalFolder('C:/agent/gigacompute/certs', `${folderInZip}/certs`);
macZip.addLocalFolder('C:/agent/gigacompute/branding', `${folderInZip}/branding`);

// Set permissions for Mac
macZip.getEntries().forEach(e => {
    if (e.entryName.endsWith('.command')) {
        e.header.attr = (0o100755 << 16) >>> 0;
    }
});

macZip.writeZip(macZipPath);
console.log('MAC ZIP created:', (fs.statSync(macZipPath).size / 1024 / 1024).toFixed(2), 'MB');
