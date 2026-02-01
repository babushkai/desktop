use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

use crate::{db, python};

// Global handle to the running script process for cancellation
static RUNNING_PROCESS: std::sync::OnceLock<Mutex<Option<Child>>> = std::sync::OnceLock::new();

fn get_process_mutex() -> &'static Mutex<Option<Child>> {
    RUNNING_PROCESS.get_or_init(|| Mutex::new(None))
}

#[derive(Clone, Serialize)]
#[serde(tag = "type")]
pub enum ScriptEvent {
    #[serde(rename = "log")]
    Log { message: String },
    #[serde(rename = "progress")]
    Progress { current: u32, total: u32 },
    #[serde(rename = "error")]
    Error { message: String },
    #[serde(rename = "complete")]
    Complete,
    #[serde(rename = "exit")]
    Exit { code: i32 },
}

#[derive(Deserialize)]
struct JsonOutput {
    #[serde(rename = "type")]
    event_type: String,
    message: Option<String>,
    current: Option<u32>,
    total: Option<u32>,
}

#[tauri::command]
pub fn get_python_path() -> Option<String> {
    db::get_setting("python_path")
}

#[tauri::command]
pub fn set_python_path(path: String) -> Result<(), String> {
    db::set_setting("python_path", &path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn find_python() -> Option<String> {
    python::find_python().map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn run_script(
    app: AppHandle,
    script_code: String,
    input_path: String,
) -> Result<(), String> {
    // Get Python path
    let python_path = python::find_python()
        .ok_or_else(|| "No Python installation found".to_string())?;

    // Create temp script file
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let scripts_dir = app_data_dir.join("scripts");
    std::fs::create_dir_all(&scripts_dir).map_err(|e| e.to_string())?;

    let script_id = uuid::Uuid::new_v4();
    let script_path = scripts_dir.join(format!("script_{}.py", script_id));

    std::fs::write(&script_path, &script_code).map_err(|e| e.to_string())?;

    // Spawn Python process
    let mut child = Command::new(&python_path)
        .arg("-u") // Unbuffered output
        .arg(&script_path)
        .arg(&input_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    // Store process handle for cancellation
    {
        let mut guard = get_process_mutex().lock().map_err(|e| e.to_string())?;
        *guard = Some(child);
    }

    let app_clone = app.clone();
    let script_path_clone = script_path.clone();

    // Spawn thread to read stdout
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(line) = line {
                let event = parse_output_line(&line);
                let _ = app_clone.emit("script-output", event);
            }
        }
    });

    let app_clone2 = app.clone();

    // Spawn thread to read stderr
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(line) = line {
                let _ = app_clone2.emit("script-output", ScriptEvent::Error { message: line });
            }
        }
    });

    // Wait for process completion in background
    let app_clone3 = app.clone();
    std::thread::spawn(move || {
        let exit_code = {
            let mut guard = get_process_mutex().lock().unwrap();
            if let Some(ref mut child) = *guard {
                child.wait().map(|s| s.code().unwrap_or(-1)).unwrap_or(-1)
            } else {
                -1
            }
        };

        // Clear process handle
        {
            let mut guard = get_process_mutex().lock().unwrap();
            *guard = None;
        }

        // Clean up temp script file
        let _ = std::fs::remove_file(&script_path_clone);

        // Emit completion events
        let _ = app_clone3.emit("script-output", ScriptEvent::Complete);
        let _ = app_clone3.emit("script-output", ScriptEvent::Exit { code: exit_code });
    });

    Ok(())
}

#[tauri::command]
pub fn cancel_script() -> Result<(), String> {
    let mut guard = get_process_mutex().lock().map_err(|e| e.to_string())?;
    if let Some(ref mut child) = *guard {
        // Kill the process
        #[cfg(unix)]
        unsafe {
            libc::kill(child.id() as i32, libc::SIGTERM);
        }
        #[cfg(not(unix))]
        let _ = child.kill();
        Ok(())
    } else {
        Err("No script running".to_string())
    }
}

fn parse_output_line(line: &str) -> ScriptEvent {
    // Try to parse as JSON first
    if let Ok(json) = serde_json::from_str::<JsonOutput>(line) {
        match json.event_type.as_str() {
            "progress" => {
                if let (Some(current), Some(total)) = (json.current, json.total) {
                    return ScriptEvent::Progress { current, total };
                }
            }
            "error" => {
                if let Some(message) = json.message {
                    return ScriptEvent::Error { message };
                }
            }
            "complete" => {
                return ScriptEvent::Complete;
            }
            _ => {}
        }
    }

    // Fall back to plain log message
    ScriptEvent::Log {
        message: line.to_string(),
    }
}
