use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;
use thiserror::Error;

use crate::db;

/// Information about the detected Python installation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PythonInfo {
    /// Path to the Python executable
    pub path: PathBuf,
    /// Python version string (e.g., "3.11.9")
    pub version: String,
    /// Whether this is the bundled Python (vs system Python)
    pub is_bundled: bool,
}

/// Errors that can occur when verifying the bundled Python
#[derive(Debug, Error)]
pub enum PythonBundleError {
    #[error("Bundle corrupted: {0}")]
    Corrupted(String),
    #[error("Python binary missing")]
    BinaryMissing,
    #[error("Python not executable")]
    NotExecutable,
    #[error("Import verification failed: {0}")]
    ImportFailed(String),
    #[error("Manifest missing or invalid")]
    ManifestInvalid,
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

/// Verify the bundled Python installation is intact and functional
pub fn verify_bundled_python(bundle_path: &PathBuf) -> Result<(), PythonBundleError> {
    let manifest_path = bundle_path.join("BUNDLE_MANIFEST.json");

    // 1. Check manifest exists
    if !manifest_path.exists() {
        return Err(PythonBundleError::ManifestInvalid);
    }

    // 2. Check python binary exists
    #[cfg(unix)]
    let python_bin = bundle_path.join("bin/python3");
    #[cfg(windows)]
    let python_bin = bundle_path.join("python.exe");

    if !python_bin.exists() {
        return Err(PythonBundleError::BinaryMissing);
    }

    // 3. Check executable permissions (Unix)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::metadata(&python_bin)
            .map_err(|_| PythonBundleError::BinaryMissing)?
            .permissions();
        if perms.mode() & 0o111 == 0 {
            return Err(PythonBundleError::NotExecutable);
        }
    }

