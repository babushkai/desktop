use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::path::BaseDirectory;
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
    #[serde(rename = "metrics")]
    Metrics {
        #[serde(rename = "modelType")]
        model_type: String,
        data: serde_json::Value,
    },
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
    #[serde(rename = "modelType")]
    model_type: Option<String>,
    data: Option<serde_json::Value>,
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

// Pipeline commands

#[tauri::command]
pub fn save_pipeline(id: String, name: String, data: String) -> Result<(), String> {
    db::save_pipeline(&id, &name, &data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_pipeline(id: String) -> Result<Option<String>, String> {
    db::load_pipeline(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_pipelines() -> Result<Vec<db::PipelineMetadata>, String> {
    db::list_pipelines().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_pipeline(id: String) -> Result<(), String> {
    db::delete_pipeline(&id).map_err(|e| e.to_string())
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
            "metrics" => {
                if let (Some(model_type), Some(data)) = (json.model_type, json.data) {
                    return ScriptEvent::Metrics { model_type, data };
                }
            }
            _ => {}
        }
    }

    // Fall back to plain log message
    ScriptEvent::Log {
        message: line.to_string(),
    }
}

// Run history commands

#[derive(Deserialize)]
pub struct MetricInput {
    pub name: String,
    pub value: Option<f64>,
    pub value_json: Option<String>,
}

#[tauri::command]
pub fn create_run(pipeline_name: String, hyperparameters: String) -> Result<String, String> {
    let run_id = uuid::Uuid::new_v4().to_string();
    db::create_run(&run_id, &pipeline_name, &hyperparameters).map_err(|e| e.to_string())?;
    Ok(run_id)
}

#[tauri::command]
pub fn complete_run(id: String, duration_ms: i64) -> Result<(), String> {
    db::update_run(&id, "completed", Some(duration_ms), None).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn fail_run(id: String, error: String) -> Result<(), String> {
    db::update_run(&id, "failed", None, Some(&error)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_run_metrics(run_id: String, metrics: Vec<MetricInput>) -> Result<(), String> {
    let db_metrics: Vec<db::Metric> = metrics
        .into_iter()
        .map(|m| db::Metric {
            name: m.name,
            value: m.value,
            value_json: m.value_json,
        })
        .collect();
    db::save_run_metrics(&run_id, &db_metrics).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_runs(pipeline_name: Option<String>) -> Result<Vec<db::RunMetadata>, String> {
    db::list_runs(pipeline_name.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_run_metrics(run_id: String) -> Result<Vec<db::Metric>, String> {
    db::get_run_metrics(&run_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_run(id: String) -> Result<(), String> {
    db::delete_run(&id).map_err(|e| e.to_string())
}

// Example data commands

#[derive(Clone, Serialize)]
pub struct ExampleDataset {
    pub id: String,
    pub name: String,
    pub description: String,
    pub task_type: String,
    pub target_column: String,
    pub recommended_model: String,
}

#[tauri::command]
pub fn get_example_data_path(app: AppHandle, dataset: String) -> Result<String, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let examples_dir = app_data_dir.join("examples");
    std::fs::create_dir_all(&examples_dir).map_err(|e| e.to_string())?;

    let dest_path = examples_dir.join(&dataset);

    if !dest_path.exists() {
        // Tauri 2.0: resources/ prefix is stripped when resolving
        let resource_path = app
            .path()
            .resolve(format!("resources/examples/{}", dataset), BaseDirectory::Resource)
            .map_err(|e| format!("Example data not found: {}", e))?;

        std::fs::copy(&resource_path, &dest_path)
            .map_err(|e| format!("Failed to copy example data to {}: {}", dest_path.display(), e))?;
    }

    Ok(dest_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn list_example_datasets() -> Vec<ExampleDataset> {
    vec![
        ExampleDataset {
            id: "iris.csv".to_string(),
            name: "Iris Classification".to_string(),
            description: "Classify iris flowers (150 samples, 3 classes)".to_string(),
            task_type: "classification".to_string(),
            target_column: "species".to_string(),
            recommended_model: "random_forest".to_string(),
        },
        ExampleDataset {
            id: "california_housing.csv".to_string(),
            name: "California Housing".to_string(),
            description: "Predict house values (200 samples)".to_string(),
            task_type: "regression".to_string(),
            target_column: "MedHouseVal".to_string(),
            recommended_model: "linear_regression".to_string(),
        },
    ]
}
