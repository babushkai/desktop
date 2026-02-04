#!/bin/bash
# notarize-macos.sh - Notarize macOS app bundle with Apple
#
# Submits the app bundle to Apple for notarization and staples
# the ticket upon success.
#
# Usage:
#   ./scripts/notarize-macos.sh /path/to/MLOps.app
#
# Environment variables (all required):
#   APPLE_ID           - Apple Developer account email
#   APPLE_TEAM_ID      - Team ID from Apple Developer account
#   APPLE_APP_PASSWORD - App-specific password for notarization

set -euo pipefail

APPLE_ID="${APPLE_ID:?'APPLE_ID environment variable required'}"
APPLE_TEAM_ID="${APPLE_TEAM_ID:?'APPLE_TEAM_ID environment variable required'}"
APPLE_APP_PASSWORD="${APPLE_APP_PASSWORD:?'APPLE_APP_PASSWORD environment variable required'}"
APP_BUNDLE="${1:?'Usage: notarize-macos.sh <app_bundle_path>'}"

if [[ ! -d "$APP_BUNDLE" ]]; then
    echo "ERROR: App bundle does not exist: $APP_BUNDLE" >&2
    exit 1
fi

# Get app name for temp file
APP_NAME=$(basename "$APP_BUNDLE" .app)
TEMP_DIR=$(mktemp -d)
ZIP_FILE="$TEMP_DIR/${APP_NAME}.zip"

trap "rm -rf '$TEMP_DIR'" EXIT

echo "=== Notarizing $APP_NAME ==="
echo "Bundle:  $APP_BUNDLE"
echo "Team ID: $APPLE_TEAM_ID"
echo ""

# Create zip for notarization
echo "=== Creating archive ==="
ditto -c -k --keepParent "$APP_BUNDLE" "$ZIP_FILE"
echo "Archive: $ZIP_FILE ($(du -h "$ZIP_FILE" | cut -f1))"

# Submit for notarization
echo ""
echo "=== Submitting to Apple ==="
echo "This may take several minutes..."

xcrun notarytool submit "$ZIP_FILE" \
    --apple-id "$APPLE_ID" \
    --team-id "$APPLE_TEAM_ID" \
    --password "$APPLE_APP_PASSWORD" \
    --wait

# Staple the ticket
echo ""
echo "=== Stapling ticket ==="
xcrun stapler staple "$APP_BUNDLE"

# Verify
echo ""
echo "=== Verifying ==="
spctl --assess --verbose "$APP_BUNDLE"

echo ""
echo "=== Notarization complete ==="
echo "App is ready for distribution: $APP_BUNDLE"
