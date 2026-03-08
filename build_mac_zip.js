const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

const releaseDir = 'C:/agent/gigacompute/release/gigacompute-agent';
const outZip = 'C:/agent/gigacompute/demander/frontend/agent-mac.zip';

// .command file content (double-clickable on macOS)
const commandScript = `#!/bin/bash
cd "$(dirname "$0")"
echo "=========================================="
echo "  GigaCompute Agent (macOS)"
echo "=========================================="
echo ""

ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    echo "✅ Apple Silicon (ARM64) を検出しました"
    chmod +x ./gigacompute-agent-macos-arm64
    ./gigacompute-agent-macos-arm64
else
    echo "✅ Intel (x64) を検出しました"
    chmod +x ./gigacompute-agent-macos-x64
    ./gigacompute-agent-macos-x64
fi
`;

const zip = new AdmZip();

// Add launcher as .command (macOS double-click friendly)
const entry = zip.addFile('GigaCompute Agent.command', Buffer.from(commandScript, 'utf-8'));

// Add binaries
zip.addLocalFile(path.join(releaseDir, 'bin/gigacompute-agent-macos-arm64'));
zip.addLocalFile(path.join(releaseDir, 'bin/gigacompute-agent-macos-x64'));

// Add config & readme
zip.addLocalFile(path.join(releaseDir, 'config.json'));
zip.addLocalFile(path.join(releaseDir, 'README.md'));

// Add provider directory
zip.addLocalFolder(path.join(releaseDir, 'provider'), 'provider');

// Add shared directory
zip.addLocalFolder(path.join(releaseDir, 'shared'), 'shared');

// Set Unix executable permissions (0755) on binaries and .command
zip.getEntries().forEach(e => {
    const name = e.entryName;
    if (name.endsWith('.command') || name.includes('gigacompute-agent-macos')) {
        // Set external attributes: Unix permissions 0755 in high 16 bits
        e.header.attr = (0o755 << 16) >>> 0;
    }
});

zip.writeZip(outZip);
const sizeMB = (fs.statSync(outZip).size / 1024 / 1024).toFixed(1);
console.log('MAC ZIP created:', sizeMB, 'MB');
