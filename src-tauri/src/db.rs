use rusqlite::{Connection, Result};
use std::path::Path;
use std::sync::Mutex;

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
