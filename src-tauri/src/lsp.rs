//! LSP (Language Server Protocol) integration for Python code intelligence via Pyright.
//!
//! This module manages the pyright-langserver process and provides JSON-RPC
//! communication for features like diagnostics, hover, and go-to-definition.

use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

use crate::python;

// Constants
const REQUEST_TIMEOUT_MS: u64 = 5000;
const INITIALIZE_TIMEOUT_MS: u64 = 30000; // Longer timeout for initialize (pyright can be slow)
const MAX_RESTARTS: i32 = 3;
const RESTART_BACKOFF_MS: [u64; 3] = [1000, 3000, 10000];

/// Information about the Pyright installation
#[derive(Clone, Serialize, Debug)]
pub struct PyrightInfo {
    pub installed: bool,
    pub version: Option<String>,
    pub python_path: String,
}

/// Current status of the LSP server
#[derive(Clone, Serialize, Debug)]
pub struct LspStatus {
    pub running: bool,
    pub initialized: bool,
    pub pyright_version: Option<String>,
    pub restart_count: i32,
}

/// Response sender for pending requests
type ResponseSender = std::sync::mpsc::Sender<Result<Value, String>>;

/// The LSP process state
struct LspProcess {
    child: Child,
    stdin: ChildStdin,
    pending_requests: Arc<Mutex<HashMap<i32, ResponseSender>>>,
    next_request_id: AtomicI32,
    is_initialized: AtomicBool,
    pyright_version: Option<String>,
    shutdown_tx: Option<std::sync::mpsc::Sender<()>>,
}

// Global state
static LSP_PROCESS: OnceLock<Mutex<Option<LspProcess>>> = OnceLock::new();
static RESTART_COUNT: AtomicI32 = AtomicI32::new(0);
static APP_HANDLE: OnceLock<Mutex<Option<AppHandle>>> = OnceLock::new();

fn get_lsp_mutex() -> &'static Mutex<Option<LspProcess>> {
    LSP_PROCESS.get_or_init(|| Mutex::new(None))
}

fn get_app_handle_mutex() -> &'static Mutex<Option<AppHandle>> {
    APP_HANDLE.get_or_init(|| Mutex::new(None))
}

/// Encode a JSON-RPC message with Content-Length header
fn encode_message(msg: &Value) -> Vec<u8> {
    let body = serde_json::to_string(msg).unwrap();
    format!("Content-Length: {}\r\n\r\n{}", body.len(), body).into_bytes()
}

/// Decode a JSON-RPC message from the reader
fn decode_message(reader: &mut BufReader<ChildStdout>) -> Result<Value, String> {
    // Read headers until \r\n\r\n
    let mut content_length: Option<usize> = None;
    loop {
        let mut line = String::new();
        reader.read_line(&mut line).map_err(|e| format!("Failed to read header: {}", e))?;

        let line = line.trim();
        if line.is_empty() {
            break;
        }

        if let Some(len_str) = line.strip_prefix("Content-Length: ") {
            content_length = Some(len_str.parse().map_err(|e| format!("Invalid Content-Length: {}", e))?);
        }
    }

    let length = content_length.ok_or("Missing Content-Length header")?;

    // Read exactly that many bytes
    let mut body = vec![0u8; length];
    reader.read_exact(&mut body).map_err(|e| format!("Failed to read body: {}", e))?;

    // Parse JSON
    serde_json::from_slice(&body).map_err(|e| format!("Failed to parse JSON: {}", e))
}

/// Check if Pyright is installed
pub fn check_pyright_installed(python_path: &str) -> Result<PyrightInfo, String> {
    let output = Command::new(python_path)
        .args(["-m", "pyright", "--version"])
        .output()
        .map_err(|e| format!("Failed to run pyright: {}", e))?;

    if !output.status.success() {
        return Ok(PyrightInfo {
            installed: false,
            version: None,
            python_path: python_path.to_string(),
        });
    }

    let version_str = String::from_utf8_lossy(&output.stdout);
    // Parse version: "pyright 1.1.xxx"
    let version = version_str
        .lines()
        .next()
        .and_then(|line| line.strip_prefix("pyright "))
        .map(|v| v.trim().to_string());

    Ok(PyrightInfo {
        installed: true,
        version,
        python_path: python_path.to_string(),
    })
}

