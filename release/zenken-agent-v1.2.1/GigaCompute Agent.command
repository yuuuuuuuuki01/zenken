#!/bin/bash
# ZEN KEN Agent Startup Script for macOS
# Version: v1.2.0

# Get the absolute path of this script folder
SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do
  DIR="$( cd -P "$( dirname "$SOURCE" )" && pwd )"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
DIR="$( cd -P "$( dirname "$SOURCE" )" && pwd )"
cd "$DIR"

echo "=========================================="
echo "  ZEN KEN Agent (macOS)"
echo "  Version: v1.2.0"
echo "=========================================="
echo ""

# Check for Node.js
if command -v node >/dev/null 2>&1; then
    echo "Check: Node.js is already installed."
else
    echo "Warning: Node.js not found."
    echo "Node.js (v18+) is required to run the agent."
    echo ""
    read -p "Would you like to download and install it automatically? [y/N]: " user_input
    
    if [[ ! "$user_input" =~ ^[Yy]$ ]]; then
        echo "Installation cancelled."
        echo "Please install manually from https://nodejs.org/"
        exit 1
    fi
    
    echo ""
    echo "[1/2] Downloading Node.js package..."
    PKG_PATH="/tmp/node-installer.pkg"
    curl -sL "https://nodejs.org/dist/v20.11.1/node-v20.11.1.pkg" -o "$PKG_PATH"
    
    if [ ! -f "$PKG_PATH" ]; then
        echo "Error: Download failed."
        exit 1
    fi
    
    echo "[2/2] Installing Node.js... (Admin password may be required)"
    sudo installer -pkg "$PKG_PATH" -target /
    rm "$PKG_PATH"
    
    echo ""
    echo "OK: Node.js setup complete!"
    echo ""
fi

# Install dependencies
echo "Status: Preparing dependencies..."
npm install --omit=dev --silent

# Start agent
echo "Launch: Starting ZEN KEN Agent..."
node provider/backend/index.js
if [ $? -ne 0 ]; then
    echo ""
    echo "Error: Agent exited with an error."
    read -p "Press any key to close..." -n1 -s
fi