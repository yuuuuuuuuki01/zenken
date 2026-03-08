#!/bin/bash
echo "=========================================="
echo "  ZEN KEN - Installer (macOS)"
echo "  Version: v1.2.0"
echo "=========================================="
echo ""

# Determine OS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "Error: This installer is for macOS only."
    exit 1
fi

# Define paths
VERSION="v1.2.0"
INSTALL_ROOT="/Applications/ZEN KEN"
VERSIONED_DIR="$INSTALL_ROOT/zenken-agent-$VERSION"
APP_BUNDLE="/Applications/ZEN KEN.app"
ZIP_URL="https://${HTTP_HOST:-gigacompute-fleet.web.app}/agent-mac.zip"
TMP_ZIP="/tmp/agent-mac.zip"

echo "Installer Target: $VERSIONED_DIR"

# Cleanup old versions
if [ -d "$APP_BUNDLE" ]; then sudo rm -rf "$APP_BUNDLE"; fi
if [ -d "$INSTALL_ROOT" ]; then sudo rm -rf "$INSTALL_ROOT"; fi

# Create directories
sudo mkdir -p "$INSTALL_ROOT"
sudo chown $USER "$INSTALL_ROOT"

echo "Downloading ZEN KEN Agent ($VERSION)..."
curl -sL "$ZIP_URL" -o "$TMP_ZIP"

if [ ! -f "$TMP_ZIP" ]; then
    echo "Error: Download failed."
    exit 1
fi

echo "Extracting package..."
unzip -q -o "$TMP_ZIP" -d "$INSTALL_ROOT"
rm "$TMP_ZIP"

# Set permissions
chmod -R 755 "$INSTALL_ROOT"

echo "Creating macOS App Bundle..."
mkdir -p "$APP_BUNDLE/Contents/MacOS"
mkdir -p "$APP_BUNDLE/Contents/Resources"

# Create Info.plist
cat <<EOF > "$APP_BUNDLE/Contents/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>ZEN KEN</string>
    <key>CFBundleIdentifier</key>
    <string>jp.zenken.agent</string>
    <key>CFBundleName</key>
    <string>ZEN KEN</string>
    <key>CFBundleVersion</key>
    <string>$VERSION</string>
    <key>CFBundleShortVersionString</key>
    <string>$VERSION</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.15</string>
</dict>
</plist>
EOF

# Create wrapper script
cat <<EOF > "$APP_BUNDLE/Contents/MacOS/ZEN KEN"
#!/bin/bash
# MacOS app wrapper for version $VERSION
open -a Terminal "$VERSIONED_DIR/GigaCompute Agent.command"
EOF

chmod +x "$APP_BUNDLE/Contents/MacOS/ZEN KEN"

# Icon download
ICON_URL="https://${HTTP_HOST:-unable-height-polished-old.trycloudflare.com}/AppIcon.icns"
curl -sL "$ICON_URL" -o "$APP_BUNDLE/Contents/Resources/AppIcon.icns"

touch "$APP_BUNDLE"

echo ""
echo "Installation complete!"
echo "Please open 'ZEN KEN' from your Applications folder."
echo ""