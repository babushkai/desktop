use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Emitter, Manager};

use crate::{db, python};

// Global handle to the running script process for cancellation
static RUNNING_PROCESS: std::sync::OnceLock<Mutex<Option<Child>>> = std::sync::OnceLock::new();

fn get_process_mutex() -> &'static Mutex<Option<Child>> {
    RUNNING_PROCESS.get_or_init(|| Mutex::new(None))
}

// Inference Server state with channel for responses
struct InferenceProcess {
    child: Child,
    stdin: ChildStdin,
    model_path: String,
    model_info: Option<ModelInfo>,
    #[allow(dead_code)]
    response_rx: mpsc::Receiver<InferenceResponse>,
    pending_requests: Arc<Mutex<HashMap<String, mpsc::Sender<InferenceResponse>>>>,
}

static INFERENCE_SERVER: std::sync::OnceLock<Mutex<Option<InferenceProcess>>> =
    std::sync::OnceLock::new();

fn get_inference_mutex() -> &'static Mutex<Option<InferenceProcess>> {
    INFERENCE_SERVER.get_or_init(|| Mutex::new(None))
}

// Timeout constants
const LOAD_TIMEOUT_SECS: u64 = 30;
const PREDICT_TIMEOUT_SECS: u64 = 10;

// Embedded Python inference server script
const INFERENCE_SERVER_PY: &str = include_str!("inference_server.py");

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ModelInfo {
    #[serde(rename = "type")]
    pub model_type: String,
    pub is_classifier: bool,
    pub classes: Option<Vec<serde_json::Value>>,
    pub feature_names: Option<Vec<String>>,
}