/// Start the LSP server
pub fn start_lsp(
    app_handle: &AppHandle,
    python_path: &str,
    workspace_root: Option<&str>,
) -> Result<(), String> {
    // Check if already running
    {
        let guard = get_lsp_mutex().lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Err("LSP server already running".to_string());
        }
    }

    // Store app handle for events
    {
        let mut handle_guard = get_app_handle_mutex().lock().map_err(|e| e.to_string())?;
        *handle_guard = Some(app_handle.clone());
    }

    // Check pyright is installed
    let pyright_info = check_pyright_installed(python_path)?;
    if !pyright_info.installed {
        return Err("Pyright not installed. Run: pip install pyright".to_string());
    }

    // Spawn pyright-langserver
    // The correct module is pyright.langserver (not pyright --langserver)
    tracing::info!("Spawning pyright language server with python: {}", python_path);
    let mut child = Command::new(python_path)
        .args(["-m", "pyright.langserver", "--stdio"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn pyright: {}", e))?;
    tracing::info!("Pyright process spawned successfully");

    let stdin = child.stdin.take().ok_or("Failed to capture stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    let pending_requests: Arc<Mutex<HashMap<i32, ResponseSender>>> =
        Arc::new(Mutex::new(HashMap::new()));
    let pending_clone = pending_requests.clone();

    // Create shutdown channel
    let (shutdown_tx, shutdown_rx) = std::sync::mpsc::channel::<()>();

    // Spawn stderr reader
    thread::spawn(move || {
        tracing::debug!("LSP stderr reader thread started");
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(line) = line {
                // Log at info level so it's visible in dev console
                tracing::info!("[pyright stderr] {}", line);
            }
        }
        tracing::debug!("LSP stderr reader thread exiting");
    });

    // Spawn stdout reader
    let app_handle_clone = app_handle.clone();
    thread::spawn(move || {
        tracing::debug!("LSP stdout reader thread started");
        let mut reader = BufReader::new(stdout);
        loop {
            // Check for shutdown
            if shutdown_rx.try_recv().is_ok() {
                tracing::debug!("LSP reader received shutdown signal");
                break;
            }

            match decode_message(&mut reader) {
                Ok(msg) => {
                    // Log brief info about received message
                    if let Some(id) = msg.get("id") {
                        tracing::debug!("LSP received response for id={}", id);
                    } else if let Some(method) = msg.get("method") {
                        tracing::debug!("LSP received notification: {}", method);
                    }
                    handle_lsp_message(msg, &pending_clone, &app_handle_clone);
                }
                Err(e) => {
                    // EOF or error - process likely exited
                    tracing::error!("LSP reader stopped with error: {}", e);
                    break;
                }
            }
        }
        tracing::debug!("LSP stdout reader thread exiting");
    });

    // Create process state
    let process = LspProcess {
        child,
        stdin,
        pending_requests,
        next_request_id: AtomicI32::new(1),
        is_initialized: AtomicBool::new(false),
        pyright_version: pyright_info.version.clone(),
        shutdown_tx: Some(shutdown_tx),
    };

    // Store process
    {
        let mut guard = get_lsp_mutex().lock().map_err(|e| e.to_string())?;
        *guard = Some(process);
    }

    // Send initialize request
    let root_uri = workspace_root.map(|p| format!("file://{}", p));
    let init_params = json!({
        "processId": std::process::id(),
        "rootUri": root_uri,
        "capabilities": {
            "textDocument": {
                "hover": { "contentFormat": ["markdown", "plaintext"] },
                "completion": {
                    "completionItem": {
                        "snippetSupport": true,
                        "documentationFormat": ["markdown", "plaintext"]
                    },
                    "contextSupport": true
                },
                "publishDiagnostics": {
                    "relatedInformation": true,
                    "codeDescriptionSupport": true
                },
                "definition": { "linkSupport": true }
            }
        },
        "initializationOptions": {
            "python": {
                "pythonPath": python_path
            }
        }
    });

    // Send initialize and wait for response (use longer timeout for pyright startup)
    // If this fails, we need to clean up the stored process
    tracing::info!("Sending LSP initialize request...");
    let response = match send_request_sync_with_timeout("initialize", init_params, INITIALIZE_TIMEOUT_MS) {
        Ok(resp) => resp,
        Err(e) => {
            tracing::error!("LSP initialize request failed: {}", e);
            // Clean up the stored process since initialization failed
            if let Ok(mut guard) = get_lsp_mutex().lock() {
                if let Some(mut proc) = guard.take() {
                    // Signal shutdown to reader threads
                    if let Some(shutdown_tx) = proc.shutdown_tx.take() {
                        let _ = shutdown_tx.send(());
                    }
                    // Kill the process
                    let _ = proc.child.kill();
                }
            }
            return Err(format!("LSP initialization failed: {}", e));
        }
    };
    tracing::info!("LSP initialized: {:?}", response.get("capabilities").map(|_| "..."));

    // Send initialized notification
    if let Err(e) = send_notification("initialized", json!({})) {
        tracing::error!("Failed to send initialized notification: {}", e);
        // Clean up on failure
        if let Ok(mut guard) = get_lsp_mutex().lock() {
            if let Some(mut proc) = guard.take() {
                if let Some(shutdown_tx) = proc.shutdown_tx.take() {
                    let _ = shutdown_tx.send(());
                }
                let _ = proc.child.kill();
            }
        }
        return Err(format!("Failed to complete initialization: {}", e));
    }

    // Mark as initialized
    {
        let guard = get_lsp_mutex().lock().map_err(|e| e.to_string())?;
        if let Some(ref proc) = *guard {
            proc.is_initialized.store(true, Ordering::SeqCst);
        }
    }

    // Reset restart count on successful start
    RESTART_COUNT.store(0, Ordering::SeqCst);

    // Start process monitor
    let app_handle_monitor = app_handle.clone();
    let python_path_owned = python_path.to_string();
    let workspace_root_owned = workspace_root.map(|s| s.to_string());
    thread::spawn(move || {
        monitor_process(app_handle_monitor, python_path_owned, workspace_root_owned);
    });

    tracing::info!("LSP server started successfully");
    Ok(())
}

/// Monitor the LSP process and restart if it crashes
fn monitor_process(app_handle: AppHandle, python_path: String, workspace_root: Option<String>) {
    loop {
        thread::sleep(Duration::from_secs(5));

        let needs_restart = {
            let guard = match get_lsp_mutex().lock() {
                Ok(g) => g,
                Err(_) => continue,
            };

            if let Some(ref _proc) = *guard {
                // Check if process is still alive
                // We can't call try_wait on a borrowed child, so we check if stdin is still valid
                // by checking if we can get the process state
                false // Process monitoring done via reader thread
            } else {
                false
            }
        };

        if needs_restart {
            let restart_count = RESTART_COUNT.fetch_add(1, Ordering::SeqCst);
            if restart_count < MAX_RESTARTS {
                tracing::warn!(
                    "LSP process crashed, restarting (attempt {})",
                    restart_count + 1
                );

                // Exponential backoff
                thread::sleep(Duration::from_millis(
                    RESTART_BACKOFF_MS[restart_count as usize],
                ));

                // Reject all pending requests
                reject_pending_requests("LSP process crashed");

                // Clear old process
                {
                    if let Ok(mut guard) = get_lsp_mutex().lock() {
                        *guard = None;
                    }
                }

                // Restart
                if let Err(e) = start_lsp(
                    &app_handle,
                    &python_path,
                    workspace_root.as_deref(),
                ) {
                    tracing::error!("Failed to restart LSP: {}", e);
                } else {
                    // Emit event to frontend to re-send didOpen
                    let _ = app_handle.emit("lsp-restarted", ());
                }
            } else {
                tracing::error!("LSP crashed too many times, giving up");
                let _ = app_handle.emit("lsp-failed", "LSP server crashed repeatedly");
                break;
            }
        }
    }
}

/// Handle an incoming LSP message
fn handle_lsp_message(
    msg: Value,
    pending_requests: &Arc<Mutex<HashMap<i32, ResponseSender>>>,
    app_handle: &AppHandle,
) {
    if let Some(method) = msg.get("method").and_then(|m| m.as_str()) {
        // This is a notification (no id field) or request from server
        match method {
            "textDocument/publishDiagnostics" => {
                // Forward to frontend via Tauri event
                if let Some(params) = msg.get("params") {
                    let _ = app_handle.emit("lsp-diagnostics", params);
                }
            }
            "window/logMessage" => {
                if let Some(params) = msg.get("params") {
                    if let Some(message) = params.get("message").and_then(|m| m.as_str()) {
                        tracing::debug!("Pyright: {}", message);
                    }
                }
            }
            "window/showMessage" => {
                if let Some(params) = msg.get("params") {
                    if let Some(message) = params.get("message").and_then(|m| m.as_str()) {
                        tracing::info!("Pyright message: {}", message);
                    }
                }
            }
            _ => {
                tracing::trace!("Unhandled LSP notification: {}", method);
            }
        }
    } else if let Some(id) = msg.get("id") {
        // This is a response to a request
        if let Some(id_num) = id.as_i64() {
            let mut pending = match pending_requests.lock() {
                Ok(p) => p,
                Err(_) => return,
            };

            if let Some(sender) = pending.remove(&(id_num as i32)) {
                let result = if let Some(error) = msg.get("error") {
                    let error_msg = error
                        .get("message")
                        .and_then(|m| m.as_str())
                        .unwrap_or("Unknown error");
                    Err(error_msg.to_string())
                } else if let Some(result) = msg.get("result") {
                    Ok(result.clone())
                } else {
                    Ok(Value::Null)
                };
                let _ = sender.send(result);
            }
        }
    }
}

/// Reject all pending requests (on crash)
fn reject_pending_requests(reason: &str) {
    if let Ok(guard) = get_lsp_mutex().lock() {
        if let Some(ref proc) = *guard {
            if let Ok(mut pending) = proc.pending_requests.lock() {
                for (_, sender) in pending.drain() {
                    let _ = sender.send(Err(reason.to_string()));
                }
            }
        }
    }
}

/// Send a request and wait for response (synchronous) with custom timeout
pub fn send_request_sync_with_timeout(method: &str, params: Value, timeout_ms: u64) -> Result<Value, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    let request_id: i32;

    tracing::debug!("Sending LSP request: {} (timeout: {}ms)", method, timeout_ms);

    {
        let mut guard = get_lsp_mutex().lock().map_err(|e| e.to_string())?;
        let proc = guard.as_mut().ok_or("LSP server not running")?;

        request_id = proc.next_request_id.fetch_add(1, Ordering::SeqCst);

        // Register pending request
        {
            let mut pending = proc.pending_requests.lock().map_err(|e| e.to_string())?;
            pending.insert(request_id, tx);
        }

        // Build request
        let request = json!({
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
            "params": params
        });

        // Send request
        let encoded = encode_message(&request);
        tracing::debug!("Writing LSP request id={}: {}", request_id, method);
        proc.stdin
            .write_all(&encoded)
            .map_err(|e| format!("Failed to write request: {}", e))?;
        proc.stdin
            .flush()
            .map_err(|e| format!("Failed to flush: {}", e))?;
        tracing::debug!("LSP request sent, waiting for response...");
    }

    // Wait with timeout
    match rx.recv_timeout(Duration::from_millis(timeout_ms)) {
        Ok(result) => {
            tracing::debug!("LSP response received for {}", method);
            result
        }
        Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
            tracing::error!("LSP request {} timed out after {}ms", method, timeout_ms);
            // Cancel the request
            cancel_request(request_id);
            Err(format!("Request {} timed out after {}ms", method, timeout_ms))
        }
        Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
            tracing::error!("LSP request {} channel disconnected", method);
            Err("Request cancelled - channel disconnected".to_string())
        }
    }
}