    // 4. Verify critical imports work
    let output = Command::new(&python_bin)
        .args([
            "-c",
            "import sklearn, pandas, numpy, joblib, optuna, shap, fastapi; print('BUNDLE_OK')",
        ])
        .output()
        .map_err(|e| PythonBundleError::ImportFailed(e.to_string()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(PythonBundleError::ImportFailed(stderr.to_string()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    if !stdout.contains("BUNDLE_OK") {
        return Err(PythonBundleError::ImportFailed(
            "Unexpected output".to_string(),
        ));
    }

    // 5. Check critical files exist
    #[cfg(unix)]
    let site_packages = bundle_path.join("lib/python3.11/site-packages");
    #[cfg(windows)]
    let site_packages = bundle_path.join("Lib/site-packages");

    let critical_packages = ["sklearn", "pandas", "numpy"];
    for pkg in critical_packages {
        let pkg_init = site_packages.join(pkg).join("__init__.py");
        if !pkg_init.exists() {
            return Err(PythonBundleError::Corrupted(format!(
                "Missing package: {}",
                pkg
            )));
        }
    }

    // 6. Verify architecture matches (prevents wrong bundle on disk migration)
    let manifest_content = std::fs::read_to_string(&manifest_path)?;
    if let Ok(manifest) = serde_json::from_str::<serde_json::Value>(&manifest_content) {
        if let Some(target) = manifest.get("target").and_then(|t| t.as_str()) {
            #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
            const EXPECTED_ARCH: &str = "aarch64-apple-darwin";
            #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
            const EXPECTED_ARCH: &str = "x86_64-apple-darwin";
            #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
            const EXPECTED_ARCH: &str = "x86_64-unknown-linux-gnu";
            #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
            const EXPECTED_ARCH: &str = "x86_64-pc-windows-msvc";

            // Only check if we have an expected arch defined
            #[cfg(any(
                all(target_os = "macos", target_arch = "aarch64"),
                all(target_os = "macos", target_arch = "x86_64"),
                all(target_os = "linux", target_arch = "x86_64"),
                all(target_os = "windows", target_arch = "x86_64")
            ))]
            if target != EXPECTED_ARCH {
                return Err(PythonBundleError::Corrupted(format!(
                    "Architecture mismatch: bundle is {}, expected {}",
                    target, EXPECTED_ARCH
                )));
            }
        }
    }

    Ok(())
}

/// Detect bundled Python from Tauri's resource directory
pub fn detect_bundled_python(resource_dir: &PathBuf) -> Option<PythonInfo> {
    let bundle_path = resource_dir.join("python");

    // Verify bundle integrity before using
    if let Err(e) = verify_bundled_python(&bundle_path) {
        tracing::warn!("Bundled Python verification failed: {}", e);
        return None;
    }

    #[cfg(unix)]
    let python_path = bundle_path.join("bin/python3");
    #[cfg(windows)]
    let python_path = bundle_path.join("python.exe");

    let output = Command::new(&python_path).arg("--version").output().ok()?;

    if output.status.success() {
        let version = String::from_utf8_lossy(&output.stdout)
            .trim()
            .replace("Python ", "");
        return Some(PythonInfo {
            path: python_path,
            version,
            is_bundled: true,
        });
    }

    None
}

/// Find a working Python installation
/// Priority: 1. Bundled Python, 2. Saved setting, 3. System Python
pub fn find_python(resource_dir: Option<&PathBuf>) -> Option<PythonInfo> {
    // 1. FIRST: Check for bundled Python (highest priority)
    if let Some(res_dir) = resource_dir {
        if let Some(bundled) = detect_bundled_python(res_dir) {
            tracing::info!("Using bundled Python: {:?}", bundled.path);
            return Some(bundled);
        }
    }

    // 2. Check saved setting
    if let Some(saved) = db::get_setting("python_path") {
        let path = PathBuf::from(&saved);
        if is_valid_python(&path) {
            if let Some(version) = get_python_version(&path) {
                return Some(PythonInfo {
                    path,
                    version,
                    is_bundled: false,
                });
            }
        }
    }

    // 3. Check VIRTUAL_ENV env var (active venv)
    if let Ok(venv) = std::env::var("VIRTUAL_ENV") {
        #[cfg(unix)]
        let python = PathBuf::from(&venv).join("bin/python3");
        #[cfg(windows)]
        let python = PathBuf::from(&venv).join("Scripts/python.exe");

        if python.exists() && is_valid_python(&python) {
            if let Some(version) = get_python_version(&python) {
                return Some(PythonInfo {
                    path: python,
                    version,
                    is_bundled: false,
                });
            }
        }
    }

    // 4. Check `which python3` (Unix) or `where python` (Windows)
    #[cfg(unix)]
    {
        if let Ok(output) = Command::new("which").arg("python3").output() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                let python = PathBuf::from(&path);
                if is_valid_python(&python) {
                    if let Some(version) = get_python_version(&python) {
                        return Some(PythonInfo {
                            path: python,
                            version,
                            is_bundled: false,
                        });
                    }
                }
            }
        }
    }

    #[cfg(windows)]
    {
        if let Ok(output) = Command::new("where").arg("python").output() {
            let path = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .unwrap_or("")
                .trim()
                .to_string();
            if !path.is_empty() {
                let python = PathBuf::from(&path);
                if is_valid_python(&python) {
                    if let Some(version) = get_python_version(&python) {
                        return Some(PythonInfo {
                            path: python,
                            version,
                            is_bundled: false,
                        });
                    }
                }
            }
        }
    }

    // 5. Hardcoded fallbacks for macOS/Linux
    #[cfg(unix)]
    {
        for path in [
            "/opt/homebrew/bin/python3",
            "/usr/local/bin/python3",
            "/usr/bin/python3",
        ] {
            let python = PathBuf::from(path);
            if python.exists() && is_valid_python(&python) {
                if let Some(version) = get_python_version(&python) {
                    return Some(PythonInfo {
                        path: python,
                        version,
                        is_bundled: false,
                    });
                }
            }
        }
    }

    None
}

/// Validate that a Python executable works
fn is_valid_python(path: &PathBuf) -> bool {
    if !path.exists() {
        return false;
    }

    Command::new(path)
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Get Python version string
pub fn get_python_version(path: &PathBuf) -> Option<String> {
    Command::new(path)
        .arg("--version")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| {
            String::from_utf8_lossy(&o.stdout)
                .trim()
                .replace("Python ", "")
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_valid_python() {
        // System python should be valid on most systems
        let path = PathBuf::from("/usr/bin/python3");
        if path.exists() {
            assert!(is_valid_python(&path));
        }

        // Non-existent path should be invalid
        let fake = PathBuf::from("/nonexistent/python3");
        assert!(!is_valid_python(&fake));
    }
}