#[derive(Clone, Serialize)]
pub struct ServerStatus {
    pub running: bool,
    pub model_path: Option<String>,
    pub feature_names: Option<Vec<String>>,
    pub model_info: Option<ModelInfo>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct PredictionResult {
    pub request_id: String,
    pub status: String,
    pub prediction: Option<Vec<serde_json::Value>>,
    pub probabilities: Option<Vec<Vec<f64>>>,
    pub classes: Option<Vec<serde_json::Value>>,
    pub message: Option<String>,
}

#[derive(Clone, Deserialize, Debug)]
struct InferenceResponse {
    request_id: String,
    status: String,
    #[serde(rename = "type")]
    response_type: Option<String>,
    model_info: Option<ModelInfo>,
    prediction: Option<Vec<serde_json::Value>>,
    probabilities: Option<Vec<Vec<f64>>>,
    classes: Option<Vec<serde_json::Value>>,
    message: Option<String>,
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
    #[serde(rename = "dataProfile")]
    DataProfile {
        #[serde(rename = "nodeId")]
        node_id: String,
        data: serde_json::Value,
    },
    #[serde(rename = "complete")]
    Complete,
    #[serde(rename = "exit")]
    Exit { code: i32 },
    #[serde(rename = "trial")]
    Trial {
        #[serde(rename = "trialNumber")]
        trial_number: u32,
        params: serde_json::Value,
        score: f64,
        #[serde(rename = "durationMs")]
        duration_ms: Option<u64>,
    },
    #[serde(rename = "tuningComplete")]
    TuningComplete {
        #[serde(rename = "bestParams")]
        best_params: serde_json::Value,
        #[serde(rename = "bestScore")]
        best_score: f64,
        #[serde(rename = "totalTrials")]
        total_trials: u32,
        #[serde(rename = "durationMs")]
        duration_ms: Option<u64>,
    },
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
    #[serde(rename = "nodeId")]
    node_id: Option<String>,
    data: Option<serde_json::Value>,
    // Tuning event fields
    #[serde(rename = "trialNumber")]
    trial_number: Option<u32>,
    params: Option<serde_json::Value>,
    score: Option<f64>,
    #[serde(rename = "durationMs")]
    duration_ms: Option<u64>,
    #[serde(rename = "bestParams")]
    best_params: Option<serde_json::Value>,
    #[serde(rename = "bestScore")]
    best_score: Option<f64>,
    #[serde(rename = "totalTrials")]
    total_trials: Option<u32>,
}

#[tauri::command]
pub fn get_python_path() -> Option<String> {
    db::get_setting("python_path")
}

#[tauri::command]
pub fn check_python_package(package: String) -> bool {
    let python_path = match python::find_python() {
        Some(p) => p,
        None => return false,
    };
    Command::new(&python_path)
        .args(["-c", &format!("import {}", package)])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
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
            "log" => {
                if let Some(message) = json.message {
                    return ScriptEvent::Log { message };
                }
            }
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
            "dataProfile" => {
                if let (Some(node_id), Some(data)) = (json.node_id, json.data) {
                    return ScriptEvent::DataProfile { node_id, data };
                }
            }
            "trial" => {
                if let (Some(trial_number), Some(params), Some(score)) =
                    (json.trial_number, json.params, json.score)
                {
                    return ScriptEvent::Trial {
                        trial_number,
                        params,
                        score,
                        duration_ms: json.duration_ms,
                    };
                }
            }
            "tuningComplete" => {
                if let (Some(best_params), Some(best_score), Some(total_trials)) =
                    (json.best_params, json.best_score, json.total_trials)
                {
                    return ScriptEvent::TuningComplete {
                        best_params,
                        best_score,
                        total_trials,
                        duration_ms: json.duration_ms,
                    };
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

// Model Registry commands

#[tauri::command]
pub fn create_model(name: String, description: Option<String>) -> Result<String, String> {
    let model_id = uuid::Uuid::new_v4().to_string();
    db::create_model(&model_id, &name, description.as_deref()).map_err(|e| e.to_string())?;
    Ok(model_id)
}

#[tauri::command]
pub fn list_models() -> Result<Vec<db::ModelMetadata>, String> {
    db::list_models().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_model(model_id: String) -> Result<Option<db::ModelMetadata>, String> {
    db::get_model(&model_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_model(model_id: String) -> Result<(), String> {
    db::delete_model(&model_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn register_model_version(
    model_id: String,
    run_id: Option<String>,
    source_path: String,
    format: String,
    metrics_snapshot: Option<String>,
    feature_names: Option<String>,
) -> Result<RegisterVersionResult, String> {
    let version_id = uuid::Uuid::new_v4().to_string();
    let version = db::register_model_version(
        &version_id,
        &model_id,
        run_id.as_deref(),
        &source_path,
        &format,
        metrics_snapshot.as_deref(),
        feature_names.as_deref(),
    ).map_err(|e| e.to_string())?;
    Ok(RegisterVersionResult { version_id, version })
}

#[derive(Clone, Serialize)]
pub struct RegisterVersionResult {
    pub version_id: String,
    pub version: i64,
}

#[tauri::command]
pub fn list_model_versions(model_id: String) -> Result<Vec<db::ModelVersion>, String> {
    db::list_model_versions(&model_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn promote_model(version_id: String, stage: String) -> Result<(), String> {
    db::promote_model(&version_id, &stage).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_model_version(version_id: String) -> Result<(), String> {
    db::delete_model_version(&version_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_model_file_path(version_id: String) -> Result<Option<String>, String> {
    db::get_model_file_path(&version_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_model_version(version_id: String) -> Result<Option<db::ModelVersion>, String> {
    db::get_model_version(&version_id).map_err(|e| e.to_string())
}

// Inference Server commands

fn get_pid_file_path(app_data_dir: &std::path::Path) -> std::path::PathBuf {
    app_data_dir.join("inference_server.pid")
}

fn write_pid_file(app_data_dir: &std::path::Path, pid: u32) -> Result<(), String> {
    std::fs::write(get_pid_file_path(app_data_dir), pid.to_string())
        .map_err(|e| e.to_string())
}

fn remove_pid_file(app_data_dir: &std::path::Path) {
    let _ = std::fs::remove_file(get_pid_file_path(app_data_dir));
}

pub fn cleanup_orphan_inference_server(app_data_dir: &std::path::Path) {
    let pid_path = get_pid_file_path(app_data_dir);
    if let Ok(pid_str) = std::fs::read_to_string(&pid_path) {
        if let Ok(pid) = pid_str.trim().parse::<i32>() {
            // Try to kill the orphaned process
            #[cfg(unix)]
            unsafe {
                libc::kill(pid, libc::SIGKILL);
            }
            #[cfg(windows)]
            {
                let _ = std::process::Command::new("taskkill")
                    .args(["/PID", &pid.to_string(), "/F"])
                    .output();
            }
        }
        let _ = std::fs::remove_file(&pid_path);
    }
}

fn parse_response_line(line: &str) -> Option<InferenceResponse> {
    line.strip_prefix("__RESPONSE__:")
        .and_then(|json_str| serde_json::from_str(json_str).ok())
}

#[tauri::command]
pub async fn start_inference_server(
    app: AppHandle,
    version_id: String,
) -> Result<ServerStatus, String> {
    // Check if already running
    {
        let guard = get_inference_mutex().lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Err("Inference server already running. Stop it first.".to_string());
        }
    }

    // Get model file path from database
    let version = db::get_model_version(&version_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Model version not found".to_string())?;

    let model_path = version.file_path.clone();

    // Get Python path
    let python_path = python::find_python()
        .ok_or_else(|| "No Python installation found".to_string())?;

    // Write inference server script to app data dir
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let scripts_dir = app_data_dir.join("scripts");
    std::fs::create_dir_all(&scripts_dir).map_err(|e| e.to_string())?;
    let script_path = scripts_dir.join("inference_server.py");
    std::fs::write(&script_path, INFERENCE_SERVER_PY).map_err(|e| e.to_string())?;

    // Spawn Python process
    let mut child = Command::new(&python_path)
        .arg("-u")
        .arg(&script_path)
        .arg(&model_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn inference server: {}", e))?;

    // Save PID for orphan cleanup
    write_pid_file(&app_data_dir, child.id())?;

    let stdin = child.stdin.take().ok_or("Failed to capture stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;

    // Create channel for responses
    let (tx, rx) = mpsc::channel::<InferenceResponse>();
    let pending_requests: Arc<Mutex<HashMap<String, mpsc::Sender<InferenceResponse>>>> =
        Arc::new(Mutex::new(HashMap::new()));

    // Spawn reader thread
    let pending_clone = pending_requests.clone();
    let tx_startup = tx.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(line) = line {
                if let Some(response) = parse_response_line(&line) {
                    let request_id = response.request_id.clone();
                    // Check if there's a waiting sender for this request
                    let mut pending = pending_clone.lock().unwrap();
                    if let Some(sender) = pending.remove(&request_id) {
                        let _ = sender.send(response);
                    } else {
                        // Startup message or unmatched - send to main channel
                        let _ = tx_startup.send(response);
                    }
                }
            }
        }
    });

    // Wait for ready response with timeout
    let model_info: Option<ModelInfo>;
    let start_time = std::time::Instant::now();

    loop {
        if start_time.elapsed() > Duration::from_secs(LOAD_TIMEOUT_SECS) {
            let _ = child.kill();
            remove_pid_file(&app_data_dir);
            return Err("Timeout waiting for model to load".to_string());
        }

        match rx.recv_timeout(Duration::from_millis(100)) {
            Ok(response) => {
                if response.status == "ok" && response.response_type == Some("ready".to_string()) {
                    model_info = response.model_info;
                    break;
                } else if response.status == "error" {
                    let _ = child.kill();
                    remove_pid_file(&app_data_dir);
                    return Err(response.message.unwrap_or("Unknown error".to_string()));
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                let _ = child.kill();
                remove_pid_file(&app_data_dir);
                return Err("Inference server process exited unexpectedly".to_string());
            }
        }
    }

    // Store process handle
    {
        let mut guard = get_inference_mutex().lock().map_err(|e| e.to_string())?;
        *guard = Some(InferenceProcess {
            child,
            stdin,
            model_path: model_path.clone(),
            model_info: model_info.clone(),
            response_rx: rx,
            pending_requests,
        });
    }

    // Parse feature_names from version if available
    let feature_names = version.feature_names
        .and_then(|s| serde_json::from_str::<Vec<String>>(&s).ok());

    Ok(ServerStatus {
        running: true,
        model_path: Some(model_path),
        feature_names,
        model_info,
    })
}

#[tauri::command]
pub async fn stop_inference_server(app: AppHandle) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    let mut guard = get_inference_mutex().lock().map_err(|e| e.to_string())?;
    if let Some(mut proc) = guard.take() {
        // Close stdin to signal EOF to Python process
        drop(proc.stdin);
        // Wait for process to exit gracefully
        let _ = proc.child.wait();
        remove_pid_file(&app_data_dir);
        Ok(())
    } else {
        Err("No inference server running".to_string())
    }
}

#[tauri::command]
pub fn get_inference_server_status(version_id: Option<String>) -> Result<ServerStatus, String> {
    let guard = get_inference_mutex().lock().map_err(|e| e.to_string())?;

    match &*guard {
        Some(proc) => {
            // If version_id is provided, also get feature_names from DB
            let feature_names = version_id
                .and_then(|vid| db::get_model_version(&vid).ok())
                .flatten()
                .and_then(|v| v.feature_names)
                .and_then(|s| serde_json::from_str::<Vec<String>>(&s).ok());

            Ok(ServerStatus {
                running: true,
                model_path: Some(proc.model_path.clone()),
                feature_names,
                model_info: proc.model_info.clone(),
            })
        }
        None => Ok(ServerStatus {
            running: false,
            model_path: None,
            feature_names: None,
            model_info: None,
        }),
    }
}

#[tauri::command]
pub fn run_inference(
    request_id: String,
    input: serde_json::Value,
) -> Result<PredictionResult, String> {
    // Create a one-shot channel for this request's response
    let (response_tx, response_rx) = mpsc::channel::<InferenceResponse>();

    {
        let mut guard = get_inference_mutex().lock().map_err(|e| e.to_string())?;
        let proc = guard.as_mut().ok_or("Inference server not running")?;

        // Register this request's sender
        {
            let mut pending = proc.pending_requests.lock().map_err(|e| e.to_string())?;
            pending.insert(request_id.clone(), response_tx);
        }

        // Build command
        let cmd = serde_json::json!({
            "cmd": "predict",
            "request_id": request_id,
            "input": input
        });

        // Write command to stdin
        writeln!(proc.stdin, "{}", cmd.to_string())
            .map_err(|e| format!("Failed to send command: {}", e))?;
        proc.stdin.flush()
            .map_err(|e| format!("Failed to flush stdin: {}", e))?;
    }

    // Wait for response with timeout
    match response_rx.recv_timeout(Duration::from_secs(PREDICT_TIMEOUT_SECS)) {
        Ok(response) => Ok(PredictionResult {
            request_id: response.request_id,
            status: response.status,
            prediction: response.prediction,
            probabilities: response.probabilities,
            classes: response.classes,
            message: response.message,
        }),
        Err(mpsc::RecvTimeoutError::Timeout) => {
            // Clean up pending request
            if let Ok(mut guard) = get_inference_mutex().lock() {
                if let Some(proc) = guard.as_mut() {
                    if let Ok(mut pending) = proc.pending_requests.lock() {
                        pending.remove(&request_id);
                    }
                }
            }
            Err("Inference request timed out".to_string())
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            Err("Inference server disconnected".to_string())
        }
    }
}

// Tuning commands

#[tauri::command]
pub fn create_tuning_session(
    run_id: String,
    sampler: String,
    search_space: String,
    n_trials: Option<i32>,
    cv_folds: i32,
    scoring_metric: String,
) -> Result<String, String> {
    let session_id = uuid::Uuid::new_v4().to_string();
    db::create_tuning_session(
        &session_id,
        &run_id,
        &sampler,
        &search_space,
        n_trials,
        cv_folds,
        &scoring_metric,
    )
    .map_err(|e| e.to_string())?;
    Ok(session_id)
}

#[tauri::command]
pub fn complete_tuning_session(
    session_id: String,
    best_trial_id: Option<String>,
) -> Result<(), String> {
    db::update_tuning_session(&session_id, "completed", best_trial_id.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cancel_tuning_session(session_id: String) -> Result<(), String> {
    db::update_tuning_session(&session_id, "cancelled", None).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_tuning_session(session_id: String) -> Result<Option<db::TuningSession>, String> {
    db::get_tuning_session(&session_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_tuning_session_by_run(run_id: String) -> Result<Option<db::TuningSession>, String> {
    db::get_tuning_session_by_run(&run_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_tuning_trial(
    session_id: String,
    trial_number: i32,
    hyperparameters: String,
    score: Option<f64>,
    duration_ms: Option<i64>,
) -> Result<String, String> {
    let trial_id = uuid::Uuid::new_v4().to_string();
    db::create_tuning_trial(
        &trial_id,
        &session_id,
        trial_number,
        &hyperparameters,
        score,
        duration_ms,
        "completed",
    )
    .map_err(|e| e.to_string())?;
    Ok(trial_id)
}

#[tauri::command]
pub fn list_tuning_trials(session_id: String) -> Result<Vec<db::TuningTrial>, String> {
    db::list_tuning_trials(&session_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_best_trial(session_id: String) -> Result<Option<db::TuningTrial>, String> {
    db::get_best_trial(&session_id).map_err(|e| e.to_string())
}
