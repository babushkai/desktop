#!/bin/bash
# sign-python-macos.sh - Sign bundled Python for macOS Gatekeeper
#
# Signs all executables, dylibs, and .so files in the Python bundle
# with the Apple Developer ID certificate.
#
# Usage:
#   APPLE_SIGNING_IDENTITY="Developer ID Application: ..." ./scripts/sign-python-macos.sh src-tauri/python
#
# Environment variables:
#   APPLE_SIGNING_IDENTITY - Required. The signing identity (certificate name or hash)

set -euo pipefail

SIGNING_IDENTITY="${APPLE_SIGNING_IDENTITY:?'APPLE_SIGNING_IDENTITY environment variable required'}"
BUNDLE_PATH="${1:?'Usage: sign-python-macos.sh <bundle_path>'}"

if [[ ! -d "$BUNDLE_PATH" ]]; then
    echo "ERROR: Bundle path does not exist: $BUNDLE_PATH" >&2
    exit 1
fi

echo "=== Signing Python bundle ==="
echo "Bundle:   $BUNDLE_PATH"
echo "Identity: ${SIGNING_IDENTITY:0:30}..."
echo ""

# Counter for signed files
signed_count=0

# Sign executables in bin/
echo "=== Signing executables ==="
while IFS= read -r -d '' exe; do
    echo "Signing: $exe"
    codesign --force --options runtime --sign "$SIGNING_IDENTITY" "$exe"
    ((signed_count++))
done < <(find "$BUNDLE_PATH/bin" -type f -perm +111 -print0 2>/dev/null || true)

# Sign dylibs
echo ""
echo "=== Signing dylibs ==="
while IFS= read -r -d '' lib; do
    echo "Signing: $lib"
    codesign --force --options runtime --sign "$SIGNING_IDENTITY" "$lib"
    ((signed_count++))
done < <(find "$BUNDLE_PATH" -name "*.dylib" -print0 2>/dev/null || true)

# Sign .so files (Python extensions)
echo ""
echo "=== Signing .so extensions ==="
while IFS= read -r -d '' lib; do
    echo "Signing: $lib"
    codesign --force --options runtime --sign "$SIGNING_IDENTITY" "$lib"
    ((signed_count++))
done < <(find "$BUNDLE_PATH" -name "*.so" -print0 2>/dev/null || true)

# Verify signatures
echo ""
echo "=== Verifying signatures ==="
python_bin="$BUNDLE_PATH/bin/python3"
if [[ -f "$python_bin" ]]; then
    codesign --verify --deep --strict "$python_bin"
    echo "Verification passed: $python_bin"
else
    echo "WARNING: Could not find python3 binary for verification"
fi

echo ""
echo "=== Signing complete ==="
echo "Signed $signed_count files"