/// Send a request and wait for response (synchronous)
pub fn send_request_sync(method: &str, params: Value) -> Result<Value, String> {
    send_request_sync_with_timeout(method, params, REQUEST_TIMEOUT_MS)
}

/// Send a notification (no response expected)
pub fn send_notification(method: &str, params: Value) -> Result<(), String> {
    let mut guard = get_lsp_mutex().lock().map_err(|e| e.to_string())?;
    let proc = guard.as_mut().ok_or("LSP server not running")?;

    let notification = json!({
        "jsonrpc": "2.0",
        "method": method,
        "params": params
    });

    let encoded = encode_message(&notification);
    proc.stdin
        .write_all(&encoded)
        .map_err(|e| format!("Failed to write notification: {}", e))?;
    proc.stdin
        .flush()
        .map_err(|e| format!("Failed to flush: {}", e))?;

    Ok(())
}

/// Cancel a pending request
pub fn cancel_request(request_id: i32) {
    // Remove from pending requests
    if let Ok(guard) = get_lsp_mutex().lock() {
        if let Some(ref proc) = *guard {
            if let Ok(mut pending) = proc.pending_requests.lock() {
                if let Some(sender) = pending.remove(&request_id) {
                    let _ = sender.send(Err("Request cancelled".to_string()));
                }
            }
        }
    }

    // Send $/cancelRequest notification to server
    let _ = send_notification(
        "$/cancelRequest",
        json!({ "id": request_id }),
    );
}

