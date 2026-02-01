use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;

#[derive(Serialize, Deserialize)]
pub struct PipelineMetadata {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

static DB: std::sync::OnceLock<Mutex<Connection>> = std::sync::OnceLock::new();

pub fn init_db(app_data_dir: &Path) -> Result<()> {
    let db_path = app_data_dir.join("settings.db");
    let conn = Connection::open(&db_path)?;

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

    DB.set(Mutex::new(conn)).map_err(|_| {
        rusqlite::Error::InvalidParameterName("DB already initialized".to_string())
    })?;

    Ok(())
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
