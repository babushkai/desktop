use std::path::PathBuf;
use std::process::Command;

use crate::db;

/// Find a working Python installation
pub fn find_python() -> Option<PathBuf> {
    // 1. Check saved setting
    if let Some(saved) = db::get_setting("python_path") {
        let path = PathBuf::from(&saved);
        if is_valid_python(&path) {
            return Some(path);
        }
    }

    // 2. Check VIRTUAL_ENV env var (active venv)
    if let Ok(venv) = std::env::var("VIRTUAL_ENV") {
        let python = PathBuf::from(venv).join("bin/python3");
        if python.exists() && is_valid_python(&python) {
            return Some(python);
        }
    }

    // 3. Check `which python3`
    if let Ok(output) = Command::new("which").arg("python3").output() {
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !path.is_empty() {
            let python = PathBuf::from(&path);
            if is_valid_python(&python) {
                return Some(python);
            }
        }
    }

    // 4. Hardcoded fallbacks for macOS
    for path in [
        "/opt/homebrew/bin/python3",
        "/usr/local/bin/python3",
        "/usr/bin/python3",
    ] {
        let python = PathBuf::from(path);
        if python.exists() && is_valid_python(&python) {
            return Some(python);
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
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
}
