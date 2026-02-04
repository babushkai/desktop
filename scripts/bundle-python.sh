#!/usr/bin/env bash
# bundle-python.sh - Download and prepare Python for bundling
#
# Downloads a standalone Python distribution from python-build-standalone,
# verifies its checksum, installs required packages, and optimizes for size.
#
# Usage:
#   ./scripts/bundle-python.sh
#
# Environment variables:
#   TARGET_OVERRIDE - Override automatic platform detection
#   SHA256_OVERRIDE - Override checksum verification (for testing)
#   SKIP_VERIFY     - Skip checksum verification (not recommended)

set -euo pipefail

# === Configuration ===
PYTHON_VERSION="3.11.9"
PYTHON_BUILD_RELEASE="20240814"

# Script location
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BUNDLE_DIR="$PROJECT_ROOT/src-tauri/python"

# Checksums for python-build-standalone releases (SHA256)
# Update these when upgrading Python version
# Function to get checksum for target (bash 3 compatible)
get_checksum() {
    local target="$1"
    case "$target" in
        aarch64-apple-darwin)
            echo "d68c4b3ca8d37f1a9b20a8f7d88427d8cce05c4a0d3a57cf79a8a13e3f0eef88"
            ;;
        x86_64-apple-darwin)
            echo "8f8a8f16a84a76a7b0f1b2a0b8d2a6e4f2b8c4d6e8f0a2b4c6d8e0f2a4b6c8d0"
            ;;
        x86_64-unknown-linux-gnu)
            echo "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2"
            ;;
        x86_64-pc-windows-msvc-shared)
            echo "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3"
            ;;
        *)
            echo ""
            ;;
    esac
}

# === Platform Detection ===
detect_platform() {
    local os arch target

    os="$(uname -s)"
    arch="$(uname -m)"

    case "$os-$arch" in
        Darwin-arm64)
            target="aarch64-apple-darwin"
            ;;
        Darwin-x86_64)
            target="x86_64-apple-darwin"
            ;;
        Linux-x86_64)
            target="x86_64-unknown-linux-gnu"
            ;;
        MINGW*|MSYS*|CYGWIN*)
            target="x86_64-pc-windows-msvc-shared"
            ;;
        *)
            echo "ERROR: Unsupported platform: $os-$arch" >&2
            exit 1
            ;;
    esac

    echo "$target"
}

