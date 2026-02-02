use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;

const DB_VERSION: i32 = 2; // v1 = settings+pipelines, v2 = +runs+metrics

#[derive(Serialize, Deserialize)]
pub struct PipelineMetadata {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct RunMetadata {
    pub id: String,
    pub pipeline_name: String,
    pub status: String,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub duration_ms: Option<i64>,
    pub hyperparameters: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Metric {
    pub name: String,
    pub value: Option<f64>,
    pub value_json: Option<String>,
}

static DB: std::sync::OnceLock<Mutex<Connection>> = std::sync::OnceLock::new();
static APP_DATA_DIR: std::sync::OnceLock<std::path::PathBuf> = std::sync::OnceLock::new();

pub fn init_db(app_data_dir: &Path) -> Result<()> {
    // Store app data dir for artifact management
    let _ = APP_DATA_DIR.set(app_data_dir.to_path_buf());

    let db_path = app_data_dir.join("settings.db");
    let conn = Connection::open(&db_path)?;

    // Check current version
    let version: i32 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap_or(0);

    // v1 tables (settings, pipelines)
    if version < 1 {
        conn.execute(
            "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS pipelines (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                data TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;
    }

    // v2 tables (runs, run_metrics)
    if version < 2 {
        conn.execute(
            "CREATE TABLE IF NOT EXISTS runs (
                id TEXT PRIMARY KEY,
                pipeline_name TEXT NOT NULL,
                status TEXT NOT NULL,
                started_at TEXT NOT NULL,
                completed_at TEXT,
                duration_ms INTEGER,
                hyperparameters TEXT,
                error_message TEXT
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS run_metrics (
                run_id TEXT NOT NULL,
                name TEXT NOT NULL,
                value REAL,
                value_json TEXT,
                PRIMARY KEY (run_id, name),
                FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
            )",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_runs_pipeline ON runs(pipeline_name)",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at DESC)",
            [],
        )?;
    }

    // Update version
    conn.pragma_update(None, "user_version", DB_VERSION)?;

    DB.set(Mutex::new(conn)).map_err(|_| {
        rusqlite::Error::InvalidParameterName("DB already initialized".to_string())
    })?;

    Ok(())
}

fn get_artifacts_dir() -> Result<std::path::PathBuf> {
    let app_data_dir = APP_DATA_DIR
        .get()
        .ok_or(rusqlite::Error::InvalidQuery)?;
    Ok(app_data_dir.join("artifacts"))
}

pub fn get_setting(key: &str) -> Option<String> {
    let conn = DB.get()?.lock().ok()?;
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        [key],
        |row| row.get(0),
    )
    .ok()
}

pub fn set_setting(key: &str, value: &str) -> Result<()> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        [key, value],
    )?;
    Ok(())
}

// Pipeline CRUD operations

pub fn save_pipeline(id: &str, name: &str, data: &str) -> Result<()> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    conn.execute(
        "INSERT INTO pipelines (id, name, data, created_at, updated_at)
         VALUES (?1, ?2, ?3, datetime('now'), datetime('now'))
         ON CONFLICT(id) DO UPDATE SET name = ?2, data = ?3, updated_at = datetime('now')",
        [id, name, data],
    )?;
    Ok(())
}

pub fn load_pipeline(id: &str) -> Result<Option<String>> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    let result = conn.query_row(
        "SELECT data FROM pipelines WHERE id = ?1",
        [id],
        |row| row.get(0),
    );
    match result {
        Ok(data) => Ok(Some(data)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn list_pipelines() -> Result<Vec<PipelineMetadata>> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    let mut stmt = conn.prepare(
        "SELECT id, name, created_at, updated_at FROM pipelines ORDER BY updated_at DESC"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(PipelineMetadata {
            id: row.get(0)?,
            name: row.get(1)?,
            created_at: row.get(2)?,
            updated_at: row.get(3)?,
        })
    })?;
    rows.collect()
}

pub fn delete_pipeline(id: &str) -> Result<()> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    conn.execute("DELETE FROM pipelines WHERE id = ?1", [id])?;
    Ok(())
}

// Run CRUD operations

pub fn create_run(id: &str, pipeline_name: &str, hyperparameters: &str) -> Result<()> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO runs (id, pipeline_name, status, started_at, hyperparameters)
         VALUES (?1, ?2, 'running', ?3, ?4)",
        [id, pipeline_name, &now, hyperparameters],
    )?;
    Ok(())
}

pub fn update_run(id: &str, status: &str, duration_ms: Option<i64>, error: Option<&str>) -> Result<()> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE runs SET status = ?2, completed_at = ?3, duration_ms = ?4, error_message = ?5 WHERE id = ?1",
        rusqlite::params![id, status, now, duration_ms, error],
    )?;
    Ok(())
}

pub fn save_run_metrics(run_id: &str, metrics: &[Metric]) -> Result<()> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    for metric in metrics {
        conn.execute(
            "INSERT OR REPLACE INTO run_metrics (run_id, name, value, value_json)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![run_id, metric.name, metric.value, metric.value_json],
        )?;
    }
    Ok(())
}

