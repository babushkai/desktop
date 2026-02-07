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
    // Explain events
    #[serde(rename = "explainProgress")]
    ExplainProgress { data: serde_json::Value },
    #[serde(rename = "featureImportance")]
    FeatureImportance { data: serde_json::Value },
    #[serde(rename = "shapData")]
    ShapData { data: serde_json::Value },
    #[serde(rename = "partialDependence")]
    PartialDependence { data: serde_json::Value },
    #[serde(rename = "explainMetadata")]
    ExplainMetadata { data: serde_json::Value },
    #[serde(rename = "explainComplete")]
    ExplainComplete {
        #[serde(rename = "durationMs")]
        duration_ms: u64,
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
pub fn check_python_package(app: AppHandle, package: String) -> bool {
    let resource_dir = app.path().resource_dir().ok();
    let python_info = match python::find_python(resource_dir.as_ref()) {
        Some(p) => p,
        None => return false,
    };

    // If using bundled Python, all packages are pre-installed
    if python_info.is_bundled {
        // Check if it's one of our bundled packages
        let bundled_packages = [
            "sklearn",
            "pandas",
            "numpy",
            "joblib",
            "optuna",
            "shap",
            "matplotlib",
            "fastapi",
            "uvicorn",
            "slowapi",
            "onnxruntime",
            "skl2onnx",
            "pyright",
        ];
        if bundled_packages.contains(&package.as_str()) {
            return true;
        }
    }

    Command::new(&python_info.path)
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
pub fn find_python(app: AppHandle) -> Option<python::PythonInfo> {
    let resource_dir = app.path().resource_dir().ok();
    python::find_python(resource_dir.as_ref())
}

#[tauri::command]
pub async fn run_script(
    app: AppHandle,
    script_code: String,
    input_path: String,
) -> Result<(), String> {
    // Get Python path
    let resource_dir = app.path().resource_dir().ok();
    let python_info = python::find_python(resource_dir.as_ref())
        .ok_or_else(|| "No Python installation found".to_string())?;
    let python_path = python_info.path;

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
            // Explain events
            "explainProgress" => {
                if let Some(data) = json.data {
                    return ScriptEvent::ExplainProgress { data };
                }
            }
            "featureImportance" => {
                if let Some(data) = json.data {
                    return ScriptEvent::FeatureImportance { data };
                }
            }
            "shapData" => {
                if let Some(data) = json.data {
                    return ScriptEvent::ShapData { data };
                }
            }
            "partialDependence" => {
                if let Some(data) = json.data {
                    return ScriptEvent::PartialDependence { data };
                }
            }
            "explainMetadata" => {
                if let Some(data) = json.data {
                    return ScriptEvent::ExplainMetadata { data };
                }
            }
            "explainComplete" => {
                if let Some(duration_ms) = json.duration_ms {
                    return ScriptEvent::ExplainComplete { duration_ms };
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
pub fn create_run(pipeline_name: String, hyperparameters: String, experiment_id: Option<String>) -> Result<String, String> {
    let run_id = uuid::Uuid::new_v4().to_string();
    db::create_run(&run_id, &pipeline_name, &hyperparameters, experiment_id.as_deref()).map_err(|e| e.to_string())?;
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
pub fn list_runs(pipeline_name: Option<String>, experiment_id: Option<String>) -> Result<Vec<db::RunMetadata>, String> {
    db::list_runs(pipeline_name.as_deref(), experiment_id.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_run_metrics(run_id: String) -> Result<Vec<db::Metric>, String> {
    db::get_run_metrics(&run_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_run(id: String) -> Result<(), String> {
    db::delete_run(&id).map_err(|e| e.to_string())
}

// Experiment commands

#[tauri::command]
pub fn create_experiment(name: String, description: Option<String>) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    db::create_experiment(&id, &name, description.as_deref()).map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub fn update_experiment(
    id: String,
    name: Option<String>,
    description: Option<String>,
    status: Option<String>,
) -> Result<(), String> {
    db::update_experiment(&id, name.as_deref(), description.as_deref(), status.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_experiments(include_archived: bool) -> Result<Vec<db::Experiment>, String> {
    db::list_experiments(include_archived).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_experiment(id: String) -> Result<Option<db::Experiment>, String> {
    db::get_experiment(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_experiment(id: String) -> Result<(), String> {
    db::delete_experiment(&id).map_err(|e| e.to_string())
}

// Run Annotation commands

#[tauri::command]
pub fn update_run_display_name(id: String, display_name: Option<String>) -> Result<(), String> {
    db::update_run_display_name(&id, display_name.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_run_experiment(id: String, experiment_id: Option<String>) -> Result<(), String> {
    db::set_run_experiment(&id, experiment_id.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_run_note(run_id: String, content: String) -> Result<(), String> {
    db::set_run_note(&run_id, &content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_run_note(run_id: String) -> Result<Option<String>, String> {
    db::get_run_note(&run_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_run_note(run_id: String) -> Result<(), String> {
    db::delete_run_note(&run_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_run_tag(run_id: String, tag: String) -> Result<(), String> {
    db::add_run_tag(&run_id, &tag).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_run_tag(run_id: String, tag: String) -> Result<(), String> {
    db::remove_run_tag(&run_id, &tag).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_run_tags(run_id: String) -> Result<Vec<String>, String> {
    db::get_run_tags(&run_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_all_tags() -> Result<Vec<String>, String> {
    db::list_all_tags().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_runs_for_comparison(run_ids: Vec<String>) -> Result<db::RunComparisonData, String> {
    db::get_runs_for_comparison(&run_ids).map_err(|e| e.to_string())
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
    let resource_dir = app.path().resource_dir().ok();
    let python_info = python::find_python(resource_dir.as_ref())
        .ok_or_else(|| "No Python installation found".to_string())?;
    let python_path = python_info.path;

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

// Model Metadata & Tags commands (v9)

#[tauri::command]
pub fn update_model_version_metadata(
    version_id: String,
    description: Option<String>,
    notes: Option<String>,
) -> Result<(), String> {
    db::update_model_version_metadata(&version_id, description.as_deref(), notes.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_model_version_training_info(
    version_id: String,
    n_features: Option<i64>,
    feature_names: Option<String>,
) -> Result<(), String> {
    db::update_model_version_training_info(&version_id, n_features, feature_names.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_model_version_export_path(
    version_id: String,
    onnx_path: Option<String>,
    coreml_path: Option<String>,
) -> Result<(), String> {
    db::update_model_version_export_path(&version_id, onnx_path.as_deref(), coreml_path.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_model_tag(version_id: String, tag: String) -> Result<(), String> {
    db::add_model_tag(&version_id, &tag).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_model_tag(version_id: String, tag: String) -> Result<(), String> {
    db::remove_model_tag(&version_id, &tag).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_model_tags(version_id: String) -> Result<Vec<String>, String> {
    db::get_model_tags(&version_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_all_model_tags() -> Result<Vec<String>, String> {
    db::list_all_model_tags().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_all_model_versions_filtered(
    filters: Option<db::ModelVersionFilters>,
) -> Result<Vec<db::ModelVersion>, String> {
    db::list_all_model_versions_filtered(filters).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_model_versions_for_comparison(
    version_ids: Vec<String>,
) -> Result<db::ModelVersionComparison, String> {
    db::get_model_versions_for_comparison(&version_ids).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_comparable_versions(model_id: String) -> Result<Vec<db::ModelVersion>, String> {
    db::get_comparable_versions(&model_id).map_err(|e| e.to_string())
}

// HTTP Server for Model Serving (v10)

// Embedded HTTP server script
const HTTP_SERVER_PY: &str = include_str!("http_server.py");

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct HttpServerConfig {
    pub host: String,
    pub port: u16,
    pub use_onnx: bool,
    pub cors_origins: Option<Vec<String>>,
}

impl Default for HttpServerConfig {
    fn default() -> Self {
        Self {
            host: "127.0.0.1".to_string(),
            port: 8080,
            use_onnx: false,
            cors_origins: None,
        }
    }
}

#[derive(Clone, Serialize, Debug)]
pub struct HttpServerStatus {
    pub running: bool,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub version_id: Option<String>,
    pub model_name: Option<String>,
    pub runtime: Option<String>,
    pub model_info: Option<ModelInfo>,
    pub url: Option<String>,
}

#[derive(Clone, Serialize, Debug)]
pub struct HttpRequestLog {
    pub id: String,
    pub timestamp: i64,
    pub method: String,
    pub path: String,
    pub status_code: u16,
    pub latency_ms: f64,
    pub batch_size: u32,
}

#[derive(Clone, Serialize, Debug)]
pub struct HttpServerMetrics {
    pub total_requests: u64,
    pub successful_requests: u64,
    pub failed_requests: u64,
    pub avg_latency_ms: f64,
    pub requests_per_minute: f64,
    pub recent_requests: Vec<HttpRequestLog>,
}

// HTTP Server process state
struct HttpServerProcess {
    child: Child,
    version_id: String,
    model_name: String,
    host: String,
    port: u16,
    runtime: String,
    model_info: Option<ModelInfo>,
    // Metrics tracking (in-memory)
    metrics: Arc<Mutex<HttpServerMetricsTracker>>,
}

#[derive(Default)]
struct HttpServerMetricsTracker {
    total_requests: u64,
    successful_requests: u64,
    failed_requests: u64,
    total_latency_ms: f64,
    start_time: Option<std::time::Instant>,
    recent_requests: std::collections::VecDeque<HttpRequestLog>,
}

impl HttpServerMetricsTracker {
    fn new() -> Self {
        Self {
            start_time: Some(std::time::Instant::now()),
            ..Default::default()
        }
    }

    fn add_request(&mut self, log: HttpRequestLog) {
        self.total_requests += 1;
        if log.status_code >= 200 && log.status_code < 400 {
            self.successful_requests += 1;
        } else {
            self.failed_requests += 1;
        }
        self.total_latency_ms += log.latency_ms;

        // Keep last 100 requests
        self.recent_requests.push_back(log);
        while self.recent_requests.len() > 100 {
            self.recent_requests.pop_front();
        }
    }

    fn get_metrics(&self) -> HttpServerMetrics {
        let avg_latency = if self.total_requests > 0 {
            self.total_latency_ms / self.total_requests as f64
        } else {
            0.0
        };

        let rpm = if let Some(start) = self.start_time {
            let elapsed_mins = start.elapsed().as_secs_f64() / 60.0;
            if elapsed_mins > 0.0 {
                self.total_requests as f64 / elapsed_mins
            } else {
                0.0
            }
        } else {
            0.0
        };

        HttpServerMetrics {
            total_requests: self.total_requests,
            successful_requests: self.successful_requests,
            failed_requests: self.failed_requests,
            avg_latency_ms: avg_latency,
            requests_per_minute: rpm,
            recent_requests: self.recent_requests.iter().cloned().collect(),
        }
    }

    fn reset(&mut self) {
        *self = Self::new();
    }
}

static HTTP_SERVER: std::sync::OnceLock<Mutex<Option<HttpServerProcess>>> = std::sync::OnceLock::new();

fn get_http_server_mutex() -> &'static Mutex<Option<HttpServerProcess>> {
    HTTP_SERVER.get_or_init(|| Mutex::new(None))
}

fn get_http_pid_file_path(app_data_dir: &std::path::Path) -> std::path::PathBuf {
    app_data_dir.join("http_server.pid")
}

fn write_http_pid_file(app_data_dir: &std::path::Path, pid: u32) -> Result<(), String> {
    std::fs::write(get_http_pid_file_path(app_data_dir), pid.to_string())
        .map_err(|e| e.to_string())
}

fn remove_http_pid_file(app_data_dir: &std::path::Path) {
    let _ = std::fs::remove_file(get_http_pid_file_path(app_data_dir));
}

pub fn cleanup_orphan_http_server(app_data_dir: &std::path::Path) {
    let pid_path = get_http_pid_file_path(app_data_dir);
    if let Ok(pid_str) = std::fs::read_to_string(&pid_path) {
        if let Ok(pid) = pid_str.trim().parse::<i32>() {
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

#[derive(Deserialize)]
struct HttpReadyResponse {
    host: String,
    port: u16,
    runtime: String,
    model_info: Option<ModelInfo>,
}

#[derive(Deserialize)]
struct HttpRequestLogJson {
    id: String,
    timestamp: i64,
    method: String,
    path: String,
    status_code: u16,
    latency_ms: f64,
    batch_size: Option<u32>,
}

#[derive(Deserialize, Serialize)]
struct HttpErrorJson {
    code: String,
    message: String,
}

#[tauri::command]
pub async fn start_http_server(
    app: AppHandle,
    version_id: String,
    config: Option<HttpServerConfig>,
) -> Result<HttpServerStatus, String> {
    // Check if already running
    {
        let guard = get_http_server_mutex().lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Err("HTTP server already running. Stop it first.".to_string());
        }
    }

    let config = config.unwrap_or_default();

    // Get model version info
    let version = db::get_model_version(&version_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Model version not found".to_string())?;

    // Get model name
    let model = db::get_model(&version.model_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Model not found".to_string())?;

    let model_path = version.file_path.clone();

    // Get Python path
    let resource_dir = app.path().resource_dir().ok();
    let python_info = python::find_python(resource_dir.as_ref())
        .ok_or_else(|| "No Python installation found".to_string())?;
    let python_path = python_info.path;

    // Write HTTP server script to app data dir
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let scripts_dir = app_data_dir.join("scripts");
    std::fs::create_dir_all(&scripts_dir).map_err(|e| e.to_string())?;
    let script_path = scripts_dir.join("http_server.py");
    std::fs::write(&script_path, HTTP_SERVER_PY).map_err(|e| e.to_string())?;

    // Build command arguments
    let mut args = vec![
        "-u".to_string(),
        script_path.to_string_lossy().to_string(),
        model_path.clone(),
        "--host".to_string(),
        config.host.clone(),
        "--port".to_string(),
        config.port.to_string(),
    ];

    // Add ONNX path if requested and available
    if config.use_onnx {
        if let Some(onnx_path) = &version.onnx_path {
            args.push("--onnx".to_string());
            args.push(onnx_path.clone());
        }
    }

    // Add CORS origins if configured
    if let Some(origins) = &config.cors_origins {
        if !origins.is_empty() {
            args.push("--cors".to_string());
            args.push(origins.join(","));
        }
    }

    // Spawn Python process
    let mut child = Command::new(&python_path)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn HTTP server: {}", e))?;

    // Save PID for orphan cleanup
    write_http_pid_file(&app_data_dir, child.id())?;

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    // Create metrics tracker
    let metrics = Arc::new(Mutex::new(HttpServerMetricsTracker::new()));
    let metrics_clone = metrics.clone();

    // Channel for ready signal
    let (ready_tx, ready_rx) = mpsc::channel::<Result<HttpReadyResponse, String>>();

    // Spawn reader thread
    let app_clone = app.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        let mut ready_sent = false;

        for line in reader.lines() {
            if let Ok(line) = line {
                // Parse different message types
                if let Some(json_str) = line.strip_prefix("__READY__:") {
                    if !ready_sent {
                        if let Ok(ready) = serde_json::from_str::<HttpReadyResponse>(json_str) {
                            let _ = ready_tx.send(Ok(ready));
                            ready_sent = true;
                        }
                    }
                } else if let Some(json_str) = line.strip_prefix("__REQUEST__:") {
                    if let Ok(log) = serde_json::from_str::<HttpRequestLogJson>(json_str) {
                        let request_log = HttpRequestLog {
                            id: log.id,
                            timestamp: log.timestamp,
                            method: log.method,
                            path: log.path,
                            status_code: log.status_code,
                            latency_ms: log.latency_ms,
                            batch_size: log.batch_size.unwrap_or(1),
                        };

                        // Update metrics
                        if let Ok(mut m) = metrics_clone.lock() {
                            m.add_request(request_log.clone());
                        }

                        // Emit to frontend
                        let _ = app_clone.emit("http-request-log", &request_log);
                    }
                } else if let Some(json_str) = line.strip_prefix("__ERROR__:") {
                    if let Ok(err) = serde_json::from_str::<HttpErrorJson>(json_str) {
                        if !ready_sent {
                            let _ = ready_tx.send(Err(format!("{}: {}", err.code, err.message)));
                            ready_sent = true;
                        }
                        let _ = app_clone.emit("http-server-error", &err);
                    }
                } else if let Some(json_str) = line.strip_prefix("__LOG__:") {
                    // Just emit log messages
                    let _ = app_clone.emit("http-server-log", json_str);
                }
            }
        }
    });

    // Spawn stderr reader
    let app_clone2 = app.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(line) = line {
                let _ = app_clone2.emit("http-server-error", &serde_json::json!({
                    "code": "STDERR",
                    "message": line
                }));
            }
        }
    });

    // Wait for ready response with timeout
    let start_time = std::time::Instant::now();
    let timeout = Duration::from_secs(30);

    loop {
        if start_time.elapsed() > timeout {
            let _ = child.kill();
            remove_http_pid_file(&app_data_dir);
            return Err("Timeout waiting for HTTP server to start".to_string());
        }

        match ready_rx.recv_timeout(Duration::from_millis(100)) {
            Ok(Ok(ready)) => {
                let url = format!("http://{}:{}", ready.host, ready.port);

                // Store process handle
                {
                    let mut guard = get_http_server_mutex().lock().map_err(|e| e.to_string())?;
                    *guard = Some(HttpServerProcess {
                        child,
                        version_id: version_id.clone(),
                        model_name: model.name.clone(),
                        host: ready.host.clone(),
                        port: ready.port,
                        runtime: ready.runtime.clone(),
                        model_info: ready.model_info.clone(),
                        metrics,
                    });
                }

                return Ok(HttpServerStatus {
                    running: true,
                    host: Some(ready.host),
                    port: Some(ready.port),
                    version_id: Some(version_id),
                    model_name: Some(model.name),
                    runtime: Some(ready.runtime),
                    model_info: ready.model_info,
                    url: Some(url),
                });
            }
            Ok(Err(e)) => {
                let _ = child.kill();
                remove_http_pid_file(&app_data_dir);
                return Err(e);
            }
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                let _ = child.kill();
                remove_http_pid_file(&app_data_dir);
                return Err("HTTP server process exited unexpectedly".to_string());
            }
        }
    }
}

#[tauri::command]
pub async fn stop_http_server(app: AppHandle) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    let mut guard = get_http_server_mutex().lock().map_err(|e| e.to_string())?;
    if let Some(mut proc) = guard.take() {
        // Kill the process
        #[cfg(unix)]
        unsafe {
            libc::kill(proc.child.id() as i32, libc::SIGTERM);
        }
        #[cfg(not(unix))]
        let _ = proc.child.kill();

        // Wait for process to exit
        let _ = proc.child.wait();
        remove_http_pid_file(&app_data_dir);
        Ok(())
    } else {
        Err("No HTTP server running".to_string())
    }
}

#[tauri::command]
pub fn get_http_server_status() -> Result<HttpServerStatus, String> {
    let guard = get_http_server_mutex().lock().map_err(|e| e.to_string())?;

    match &*guard {
        Some(proc) => {
            let url = format!("http://{}:{}", proc.host, proc.port);
            Ok(HttpServerStatus {
                running: true,
                host: Some(proc.host.clone()),
                port: Some(proc.port),
                version_id: Some(proc.version_id.clone()),
                model_name: Some(proc.model_name.clone()),
                runtime: Some(proc.runtime.clone()),
                model_info: proc.model_info.clone(),
                url: Some(url),
            })
        }
        None => Ok(HttpServerStatus {
            running: false,
            host: None,
            port: None,
            version_id: None,
            model_name: None,
            runtime: None,
            model_info: None,
            url: None,
        }),
    }
}

#[tauri::command]
pub fn get_http_server_metrics() -> Result<HttpServerMetrics, String> {
    let guard = get_http_server_mutex().lock().map_err(|e| e.to_string())?;

    match &*guard {
        Some(proc) => {
            let metrics = proc.metrics.lock().map_err(|e| e.to_string())?;
            Ok(metrics.get_metrics())
        }
        None => Ok(HttpServerMetrics {
            total_requests: 0,
            successful_requests: 0,
            failed_requests: 0,
            avg_latency_ms: 0.0,
            requests_per_minute: 0.0,
            recent_requests: vec![],
        }),
    }
}

#[tauri::command]
pub fn reset_http_server_metrics() -> Result<(), String> {
    let guard = get_http_server_mutex().lock().map_err(|e| e.to_string())?;

    if let Some(proc) = &*guard {
        let mut metrics = proc.metrics.lock().map_err(|e| e.to_string())?;
        metrics.reset();
    }

    Ok(())
}

#[tauri::command]
pub fn get_serving_version_id() -> Result<Option<String>, String> {
    let guard = get_http_server_mutex().lock().map_err(|e| e.to_string())?;
    Ok(guard.as_ref().map(|p| p.version_id.clone()))
}

// Override delete_model_version to check if being served
#[tauri::command]
pub fn delete_model_version_safe(version_id: String) -> Result<(), String> {
    // Check if this version is being served
    {
        let guard = get_http_server_mutex().lock().map_err(|e| e.to_string())?;
        if let Some(proc) = guard.as_ref() {
            if proc.version_id == version_id {
                return Err("Cannot delete model version while it is being served. Stop the HTTP server first.".to_string());
            }
        }
    }

    // Also check inference server
    {
        let guard = get_inference_mutex().lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            // Get the served model path and compare
            // For simplicity, we just check if any inference server is running
            // A more thorough check would compare model paths
        }
    }

    db::delete_model_version(&version_id).map_err(|e| e.to_string())
}

// Ollama LLM commands

#[tauri::command]
pub async fn check_ollama(host: Option<String>) -> bool {
    let h = host.as_deref().unwrap_or("http://localhost:11434");
    crate::ollama::check_status(h).await
}

#[tauri::command]
pub async fn list_ollama_models(host: Option<String>) -> Result<Vec<String>, String> {
    let h = host.as_deref().unwrap_or("http://localhost:11434");
    crate::ollama::list_models(h).await
}

#[tauri::command]
pub async fn generate_completion(
    request_id: String,
    host: Option<String>,
    model: String,
    context: String,
    cursor_line: String,
    columns: Vec<String>,
) -> Result<String, String> {
    // Register request for cancellation tracking
    crate::ollama::register_request(&request_id);

    let h = host.as_deref().unwrap_or("http://localhost:11434");
    let result = crate::ollama::generate_completion(
        h,
        &model,
        &context,
        &cursor_line,
        &columns,
        &request_id,
    )
    .await;

    // Unregister request
    crate::ollama::unregister_request(&request_id);

    result
}

#[tauri::command]
pub fn cancel_completion(request_id: String) {
    crate::ollama::cancel_request(&request_id);
}

// RAG (Retrieval-Augmented Generation) commands

/// Input for indexing a single node
#[derive(Deserialize)]
pub struct NodeToIndex {
    pub node_id: String,
    pub code: String,
}

/// Generate embedding for text using Ollama
#[tauri::command]
pub async fn generate_embedding(
    host: Option<String>,
    model: String,
    text: String,
) -> Result<Vec<f32>, String> {
    let h = host.as_deref().unwrap_or("http://localhost:11434");
    crate::ollama::generate_embedding(h, &model, &text).await
}

/// Input for indexing a chunk
#[derive(Deserialize)]
pub struct ChunkToIndex {
    pub chunk_id: String,
    pub content: String,
    pub content_hash: String,
    pub symbol_name: Option<String>,
    pub symbol_type: String,
    pub start_line: i64,
    pub end_line: i64,
}

/// Index chunks for a node (v9+ chunk-level indexing)
#[tauri::command]
pub async fn index_node_chunks(
    host: Option<String>,
    model: String,
    pipeline_id: String,
    node_id: String,
    chunks: Vec<ChunkToIndex>,
) -> Result<usize, String> {
    let h = host.as_deref().unwrap_or("http://localhost:11434");
    let mut indexed_count = 0;

    // Check for model mismatch - if so, clear existing embeddings for this pipeline
    if db::rag_model_mismatch(&pipeline_id, &model).map_err(|e| e.to_string())? {
        db::rag_delete_pipeline_embeddings(&pipeline_id).map_err(|e| e.to_string())?;
    }

    for chunk in &chunks {
        // Check if this chunk needs re-indexing (content hash changed)
        let needs_index = db::rag_chunk_needs_reindex(&node_id, &chunk.chunk_id, &chunk.content_hash)
            .map_err(|e| e.to_string())?;

        if needs_index {
            // Generate embedding
            let embedding = crate::ollama::generate_embedding(h, &model, &chunk.content).await?;

            // Save to database
            db::rag_save_chunk_embedding(
                &node_id,
                &pipeline_id,
                &chunk.chunk_id,
                &chunk.content_hash,
                &embedding,
                &model,
                chunk.symbol_name.as_deref(),
                &chunk.symbol_type,
                chunk.start_line,
                chunk.end_line,
            )
            .map_err(|e| e.to_string())?;

            indexed_count += 1;
        }
    }

    Ok(indexed_count)
}

/// Delete orphan chunks for a node (chunks that no longer exist in source)
#[tauri::command]
pub fn delete_orphan_chunks(
    node_id: String,
    keep_chunk_ids: Vec<String>,
) -> Result<usize, String> {
    db::rag_delete_orphan_chunks(&node_id, &keep_chunk_ids).map_err(|e| e.to_string())
}

/// Check if a chunk needs re-indexing
#[tauri::command]
pub fn check_chunk_needs_reindex(
    node_id: String,
    chunk_id: String,
    content_hash: String,
) -> Result<bool, String> {
    db::rag_chunk_needs_reindex(&node_id, &chunk_id, &content_hash).map_err(|e| e.to_string())
}

/// Index multiple nodes for a pipeline (legacy compatibility - indexes as toplevel chunks)
#[tauri::command]
pub async fn index_pipeline_nodes(
    host: Option<String>,
    model: String,
    pipeline_id: String,
    nodes: Vec<NodeToIndex>,
) -> Result<usize, String> {
    use sha2::{Digest, Sha256};

    let h = host.as_deref().unwrap_or("http://localhost:11434");
    let mut indexed_count = 0;

    // Check for model mismatch - if so, clear existing embeddings
    if db::rag_model_mismatch(&pipeline_id, &model).map_err(|e| e.to_string())? {
        db::rag_delete_pipeline_embeddings(&pipeline_id).map_err(|e| e.to_string())?;
    }

    for node in nodes {
        // Compute content hash
        let mut hasher = Sha256::new();
        hasher.update(node.code.as_bytes());
        let content_hash = format!("{:x}", hasher.finalize());

        // Check if needs re-indexing (use toplevel:0 as the chunk_id for legacy)
        let needs_index = db::rag_chunk_needs_reindex(&node.node_id, "toplevel:0", &content_hash)
            .map_err(|e| e.to_string())?;

        if needs_index {
            // Generate embedding
            let embedding = crate::ollama::generate_embedding(h, &model, &node.code).await?;

            // Count lines for end_line
            let line_count = node.code.lines().count() as i64;

            // Save to database as toplevel chunk
            db::rag_save_chunk_embedding(
                &node.node_id,
                &pipeline_id,
                "toplevel:0",
                &content_hash,
                &embedding,
                &model,
                None,
                "toplevel",
                0,
                line_count.saturating_sub(1),
            )
            .map_err(|e| e.to_string())?;

            indexed_count += 1;
        }
    }

    Ok(indexed_count)
}

/// Search for similar nodes in a pipeline
#[tauri::command]
pub async fn search_similar_nodes(
    host: Option<String>,
    model: String,
    pipeline_id: String,
    query_text: String,
    exclude_node_id: Option<String>,
    top_k: usize,
) -> Result<Vec<db::SearchResult>, String> {
    let h = host.as_deref().unwrap_or("http://localhost:11434");

    // Generate query embedding
    let query_embedding = crate::ollama::generate_embedding(h, &model, &query_text).await?;

    // Search in database
    db::rag_search_similar(
        &pipeline_id,
        &query_embedding,
        exclude_node_id.as_deref(),
        top_k,
    )
    .map_err(|e| e.to_string())
}

/// Search for similar nodes using a pre-computed embedding (for frontend caching)
#[tauri::command]
pub fn search_similar_with_embedding(
    pipeline_id: String,
    query_embedding: Vec<f32>,
    exclude_node_id: Option<String>,
    top_k: usize,
) -> Result<Vec<db::SearchResult>, String> {
    db::rag_search_similar(
        &pipeline_id,
        &query_embedding,
        exclude_node_id.as_deref(),
        top_k,
    )
    .map_err(|e| e.to_string())
}

/// Get RAG status for a pipeline
#[tauri::command]
pub fn get_rag_status(pipeline_id: String) -> Result<db::RagStatus, String> {
    db::rag_get_status(&pipeline_id).map_err(|e| e.to_string())
}

/// Delete all chunks for a specific node
#[tauri::command]
pub fn delete_node_embedding(node_id: String) -> Result<(), String> {
    db::rag_delete_node_chunks(&node_id).map_err(|e| e.to_string())
}

/// Delete all embeddings for a pipeline
#[tauri::command]
pub fn delete_pipeline_embeddings(pipeline_id: String) -> Result<(), String> {
    db::rag_delete_pipeline_embeddings(&pipeline_id).map_err(|e| e.to_string())
}