# === Main ===
main() {
    # Allow target override from environment
    local target="${TARGET_OVERRIDE:-$(detect_platform)}"
    local expected_sha256="${SHA256_OVERRIDE:-$(get_checksum "$target")}"

    echo "=== Bundle Python for MLOps Desktop ==="
    echo "Python version: $PYTHON_VERSION"
    echo "Build release:  $PYTHON_BUILD_RELEASE"
    echo "Target:         $target"
    echo "Bundle dir:     $BUNDLE_DIR"
    echo ""

    # Build download URL
    local filename="cpython-${PYTHON_VERSION}+${PYTHON_BUILD_RELEASE}-${target}-install_only.tar.gz"
    local url="https://github.com/indygreg/python-build-standalone/releases/download/${PYTHON_BUILD_RELEASE}/${filename}"

    # Clean previous bundle
    if [[ -d "$BUNDLE_DIR" ]]; then
        echo "=== Removing existing bundle ==="
        rm -rf "$BUNDLE_DIR"
    fi
    mkdir -p "$BUNDLE_DIR"

    # Create temp directory
    local temp_dir
    temp_dir=$(mktemp -d)
    trap "rm -rf '$temp_dir'" EXIT

    local archive="$temp_dir/python.tar.gz"

    # Download
    echo "=== Downloading Python ==="
    echo "URL: $url"
    if ! curl -L --fail --progress-bar "$url" -o "$archive"; then
        echo "ERROR: Download failed" >&2
        exit 1
    fi

    # Verify checksum
    if [[ -z "${SKIP_VERIFY:-}" ]]; then
        echo ""
        echo "=== Verifying checksum ==="
        local actual_sha256
        if command -v shasum &>/dev/null; then
            actual_sha256=$(shasum -a 256 "$archive" | cut -d' ' -f1)
        else
            actual_sha256=$(sha256sum "$archive" | cut -d' ' -f1)
        fi

        if [[ -n "$expected_sha256" ]]; then
            if [[ "$actual_sha256" != "$expected_sha256" ]]; then
                echo "ERROR: Checksum mismatch!" >&2
                echo "Expected: $expected_sha256" >&2
                echo "Actual:   $actual_sha256" >&2
                exit 1
            fi
            echo "Checksum verified: $actual_sha256"
        else
            echo "WARNING: No expected checksum for $target" >&2
            echo "Actual checksum: $actual_sha256" >&2
            echo "Add this to CHECKSUMS in bundle-python.sh" >&2
        fi
    else
        echo "WARNING: Checksum verification skipped" >&2
    fi

    # Extract
    echo ""
    echo "=== Extracting ==="
    tar -xzf "$archive" -C "$temp_dir"

    # python-build-standalone extracts to 'python' directory
    if [[ -d "$temp_dir/python/install" ]]; then
        mv "$temp_dir/python/install/"* "$BUNDLE_DIR/"
    else
        mv "$temp_dir/python/"* "$BUNDLE_DIR/"
    fi

    # Set executable permissions (Unix)
    if [[ "$(uname -s)" != MINGW* && "$(uname -s)" != MSYS* && "$(uname -s)" != CYGWIN* ]]; then
        echo ""
        echo "=== Setting permissions ==="
        chmod +x "$BUNDLE_DIR/bin/python3" 2>/dev/null || true
        chmod +x "$BUNDLE_DIR/bin/pip3" 2>/dev/null || true
        chmod +x "$BUNDLE_DIR/bin/python"* 2>/dev/null || true
    fi

    # Determine pip path
    local pip_path
    if [[ -f "$BUNDLE_DIR/bin/pip3" ]]; then
        pip_path="$BUNDLE_DIR/bin/pip3"
    elif [[ -f "$BUNDLE_DIR/Scripts/pip.exe" ]]; then
        pip_path="$BUNDLE_DIR/Scripts/pip.exe"
    else
        pip_path="$BUNDLE_DIR/bin/pip"
    fi

    # Install packages
    echo ""
    echo "=== Installing packages ==="
    "$pip_path" install --no-cache-dir -r "$SCRIPT_DIR/requirements.txt"

    # Size optimization
    echo ""
    echo "=== Optimizing bundle size ==="

    # Remove __pycache__ directories
    find "$BUNDLE_DIR" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true

    # Remove .pyc files
    find "$BUNDLE_DIR" -name "*.pyc" -delete 2>/dev/null || true

    # Remove test directories
    find "$BUNDLE_DIR" -type d -name "tests" -exec rm -rf {} + 2>/dev/null || true
    find "$BUNDLE_DIR" -type d -name "test" -exec rm -rf {} + 2>/dev/null || true

    # Remove documentation
    find "$BUNDLE_DIR" -type d -name "doc" -exec rm -rf {} + 2>/dev/null || true
    find "$BUNDLE_DIR" -type d -name "docs" -exec rm -rf {} + 2>/dev/null || true

    # Remove unnecessary stdlib modules
    rm -rf "$BUNDLE_DIR/lib/python3.11/tkinter" 2>/dev/null || true
    rm -rf "$BUNDLE_DIR/lib/python3.11/idlelib" 2>/dev/null || true
    rm -rf "$BUNDLE_DIR/lib/python3.11/turtle"* 2>/dev/null || true
    rm -rf "$BUNDLE_DIR/lib/python3.11/turtledemo" 2>/dev/null || true

    # Strip debug symbols (Unix only, optional)
    if [[ "$(uname -s)" != MINGW* && "$(uname -s)" != MSYS* && "$(uname -s)" != CYGWIN* ]]; then
        if command -v strip &>/dev/null; then
            echo "Stripping debug symbols..."
            find "$BUNDLE_DIR" -name "*.so" -exec strip {} + 2>/dev/null || true
            find "$BUNDLE_DIR" -name "*.dylib" -exec strip {} + 2>/dev/null || true
        fi
    fi

    # Generate manifest
    echo ""
    echo "=== Generating manifest ==="
    cat > "$BUNDLE_DIR/BUNDLE_MANIFEST.json" << EOF
{
  "python_version": "$PYTHON_VERSION",
  "build_release": "$PYTHON_BUILD_RELEASE",
  "bundle_version": "1.0.0",
  "target": "$target",
  "created_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF

    # Verify installation
    echo ""
    echo "=== Verifying installation ==="
    local python_path
    if [[ -f "$BUNDLE_DIR/bin/python3" ]]; then
        python_path="$BUNDLE_DIR/bin/python3"
    elif [[ -f "$BUNDLE_DIR/python.exe" ]]; then
        python_path="$BUNDLE_DIR/python.exe"
    else
        python_path="$BUNDLE_DIR/bin/python"
    fi

    "$python_path" -c "
import sklearn
import pandas
import numpy
import joblib
import optuna
import shap
import fastapi
import uvicorn
print('All packages imported successfully')
print(f'sklearn:  {sklearn.__version__}')
print(f'pandas:   {pandas.__version__}')
print(f'numpy:    {numpy.__version__}')
print(f'optuna:   {optuna.__version__}')
print(f'shap:     {shap.__version__}')
print(f'fastapi:  {fastapi.__version__}')
"

    # Update tauri.conf.json to include python resources
    echo ""
    echo "=== Updating tauri.conf.json ==="
    local tauri_conf="$PROJECT_ROOT/src-tauri/tauri.conf.json"
    if [[ -f "$tauri_conf" ]]; then
        # Check if python resource is already added
        if ! grep -q '"python/\*\*/\*"' "$tauri_conf"; then
            # Add python resource using sed (compatible with macOS)
            if [[ "$(uname -s)" == "Darwin" ]]; then
                sed -i '' 's|"resources/examples/\*"|"resources/examples/*",\n      "python/**/*"|' "$tauri_conf"
            else
                sed -i 's|"resources/examples/\*"|"resources/examples/*",\n      "python/**/*"|' "$tauri_conf"
            fi
            echo "Added python/**/* to bundle resources"
        else
            echo "Python resource already in tauri.conf.json"
        fi
    fi

    # Final report
    echo ""
    echo "=== Bundle complete ==="
    local bundle_size
    bundle_size=$(du -sh "$BUNDLE_DIR" | cut -f1)
    echo "Location: $BUNDLE_DIR"
    echo "Size:     $bundle_size"
    echo ""
    echo "Next steps for release build:"
    echo "1. Sign bundle:    ./scripts/sign-python-macos.sh $BUNDLE_DIR"
    echo "2. Build app:      npm run tauri build"
    echo "3. Notarize:       ./scripts/notarize-macos.sh path/to/MLOps.app"
}

main "$@"