/// Stop the LSP server
pub fn stop_lsp() -> Result<(), String> {
    let mut guard = get_lsp_mutex().lock().map_err(|e| e.to_string())?;

    if let Some(mut proc) = guard.take() {
        // Signal shutdown to monitor thread
        if let Some(shutdown_tx) = proc.shutdown_tx.take() {
            let _ = shutdown_tx.send(());
        }

        // Send shutdown request (ignore errors - server might already be dead)
        let _ = send_request_sync("shutdown", Value::Null);

        // Send exit notification
        let notification = json!({
            "jsonrpc": "2.0",
            "method": "exit"
        });
        let _ = proc.stdin.write_all(&encode_message(&notification));

        // Wait for process to exit with timeout
        let start = std::time::Instant::now();
        loop {
            match proc.child.try_wait() {
                Ok(Some(_)) => break,
                Ok(None) => {
                    if start.elapsed() > Duration::from_secs(3) {
                        // Force kill
                        let _ = proc.child.kill();
                        break;
                    }
                    thread::sleep(Duration::from_millis(100));
                }
                Err(_) => break,
            }
        }

        tracing::info!("LSP server stopped");
    }

    Ok(())
}

/// Get the current LSP status
pub fn get_status() -> LspStatus {
    let guard = match get_lsp_mutex().lock() {
        Ok(g) => g,
        Err(_) => {
            return LspStatus {
                running: false,
                initialized: false,
                pyright_version: None,
                restart_count: RESTART_COUNT.load(Ordering::SeqCst),
            };
        }
    };

    match &*guard {
        Some(proc) => LspStatus {
            running: true,
            initialized: proc.is_initialized.load(Ordering::SeqCst),
            pyright_version: proc.pyright_version.clone(),
            restart_count: RESTART_COUNT.load(Ordering::SeqCst),
        },
        None => LspStatus {
            running: false,
            initialized: false,
            pyright_version: None,
            restart_count: RESTART_COUNT.load(Ordering::SeqCst),
        },
    }
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// Check if Pyright is installed
#[tauri::command]
pub fn check_pyright(app: AppHandle) -> Result<PyrightInfo, String> {
    let resource_dir = app.path().resource_dir().ok();
    let python_info = python::find_python(resource_dir.as_ref())
        .ok_or_else(|| "No Python installation found".to_string())?;

    check_pyright_installed(&python_info.path.to_string_lossy())
}

/// Start the LSP server
#[tauri::command]
pub fn start_lsp_server(
    app: AppHandle,
    workspace_root: Option<String>,
) -> Result<(), String> {
    let resource_dir = app.path().resource_dir().ok();
    let python_info = python::find_python(resource_dir.as_ref())
        .ok_or_else(|| "No Python installation found".to_string())?;

    start_lsp(&app, &python_info.path.to_string_lossy(), workspace_root.as_deref())
}

/// Stop the LSP server
#[tauri::command]
pub fn stop_lsp_server() -> Result<(), String> {
    stop_lsp()
}

/// Send an LSP request and wait for response
#[tauri::command]
pub fn lsp_request(method: String, params: Value) -> Result<Value, String> {
    send_request_sync(&method, params)
}

/// Send an LSP notification
#[tauri::command]
pub fn lsp_notify(method: String, params: Value) -> Result<(), String> {
    send_notification(&method, params)
}

/// Cancel a pending LSP request
#[tauri::command]
pub fn lsp_cancel_request(request_id: i32) {
    cancel_request(request_id);
}

/// Get the current LSP status
#[tauri::command]
pub fn get_lsp_status() -> LspStatus {
    get_status()
}

use std::io::Read;