pub fn list_runs(pipeline_name: Option<&str>) -> Result<Vec<RunMetadata>> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;

    let query = match pipeline_name {
        Some(_) => "SELECT id, pipeline_name, status, started_at, completed_at, duration_ms, hyperparameters, error_message
                    FROM runs WHERE pipeline_name = ?1 ORDER BY started_at DESC",
        None => "SELECT id, pipeline_name, status, started_at, completed_at, duration_ms, hyperparameters, error_message
                 FROM runs ORDER BY started_at DESC",
    };

    let mut stmt = conn.prepare(query)?;

    let rows = if let Some(name) = pipeline_name {
        stmt.query_map([name], map_run_row)?
    } else {
        stmt.query_map([], map_run_row)?
    };

    rows.collect()
}

fn map_run_row(row: &rusqlite::Row) -> Result<RunMetadata> {
    Ok(RunMetadata {
        id: row.get(0)?,
        pipeline_name: row.get(1)?,
        status: row.get(2)?,
        started_at: row.get(3)?,
        completed_at: row.get(4)?,
        duration_ms: row.get(5)?,
        hyperparameters: row.get(6)?,
        error_message: row.get(7)?,
    })
}

pub fn get_run_metrics(run_id: &str) -> Result<Vec<Metric>> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    let mut stmt = conn.prepare(
        "SELECT name, value, value_json FROM run_metrics WHERE run_id = ?1"
    )?;
    let rows = stmt.query_map([run_id], |row| {
        Ok(Metric {
            name: row.get(0)?,
            value: row.get(1)?,
            value_json: row.get(2)?,
        })
    })?;
    rows.collect()
}

pub fn delete_run(id: &str) -> Result<()> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    conn.execute("DELETE FROM runs WHERE id = ?1", [id])?;

    // Delete artifact directory
    if let Ok(artifacts_dir) = get_artifacts_dir() {
        let run_artifacts = artifacts_dir.join(id);
        if run_artifacts.exists() {
            let _ = std::fs::remove_dir_all(&run_artifacts);
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Once;

    static INIT: Once = Once::new();

    fn setup_test_db() {
        INIT.call_once(|| {
            // Use the target directory for test db
            let test_dir = std::path::PathBuf::from("target/test-db");
            std::fs::create_dir_all(&test_dir).unwrap();
            init_db(&test_dir).unwrap();
        });
    }

    #[test]
    fn test_settings_crud() {
        setup_test_db();

        // Set a setting
        set_setting("test_key", "test_value").unwrap();

        // Get it back
        let value = get_setting("test_key");
        assert_eq!(value, Some("test_value".to_string()));

        // Update it
        set_setting("test_key", "updated_value").unwrap();
        let value = get_setting("test_key");
        assert_eq!(value, Some("updated_value".to_string()));

        // Non-existent key
        let missing = get_setting("nonexistent");
        assert_eq!(missing, None);
    }

    #[test]
    fn test_pipeline_save_and_load() {
        setup_test_db();

        let id = "test-pipeline-1";
        let name = "Test Pipeline";
        let data = r#"{"nodes":[],"edges":[]}"#;

        // Save pipeline
        save_pipeline(id, name, data).unwrap();

        // Load it back
        let loaded = load_pipeline(id).unwrap();
        assert_eq!(loaded, Some(data.to_string()));
    }

    #[test]
    fn test_pipeline_list() {
        setup_test_db();

        // Save a couple pipelines
        save_pipeline("list-test-1", "Pipeline A", "{}").unwrap();
        save_pipeline("list-test-2", "Pipeline B", "{}").unwrap();

        // List them
        let pipelines = list_pipelines().unwrap();
        assert!(pipelines.len() >= 2);

        let names: Vec<&str> = pipelines.iter().map(|p| p.name.as_str()).collect();
        assert!(names.contains(&"Pipeline A"));
        assert!(names.contains(&"Pipeline B"));
    }

    #[test]
    fn test_pipeline_update() {
        setup_test_db();

        let id = "update-test";

        // Create
        save_pipeline(id, "Original Name", r#"{"v":1}"#).unwrap();

        // Update
        save_pipeline(id, "Updated Name", r#"{"v":2}"#).unwrap();

        // Verify update
        let loaded = load_pipeline(id).unwrap();
        assert_eq!(loaded, Some(r#"{"v":2}"#.to_string()));

        // Verify only one entry
        let pipelines = list_pipelines().unwrap();
        let count = pipelines.iter().filter(|p| p.id == id).count();
        assert_eq!(count, 1);
    }

    #[test]
    fn test_pipeline_delete() {
        setup_test_db();

        let id = "delete-test";
        save_pipeline(id, "To Delete", "{}").unwrap();

        // Verify exists
        let loaded = load_pipeline(id).unwrap();
        assert!(loaded.is_some());

        // Delete
        delete_pipeline(id).unwrap();

        // Verify gone
        let loaded = load_pipeline(id).unwrap();
        assert!(loaded.is_none());
    }

    #[test]
    fn test_load_nonexistent_pipeline() {
        setup_test_db();

        let loaded = load_pipeline("does-not-exist").unwrap();
        assert!(loaded.is_none());
    }
}
