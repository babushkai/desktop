use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;

const DB_VERSION: i32 = 9; // v1 = settings+pipelines, v2 = +runs+metrics, v3 = +models+model_versions, v4 = +feature_names, v5 = +tuning_sessions+tuning_trials, v6 = +experiments+run_annotations, v7 = +model_metadata+model_tags+export_paths, v8 = +node_embeddings, v9 = +chunk_embeddings

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
    pub experiment_id: Option<String>,
    pub experiment_name: Option<String>, // Joined from experiments table
    pub display_name: Option<String>,
    pub notes: Option<String>,           // Joined from run_notes table
    pub tags: Option<Vec<String>>,       // Joined from run_tags table
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Experiment {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub status: String, // 'active' | 'completed' | 'archived'
    pub created_at: String,
    pub updated_at: String,
    pub run_count: Option<i64>, // Computed in query
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Metric {
    pub name: String,
    pub value: Option<f64>,
    pub value_json: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ModelMetadata {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub version_count: i64,
    pub latest_version: Option<i64>,
    pub production_version: Option<i64>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ModelVersion {
    pub id: String,
    pub model_id: String,
    pub version: i64,
    pub run_id: Option<String>,
    pub file_path: String,
    pub file_size: Option<i64>,
    pub format: String,
    pub stage: String,
    pub metrics_snapshot: Option<String>,
    pub feature_names: Option<String>, // JSON array of feature names
    pub created_at: String,
    pub promoted_at: Option<String>,
    // v9: Enhanced model metadata
    pub description: Option<String>,
    pub notes: Option<String>,
    pub onnx_path: Option<String>,
    pub coreml_path: Option<String>,
    pub n_features: Option<i64>,
    pub tags: Option<Vec<String>>, // Populated separately from model_tags table
}

#[derive(Serialize, Deserialize, Clone)]
pub struct TuningSession {
    pub id: String,
    pub run_id: String,
    pub sampler: String,
    pub search_space: String, // JSON
    pub n_trials: Option<i32>,
    pub cv_folds: i32,
    pub scoring_metric: String,
    pub status: String,
    pub best_trial_id: Option<String>,
    pub created_at: String,
    pub completed_at: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct TuningTrial {
    pub id: String,
    pub session_id: String,
    pub trial_number: i32,
    pub hyperparameters: String, // JSON
    pub score: Option<f64>,
    pub duration_ms: Option<i64>,
    pub status: String,
    pub error_message: Option<String>,
    pub created_at: String,
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

    // v3 tables (models, model_versions)
    if version < 3 {
        conn.execute(
            "CREATE TABLE IF NOT EXISTS models (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                description TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS model_versions (
                id TEXT PRIMARY KEY,
                model_id TEXT NOT NULL,
                version INTEGER NOT NULL,
                run_id TEXT,
                file_path TEXT NOT NULL,
                file_size INTEGER,
                format TEXT NOT NULL,
                stage TEXT DEFAULT 'none',
                metrics_snapshot TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                promoted_at TEXT,
                FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE,
                FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE SET NULL,
                UNIQUE (model_id, version)
            )",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_model_versions_model ON model_versions(model_id)",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_model_versions_stage ON model_versions(stage)",
            [],
        )?;
    }

    // v4 migration (add feature_names to model_versions)
    if version < 4 {
        conn.execute(
            "ALTER TABLE model_versions ADD COLUMN feature_names TEXT",
            [],
        )?;
    }

    // v5 tables (tuning_sessions, tuning_trials)
    if version < 5 {
        conn.execute(
            "CREATE TABLE IF NOT EXISTS tuning_sessions (
                id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL,
                sampler TEXT NOT NULL,
                search_space TEXT NOT NULL,
                n_trials INTEGER,
                cv_folds INTEGER DEFAULT 3,
                scoring_metric TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                best_trial_id TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                completed_at TEXT,
                FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS tuning_trials (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                trial_number INTEGER NOT NULL,
                hyperparameters TEXT NOT NULL,
                score REAL,
                duration_ms INTEGER,
                status TEXT DEFAULT 'pending',
                error_message TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES tuning_sessions(id) ON DELETE CASCADE
            )",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_trials_session ON tuning_trials(session_id)",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_trials_score ON tuning_trials(session_id, score DESC)",
            [],
        )?;
    }

    // v6 tables (experiments, run annotations)
    if version < 6 {
        // Experiments table (top-level, not per-pipeline)
        conn.execute(
            "CREATE TABLE IF NOT EXISTS experiments (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                description TEXT,
                status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;

        // Add experiment_id and display_name to runs table
        conn.execute(
            "ALTER TABLE runs ADD COLUMN experiment_id TEXT REFERENCES experiments(id) ON DELETE SET NULL",
            [],
        )?;

        conn.execute(
            "ALTER TABLE runs ADD COLUMN display_name TEXT",
            [],
        )?;

        // Run notes table (one per run)
        conn.execute(
            "CREATE TABLE IF NOT EXISTS run_notes (
                run_id TEXT PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
                content TEXT NOT NULL,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;

        // Run tags table (many per run, case-insensitive)
        conn.execute(
            "CREATE TABLE IF NOT EXISTS run_tags (
                run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
                tag TEXT NOT NULL COLLATE NOCASE,
                PRIMARY KEY (run_id, tag)
            )",
            [],
        )?;

        // Indexes for experiment queries
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_runs_experiment ON runs(experiment_id)",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_run_tags_tag ON run_tags(tag)",
            [],
        )?;
    }

    // v7 migration (model metadata, tags, export paths)
    if version < 7 {
        // Add metadata columns to model_versions
        conn.execute(
            "ALTER TABLE model_versions ADD COLUMN description TEXT",
            [],
        )?;
        conn.execute(
            "ALTER TABLE model_versions ADD COLUMN notes TEXT",
            [],
        )?;
        conn.execute(
            "ALTER TABLE model_versions ADD COLUMN onnx_path TEXT",
            [],
        )?;
        conn.execute(
            "ALTER TABLE model_versions ADD COLUMN coreml_path TEXT",
            [],
        )?;
        // Add training metadata for ONNX export (required for input shape)
        conn.execute(
            "ALTER TABLE model_versions ADD COLUMN n_features INTEGER",
            [],
        )?;
        // Model tags table (many per version, case-insensitive)
        conn.execute(
            "CREATE TABLE IF NOT EXISTS model_tags (
                version_id TEXT NOT NULL REFERENCES model_versions(id) ON DELETE CASCADE,
                tag TEXT NOT NULL COLLATE NOCASE,
                PRIMARY KEY (version_id, tag)
            )",
            [],
        )?;

        // Indexes for model queries
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_model_tags_tag ON model_tags(tag)",
            [],
        )?;
    }

    // v8 tables (node_embeddings for RAG)
    if version < 8 {
        // Node embeddings table for RAG-enhanced code completions
        // Stores pre-normalized embeddings as BLOBs for fast similarity search
        conn.execute(
            "CREATE TABLE IF NOT EXISTS node_embeddings (
                node_id TEXT PRIMARY KEY,
                pipeline_id TEXT NOT NULL,
                content_hash TEXT NOT NULL,
                embedding BLOB NOT NULL,
                embedding_model TEXT NOT NULL,
                embedding_dim INTEGER NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;

        // Index for fast lookup by pipeline
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_embeddings_pipeline ON node_embeddings(pipeline_id)",
            [],
        )?;
    }

    // v9 migration: chunk_embeddings for fine-grained RAG (AST-based chunking)
    if version < 9 {
        // Create new chunk_embeddings table with per-chunk granularity
        conn.execute(
            "CREATE TABLE IF NOT EXISTS chunk_embeddings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                node_id TEXT NOT NULL,
                pipeline_id TEXT NOT NULL,
                chunk_id TEXT NOT NULL,
                content_hash TEXT NOT NULL,
                embedding BLOB NOT NULL,
                embedding_model TEXT NOT NULL,
                embedding_dim INTEGER NOT NULL,
                symbol_name TEXT,
                symbol_type TEXT,
                start_line INTEGER,
                end_line INTEGER,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(node_id, chunk_id)
            )",
            [],
        )?;

        // Migrate existing node_embeddings as toplevel chunks (preserve existing embeddings)
        // Check if old table exists and has data before migrating
        let has_old_data: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM node_embeddings LIMIT 1)",
                [],
                |row| row.get(0),
            )
            .unwrap_or(false);

        if has_old_data {
            conn.execute(
                "INSERT INTO chunk_embeddings (
                    node_id, pipeline_id, chunk_id, content_hash, embedding,
                    embedding_model, embedding_dim, symbol_name, symbol_type,
                    start_line, end_line, created_at
                )
                SELECT
                    node_id, pipeline_id, 'toplevel:0', content_hash, embedding,
                    embedding_model, embedding_dim, NULL, 'toplevel',
                    0, NULL, created_at
                FROM node_embeddings",
                [],
            )?;
        }

        // Drop old table
        conn.execute("DROP TABLE IF EXISTS node_embeddings", [])?;

        // Create indexes for chunk_embeddings
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_chunk_pipeline ON chunk_embeddings(pipeline_id)",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_chunk_node ON chunk_embeddings(node_id)",
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

pub fn create_run(id: &str, pipeline_name: &str, hyperparameters: &str, experiment_id: Option<&str>) -> Result<()> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO runs (id, pipeline_name, status, started_at, hyperparameters, experiment_id)
         VALUES (?1, ?2, 'running', ?3, ?4, ?5)",
        rusqlite::params![id, pipeline_name, now, hyperparameters, experiment_id],
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

pub fn list_runs(pipeline_name: Option<&str>, experiment_id: Option<&str>) -> Result<Vec<RunMetadata>> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;

    // Build query with LEFT JOINs to include experiment name and notes
    let base_query = "SELECT r.id, r.pipeline_name, r.status, r.started_at, r.completed_at,
                             r.duration_ms, r.hyperparameters, r.error_message,
                             r.experiment_id, e.name as experiment_name, r.display_name,
                             rn.content as notes
                      FROM runs r
                      LEFT JOIN experiments e ON r.experiment_id = e.id
                      LEFT JOIN run_notes rn ON r.id = rn.run_id";

    let (query, params): (String, Vec<&str>) = match (pipeline_name, experiment_id) {
        (Some(pn), Some(eid)) => (
            format!("{} WHERE r.pipeline_name = ?1 AND r.experiment_id = ?2 ORDER BY r.started_at DESC", base_query),
            vec![pn, eid],
        ),
        (Some(pn), None) => (
            format!("{} WHERE r.pipeline_name = ?1 ORDER BY r.started_at DESC", base_query),
            vec![pn],
        ),
        (None, Some(eid)) => (
            format!("{} WHERE r.experiment_id = ?1 ORDER BY r.started_at DESC", base_query),
            vec![eid],
        ),
        (None, None) => (
            format!("{} ORDER BY r.started_at DESC", base_query),
            vec![],
        ),
    };

    let mut stmt = conn.prepare(&query)?;

    // Collect runs first without tags
    let mut runs: Vec<RunMetadata> = match params.len() {
        0 => stmt.query_map([], map_run_row)?.collect::<Result<Vec<_>>>()?,
        1 => stmt.query_map([params[0]], map_run_row)?.collect::<Result<Vec<_>>>()?,
        2 => stmt.query_map([params[0], params[1]], map_run_row)?.collect::<Result<Vec<_>>>()?,
        _ => vec![],
    };

    // Fetch tags for each run
    for run in &mut runs {
        run.tags = Some(get_run_tags_internal(&conn, &run.id)?);
    }

    Ok(runs)
}

fn get_run_tags_internal(conn: &Connection, run_id: &str) -> Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT tag FROM run_tags WHERE run_id = ?1 ORDER BY tag")?;
    let rows = stmt.query_map([run_id], |row| row.get(0))?;
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
        experiment_id: row.get(8)?,
        experiment_name: row.get(9)?,
        display_name: row.get(10)?,
        notes: row.get(11)?,
        tags: None, // Populated separately
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

// Experiment CRUD operations

pub fn create_experiment(id: &str, name: &str, description: Option<&str>) -> Result<()> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    conn.execute(
        "INSERT INTO experiments (id, name, description, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, 'active', datetime('now'), datetime('now'))",
        rusqlite::params![id, name, description],
    )?;
    Ok(())
}

pub fn update_experiment(id: &str, name: Option<&str>, description: Option<&str>, status: Option<&str>) -> Result<()> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;

    // Use separate queries based on what fields are provided
    // This avoids the complexity of dynamic param binding
    match (name, description, status) {
        (Some(n), Some(d), Some(s)) => {
            conn.execute(
                "UPDATE experiments SET name = ?2, description = ?3, status = ?4, updated_at = datetime('now') WHERE id = ?1",
                rusqlite::params![id, n, d, s],
            )?;
        }
        (Some(n), Some(d), None) => {
            conn.execute(
                "UPDATE experiments SET name = ?2, description = ?3, updated_at = datetime('now') WHERE id = ?1",
                rusqlite::params![id, n, d],
            )?;
        }
        (Some(n), None, Some(s)) => {
            conn.execute(
                "UPDATE experiments SET name = ?2, status = ?3, updated_at = datetime('now') WHERE id = ?1",
                rusqlite::params![id, n, s],
            )?;
        }
        (None, Some(d), Some(s)) => {
            conn.execute(
                "UPDATE experiments SET description = ?2, status = ?3, updated_at = datetime('now') WHERE id = ?1",
                rusqlite::params![id, d, s],
            )?;
        }
        (Some(n), None, None) => {
            conn.execute(
                "UPDATE experiments SET name = ?2, updated_at = datetime('now') WHERE id = ?1",
                rusqlite::params![id, n],
            )?;
        }
        (None, Some(d), None) => {
            conn.execute(
                "UPDATE experiments SET description = ?2, updated_at = datetime('now') WHERE id = ?1",
                rusqlite::params![id, d],
            )?;
        }
        (None, None, Some(s)) => {
            conn.execute(
                "UPDATE experiments SET status = ?2, updated_at = datetime('now') WHERE id = ?1",
                rusqlite::params![id, s],
            )?;
        }
        (None, None, None) => {
            conn.execute(
                "UPDATE experiments SET updated_at = datetime('now') WHERE id = ?1",
                [id],
            )?;
        }
    }
    Ok(())
}

pub fn list_experiments(include_archived: bool) -> Result<Vec<Experiment>> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;

    let query = if include_archived {
        "SELECT e.id, e.name, e.description, e.status, e.created_at, e.updated_at,
                (SELECT COUNT(*) FROM runs WHERE experiment_id = e.id) as run_count
         FROM experiments e
         ORDER BY e.updated_at DESC"
    } else {
        "SELECT e.id, e.name, e.description, e.status, e.created_at, e.updated_at,
                (SELECT COUNT(*) FROM runs WHERE experiment_id = e.id) as run_count
         FROM experiments e
         WHERE e.status != 'archived'
         ORDER BY e.updated_at DESC"
    };

    let mut stmt = conn.prepare(query)?;
    let rows = stmt.query_map([], |row| {
        Ok(Experiment {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            status: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
            run_count: row.get(6)?,
        })
    })?;
    rows.collect()
}

pub fn get_experiment(id: &str) -> Result<Option<Experiment>> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    let result = conn.query_row(
        "SELECT e.id, e.name, e.description, e.status, e.created_at, e.updated_at,
                (SELECT COUNT(*) FROM runs WHERE experiment_id = e.id) as run_count
         FROM experiments e WHERE e.id = ?1",
        [id],
        |row| {
            Ok(Experiment {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                status: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
                run_count: row.get(6)?,
            })
        },
    );
    match result {
        Ok(exp) => Ok(Some(exp)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn delete_experiment(id: &str) -> Result<()> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    // ON DELETE SET NULL will orphan runs when experiment is deleted
    conn.execute("DELETE FROM experiments WHERE id = ?1", [id])?;
    Ok(())
}

// Run Annotation operations

pub fn update_run_display_name(id: &str, display_name: Option<&str>) -> Result<()> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    conn.execute(
        "UPDATE runs SET display_name = ?2 WHERE id = ?1",
        rusqlite::params![id, display_name],
    )?;
    Ok(())
}

pub fn set_run_experiment(id: &str, experiment_id: Option<&str>) -> Result<()> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    conn.execute(
        "UPDATE runs SET experiment_id = ?2 WHERE id = ?1",
        rusqlite::params![id, experiment_id],
    )?;
    Ok(())
}

pub fn set_run_note(run_id: &str, content: &str) -> Result<()> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    conn.execute(
        "INSERT OR REPLACE INTO run_notes (run_id, content, updated_at)
         VALUES (?1, ?2, datetime('now'))",
        [run_id, content],
    )?;
    Ok(())
}

pub fn get_run_note(run_id: &str) -> Result<Option<String>> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    let result = conn.query_row(
        "SELECT content FROM run_notes WHERE run_id = ?1",
        [run_id],
        |row| row.get(0),
    );
    match result {
        Ok(content) => Ok(Some(content)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn delete_run_note(run_id: &str) -> Result<()> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    conn.execute("DELETE FROM run_notes WHERE run_id = ?1", [run_id])?;
    Ok(())
}

pub fn add_run_tag(run_id: &str, tag: &str) -> Result<()> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    conn.execute(
        "INSERT OR IGNORE INTO run_tags (run_id, tag) VALUES (?1, ?2)",
        [run_id, tag],
    )?;
    Ok(())
}

pub fn remove_run_tag(run_id: &str, tag: &str) -> Result<()> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    conn.execute(
        "DELETE FROM run_tags WHERE run_id = ?1 AND tag = ?2 COLLATE NOCASE",
        [run_id, tag],
    )?;
    Ok(())
}

pub fn get_run_tags(run_id: &str) -> Result<Vec<String>> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    get_run_tags_internal(&conn, run_id)
}

pub fn list_all_tags() -> Result<Vec<String>> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    let mut stmt = conn.prepare("SELECT DISTINCT tag FROM run_tags ORDER BY tag")?;
    let rows = stmt.query_map([], |row| row.get(0))?;
    rows.collect()
}

// Run Comparison operations

#[derive(Serialize, Deserialize, Clone)]
pub struct RunComparisonData {
    pub run_ids: Vec<String>,
    pub metrics: std::collections::HashMap<String, std::collections::HashMap<String, Option<f64>>>,
    pub hyperparameters: std::collections::HashMap<String, std::collections::HashMap<String, serde_json::Value>>,
}

pub fn get_runs_for_comparison(run_ids: &[String]) -> Result<RunComparisonData> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;

    let mut metrics: std::collections::HashMap<String, std::collections::HashMap<String, Option<f64>>> =
        std::collections::HashMap::new();
    let mut hyperparameters: std::collections::HashMap<String, std::collections::HashMap<String, serde_json::Value>> =
        std::collections::HashMap::new();

    for run_id in run_ids {
        // Get metrics for this run
        let mut run_metrics: std::collections::HashMap<String, Option<f64>> = std::collections::HashMap::new();
        let mut stmt = conn.prepare("SELECT name, value FROM run_metrics WHERE run_id = ?1")?;
        let rows = stmt.query_map([run_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<f64>>(1)?))
        })?;
        for row in rows {
            let (name, value) = row?;
            run_metrics.insert(name, value);
        }
        metrics.insert(run_id.clone(), run_metrics);

        // Get hyperparameters for this run
        let hp_json: Option<String> = conn.query_row(
            "SELECT hyperparameters FROM runs WHERE id = ?1",
            [run_id],
            |row| row.get(0),
        ).unwrap_or(None);

        let run_hp: std::collections::HashMap<String, serde_json::Value> = hp_json
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        hyperparameters.insert(run_id.clone(), run_hp);
    }

    Ok(RunComparisonData {
        run_ids: run_ids.to_vec(),
        metrics,
        hyperparameters,
    })
}

// Model Registry CRUD operations

fn get_models_dir() -> Result<std::path::PathBuf> {
    let app_data_dir = APP_DATA_DIR
        .get()
        .ok_or(rusqlite::Error::InvalidQuery)?;
    Ok(app_data_dir.join("models"))
}

pub fn create_model(id: &str, name: &str, description: Option<&str>) -> Result<()> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    conn.execute(
        "INSERT INTO models (id, name, description, created_at, updated_at)
         VALUES (?1, ?2, ?3, datetime('now'), datetime('now'))",
        rusqlite::params![id, name, description],
    )?;
    Ok(())
}

pub fn list_models() -> Result<Vec<ModelMetadata>> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    let mut stmt = conn.prepare(
        "SELECT
            m.id, m.name, m.description, m.created_at, m.updated_at,
            COUNT(mv.id) as version_count,
            MAX(mv.version) as latest_version,
            (SELECT version FROM model_versions WHERE model_id = m.id AND stage = 'production' LIMIT 1) as production_version
         FROM models m
         LEFT JOIN model_versions mv ON mv.model_id = m.id
         GROUP BY m.id
         ORDER BY m.updated_at DESC"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(ModelMetadata {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
            version_count: row.get(5)?,
            latest_version: row.get(6)?,
            production_version: row.get(7)?,
        })
    })?;
    rows.collect()
}

pub fn get_model(id: &str) -> Result<Option<ModelMetadata>> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    let result = conn.query_row(
        "SELECT
            m.id, m.name, m.description, m.created_at, m.updated_at,
            COUNT(mv.id) as version_count,
            MAX(mv.version) as latest_version,
            (SELECT version FROM model_versions WHERE model_id = m.id AND stage = 'production' LIMIT 1) as production_version
         FROM models m
         LEFT JOIN model_versions mv ON mv.model_id = m.id
         WHERE m.id = ?1
         GROUP BY m.id",
        [id],
        |row| {
            Ok(ModelMetadata {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
                version_count: row.get(5)?,
                latest_version: row.get(6)?,
                production_version: row.get(7)?,
            })
        },
    );
    match result {
        Ok(model) => Ok(Some(model)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn delete_model(id: &str) -> Result<()> {
    // First get all version file paths for cleanup
    let file_paths = {
        let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
            rusqlite::Error::InvalidQuery
        })?;
        let mut stmt = conn.prepare("SELECT file_path FROM model_versions WHERE model_id = ?1")?;
        let paths: Vec<String> = stmt.query_map([id], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();
        paths
    };

    // Delete from database (CASCADE will delete versions)
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    conn.execute("DELETE FROM models WHERE id = ?1", [id])?;

    // Delete model files
    for path in file_paths {
        let _ = std::fs::remove_file(&path);
    }

    // Try to remove model directory
    if let Ok(models_dir) = get_models_dir() {
        let model_dir = models_dir.join(id);
        let _ = std::fs::remove_dir_all(&model_dir);
    }

    Ok(())
}

pub fn register_model_version(
    version_id: &str,
    model_id: &str,
    run_id: Option<&str>,
    source_path: &str,
    format: &str,
    metrics_snapshot: Option<&str>,
    feature_names: Option<&str>,
) -> Result<i64> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;

    // Get next version number
    let next_version: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) + 1 FROM model_versions WHERE model_id = ?1",
            [model_id],
            |row| row.get(0),
        )
        .unwrap_or(1);

    // Create destination path
    let models_dir = get_models_dir()?;
    let version_dir = models_dir.join(model_id).join(format!("v{}", next_version));
    std::fs::create_dir_all(&version_dir).map_err(|_| rusqlite::Error::InvalidQuery)?;

    // Determine file extension from format
    let extension = match format {
        "joblib" => "joblib",
        "pickle" => "pkl",
        "onnx" => "onnx",
        "coreml" => "mlmodel",
        _ => "bin",
    };
    let dest_path = version_dir.join(format!("model.{}", extension));

    // Copy file
    std::fs::copy(source_path, &dest_path).map_err(|_| rusqlite::Error::InvalidQuery)?;

    // Get file size
    let file_size = std::fs::metadata(&dest_path)
        .map(|m| m.len() as i64)
        .ok();

    let dest_path_str = dest_path.to_string_lossy().to_string();

    // Insert version record
    conn.execute(
        "INSERT INTO model_versions (id, model_id, version, run_id, file_path, file_size, format, stage, metrics_snapshot, feature_names, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'none', ?8, ?9, datetime('now'))",
        rusqlite::params![version_id, model_id, next_version, run_id, dest_path_str, file_size, format, metrics_snapshot, feature_names],
    )?;

    // Update model's updated_at
    conn.execute(
        "UPDATE models SET updated_at = datetime('now') WHERE id = ?1",
        [model_id],
    )?;

    Ok(next_version)
}

pub fn list_model_versions(model_id: &str) -> Result<Vec<ModelVersion>> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    let mut stmt = conn.prepare(
        "SELECT id, model_id, version, run_id, file_path, file_size, format, stage, metrics_snapshot, feature_names, created_at, promoted_at, description, notes, onnx_path, coreml_path, n_features
         FROM model_versions WHERE model_id = ?1 ORDER BY version DESC"
    )?;
    let mut versions: Vec<ModelVersion> = stmt.query_map([model_id], map_model_version_row)?.collect::<Result<Vec<_>>>()?;

    // Fetch tags for each version
    for version in &mut versions {
        version.tags = Some(get_model_tags_internal(&conn, &version.id)?);
    }

    Ok(versions)
}

fn map_model_version_row(row: &rusqlite::Row) -> Result<ModelVersion> {
    Ok(ModelVersion {
        id: row.get(0)?,
        model_id: row.get(1)?,
        version: row.get(2)?,
        run_id: row.get(3)?,
        file_path: row.get(4)?,
        file_size: row.get(5)?,
        format: row.get(6)?,
        stage: row.get(7)?,
        metrics_snapshot: row.get(8)?,
        feature_names: row.get(9)?,
        created_at: row.get(10)?,
        promoted_at: row.get(11)?,
        description: row.get(12)?,
        notes: row.get(13)?,
        onnx_path: row.get(14)?,
        coreml_path: row.get(15)?,
        n_features: row.get(16)?,
        tags: None, // Populated separately
    })
}

pub fn promote_model(version_id: &str, new_stage: &str) -> Result<()> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;

    if new_stage == "production" {
        // Get model_id for this version
        let model_id: String = conn.query_row(
            "SELECT model_id FROM model_versions WHERE id = ?1",
            [version_id],
            |row| row.get(0),
        )?;

        // Demote current production version (if any) to staging
        conn.execute(
            "UPDATE model_versions SET stage = 'staging', promoted_at = NULL
             WHERE model_id = ?1 AND stage = 'production'",
            [&model_id],
        )?;
    }

    // Now promote the requested version
    let promoted_at = if new_stage == "none" {
        None
    } else {
        Some(chrono::Utc::now().to_rfc3339())
    };

    conn.execute(
        "UPDATE model_versions SET stage = ?1, promoted_at = ?2 WHERE id = ?3",
        rusqlite::params![new_stage, promoted_at, version_id],
    )?;

    Ok(())
}

pub fn delete_model_version(version_id: &str) -> Result<()> {
    // Get file path first
    let file_path: Option<String> = {
        let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
            rusqlite::Error::InvalidQuery
        })?;
        conn.query_row(
            "SELECT file_path FROM model_versions WHERE id = ?1",
            [version_id],
            |row| row.get(0),
        ).ok()
    };

    // Delete from database
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    conn.execute("DELETE FROM model_versions WHERE id = ?1", [version_id])?;

    // Delete file
    if let Some(path) = file_path {
        let _ = std::fs::remove_file(&path);
        // Try to remove parent directory if empty
        if let Some(parent) = std::path::Path::new(&path).parent() {
            let _ = std::fs::remove_dir(parent);
        }
    }

    Ok(())
}

pub fn get_model_file_path(version_id: &str) -> Result<Option<String>> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    let result = conn.query_row(
        "SELECT file_path FROM model_versions WHERE id = ?1",
        [version_id],
        |row| row.get(0),
    );
    match result {
        Ok(path) => Ok(Some(path)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn get_model_version(version_id: &str) -> Result<Option<ModelVersion>> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    let result = conn.query_row(
        "SELECT id, model_id, version, run_id, file_path, file_size, format, stage, metrics_snapshot, feature_names, created_at, promoted_at, description, notes, onnx_path, coreml_path, n_features
         FROM model_versions WHERE id = ?1",
        [version_id],
        map_model_version_row,
    );
    match result {
        Ok(mut version) => {
            version.tags = Some(get_model_tags_internal(&conn, &version.id)?);
            Ok(Some(version))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

// Tuning Session CRUD operations

pub fn create_tuning_session(
    id: &str,
    run_id: &str,
    sampler: &str,
    search_space: &str,
    n_trials: Option<i32>,
    cv_folds: i32,
    scoring_metric: &str,
) -> Result<()> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    conn.execute(
        "INSERT INTO tuning_sessions (id, run_id, sampler, search_space, n_trials, cv_folds, scoring_metric, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'running', datetime('now'))",
        rusqlite::params![id, run_id, sampler, search_space, n_trials, cv_folds, scoring_metric],
    )?;
    Ok(())
}

pub fn update_tuning_session(
    id: &str,
    status: &str,
    best_trial_id: Option<&str>,
) -> Result<()> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE tuning_sessions SET status = ?2, best_trial_id = ?3, completed_at = ?4 WHERE id = ?1",
        rusqlite::params![id, status, best_trial_id, now],
    )?;
    Ok(())
}

pub fn get_tuning_session(session_id: &str) -> Result<Option<TuningSession>> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    let result = conn.query_row(
        "SELECT id, run_id, sampler, search_space, n_trials, cv_folds, scoring_metric, status, best_trial_id, created_at, completed_at
         FROM tuning_sessions WHERE id = ?1",
        [session_id],
        |row| {
            Ok(TuningSession {
                id: row.get(0)?,
                run_id: row.get(1)?,
                sampler: row.get(2)?,
                search_space: row.get(3)?,
                n_trials: row.get(4)?,
                cv_folds: row.get(5)?,
                scoring_metric: row.get(6)?,
                status: row.get(7)?,
                best_trial_id: row.get(8)?,
                created_at: row.get(9)?,
                completed_at: row.get(10)?,
            })
        },
    );
    match result {
        Ok(session) => Ok(Some(session)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn get_tuning_session_by_run(run_id: &str) -> Result<Option<TuningSession>> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    let result = conn.query_row(
        "SELECT id, run_id, sampler, search_space, n_trials, cv_folds, scoring_metric, status, best_trial_id, created_at, completed_at
         FROM tuning_sessions WHERE run_id = ?1",
        [run_id],
        |row| {
            Ok(TuningSession {
                id: row.get(0)?,
                run_id: row.get(1)?,
                sampler: row.get(2)?,
                search_space: row.get(3)?,
                n_trials: row.get(4)?,
                cv_folds: row.get(5)?,
                scoring_metric: row.get(6)?,
                status: row.get(7)?,
                best_trial_id: row.get(8)?,
                created_at: row.get(9)?,
                completed_at: row.get(10)?,
            })
        },
    );
    match result {
        Ok(session) => Ok(Some(session)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

// Tuning Trial CRUD operations

pub fn create_tuning_trial(
    id: &str,
    session_id: &str,
    trial_number: i32,
    hyperparameters: &str,
    score: Option<f64>,
    duration_ms: Option<i64>,
    status: &str,
) -> Result<()> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    conn.execute(
        "INSERT INTO tuning_trials (id, session_id, trial_number, hyperparameters, score, duration_ms, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))",
        rusqlite::params![id, session_id, trial_number, hyperparameters, score, duration_ms, status],
    )?;
    Ok(())
}

pub fn list_tuning_trials(session_id: &str) -> Result<Vec<TuningTrial>> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    let mut stmt = conn.prepare(
        "SELECT id, session_id, trial_number, hyperparameters, score, duration_ms, status, error_message, created_at
         FROM tuning_trials WHERE session_id = ?1 ORDER BY trial_number ASC"
    )?;
    let rows = stmt.query_map([session_id], |row| {
        Ok(TuningTrial {
            id: row.get(0)?,
            session_id: row.get(1)?,
            trial_number: row.get(2)?,
            hyperparameters: row.get(3)?,
            score: row.get(4)?,
            duration_ms: row.get(5)?,
            status: row.get(6)?,
            error_message: row.get(7)?,
            created_at: row.get(8)?,
        })
    })?;
    rows.collect()
}

pub fn get_best_trial(session_id: &str) -> Result<Option<TuningTrial>> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    let result = conn.query_row(
        "SELECT id, session_id, trial_number, hyperparameters, score, duration_ms, status, error_message, created_at
         FROM tuning_trials WHERE session_id = ?1 AND score IS NOT NULL ORDER BY score DESC LIMIT 1",
        [session_id],
        |row| {
            Ok(TuningTrial {
                id: row.get(0)?,
                session_id: row.get(1)?,
                trial_number: row.get(2)?,
                hyperparameters: row.get(3)?,
                score: row.get(4)?,
                duration_ms: row.get(5)?,
                status: row.get(6)?,
                error_message: row.get(7)?,
                created_at: row.get(8)?,
            })
        },
    );
    match result {
        Ok(trial) => Ok(Some(trial)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

// Model Metadata & Tags operations (v9)

fn get_model_tags_internal(conn: &Connection, version_id: &str) -> Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT tag FROM model_tags WHERE version_id = ?1 ORDER BY tag")?;
    let rows = stmt.query_map([version_id], |row| row.get(0))?;
    rows.collect()
}

pub fn update_model_version_metadata(
    version_id: &str,
    description: Option<&str>,
    notes: Option<&str>,
) -> Result<()> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    conn.execute(
        "UPDATE model_versions SET description = ?2, notes = ?3 WHERE id = ?1",
        rusqlite::params![version_id, description, notes],
    )?;
    Ok(())
}

pub fn update_model_version_training_info(
    version_id: &str,
    n_features: Option<i64>,
    feature_names: Option<&str>,
) -> Result<()> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    conn.execute(
        "UPDATE model_versions SET n_features = ?2, feature_names = ?3 WHERE id = ?1",
        rusqlite::params![version_id, n_features, feature_names],
    )?;
    Ok(())
}

pub fn update_model_version_export_path(
    version_id: &str,
    onnx_path: Option<&str>,
    coreml_path: Option<&str>,
) -> Result<()> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    conn.execute(
        "UPDATE model_versions SET onnx_path = ?2, coreml_path = ?3 WHERE id = ?1",
        rusqlite::params![version_id, onnx_path, coreml_path],
    )?;
    Ok(())
}

pub fn add_model_tag(version_id: &str, tag: &str) -> Result<()> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    conn.execute(
        "INSERT OR IGNORE INTO model_tags (version_id, tag) VALUES (?1, ?2)",
        [version_id, tag],
    )?;
    Ok(())
}

pub fn remove_model_tag(version_id: &str, tag: &str) -> Result<()> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    conn.execute(
        "DELETE FROM model_tags WHERE version_id = ?1 AND tag = ?2 COLLATE NOCASE",
        [version_id, tag],
    )?;
    Ok(())
}

pub fn get_model_tags(version_id: &str) -> Result<Vec<String>> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    get_model_tags_internal(&conn, version_id)
}

pub fn list_all_model_tags() -> Result<Vec<String>> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;
    let mut stmt = conn.prepare("SELECT DISTINCT tag FROM model_tags ORDER BY tag")?;
    let rows = stmt.query_map([], |row| row.get(0))?;
    rows.collect()
}

// Model filtering/search for v9

#[derive(Serialize, Deserialize, Clone)]
pub struct ModelVersionFilters {
    pub search: Option<String>,
    pub stage: Option<String>,     // 'none' | 'staging' | 'production' | 'archived' | 'all'
    pub model_type: Option<String>, // from format field or metrics_snapshot
    pub tags: Option<Vec<String>>,
}

pub fn list_all_model_versions_filtered(filters: Option<ModelVersionFilters>) -> Result<Vec<ModelVersion>> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;

    // Base query with all columns
    let base_query = "SELECT mv.id, mv.model_id, mv.version, mv.run_id, mv.file_path, mv.file_size, mv.format, mv.stage, mv.metrics_snapshot, mv.feature_names, mv.created_at, mv.promoted_at, mv.description, mv.notes, mv.onnx_path, mv.coreml_path, mv.n_features, m.name as model_name
         FROM model_versions mv
         JOIN models m ON mv.model_id = m.id";

    let mut conditions: Vec<String> = Vec::new();
    let mut params: Vec<String> = Vec::new();

    if let Some(ref f) = filters {
        // Search filter (model name or description)
        if let Some(ref search) = f.search {
            if !search.is_empty() {
                conditions.push(format!("(m.name LIKE '%{}%' OR mv.description LIKE '%{}%')", search.replace('\'', "''"), search.replace('\'', "''")));
            }
        }

        // Stage filter
        if let Some(ref stage) = f.stage {
            if stage != "all" {
                params.push(stage.clone());
                conditions.push(format!("mv.stage = '{}'", stage.replace('\'', "''")));
            }
        }

        // Tags filter - match versions that have ALL specified tags
        if let Some(ref tags) = f.tags {
            if !tags.is_empty() {
                for tag in tags {
                    conditions.push(format!(
                        "EXISTS (SELECT 1 FROM model_tags mt WHERE mt.version_id = mv.id AND mt.tag = '{}' COLLATE NOCASE)",
                        tag.replace('\'', "''")
                    ));
                }
            }
        }
    }

    let query = if conditions.is_empty() {
        format!("{} ORDER BY mv.created_at DESC", base_query)
    } else {
        format!("{} WHERE {} ORDER BY mv.created_at DESC", base_query, conditions.join(" AND "))
    };

    let mut stmt = conn.prepare(&query)?;
    let mut versions: Vec<ModelVersion> = stmt.query_map([], |row| {
        Ok(ModelVersion {
            id: row.get(0)?,
            model_id: row.get(1)?,
            version: row.get(2)?,
            run_id: row.get(3)?,
            file_path: row.get(4)?,
            file_size: row.get(5)?,
            format: row.get(6)?,
            stage: row.get(7)?,
            metrics_snapshot: row.get(8)?,
            feature_names: row.get(9)?,
            created_at: row.get(10)?,
            promoted_at: row.get(11)?,
            description: row.get(12)?,
            notes: row.get(13)?,
            onnx_path: row.get(14)?,
            coreml_path: row.get(15)?,
            n_features: row.get(16)?,
            tags: None,
        })
    })?.collect::<Result<Vec<_>>>()?;

    // Fetch tags for each version
    for version in &mut versions {
        version.tags = Some(get_model_tags_internal(&conn, &version.id)?);
    }

    Ok(versions)
}

// Version comparison for v9

#[derive(Serialize, Deserialize, Clone)]
pub struct ModelVersionComparison {
    pub versions: Vec<ModelVersionComparisonItem>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ModelVersionComparisonItem {
    pub version_id: String,
    pub model_name: String,
    pub version: i64,
    pub run_id: Option<String>,
    pub stage: String,
    pub created_at: String,
    pub metrics: std::collections::HashMap<String, Option<f64>>,
    pub hyperparameters: std::collections::HashMap<String, serde_json::Value>,
}

pub fn get_model_versions_for_comparison(version_ids: &[String]) -> Result<ModelVersionComparison> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;

    let mut items: Vec<ModelVersionComparisonItem> = Vec::new();

    for version_id in version_ids {
        // Get version with model name
        let version_result = conn.query_row(
            "SELECT mv.id, mv.version, mv.run_id, mv.stage, mv.created_at, mv.metrics_snapshot, m.name
             FROM model_versions mv
             JOIN models m ON mv.model_id = m.id
             WHERE mv.id = ?1",
            [version_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, String>(6)?,
                ))
            },
        );

        if let Ok((id, version, run_id, stage, created_at, metrics_snapshot, model_name)) = version_result {
            // Parse metrics from metrics_snapshot JSON
            let metrics: std::collections::HashMap<String, Option<f64>> = metrics_snapshot
                .and_then(|s| serde_json::from_str::<std::collections::HashMap<String, serde_json::Value>>(&s).ok())
                .map(|m| {
                    m.into_iter()
                        .filter_map(|(k, v)| {
                            let value = v.as_f64();
                            Some((k, value))
                        })
                        .collect()
                })
                .unwrap_or_default();

            // Get hyperparameters from associated run if exists
            let hyperparameters: std::collections::HashMap<String, serde_json::Value> = if let Some(ref rid) = run_id {
                let hp_json: Option<String> = conn.query_row(
                    "SELECT hyperparameters FROM runs WHERE id = ?1",
                    [rid],
                    |row| row.get(0),
                ).unwrap_or(None);

                hp_json
                    .and_then(|s| serde_json::from_str(&s).ok())
                    .unwrap_or_default()
            } else {
                std::collections::HashMap::new()
            };

            items.push(ModelVersionComparisonItem {
                version_id: id,
                model_name,
                version,
                run_id,
                stage,
                created_at,
                metrics,
                hyperparameters,
            });
        }
    }

    Ok(ModelVersionComparison { versions: items })
}

// Get versions that can be compared (same model_id for grouping)
pub fn get_comparable_versions(model_id: &str) -> Result<Vec<ModelVersion>> {
    list_model_versions(model_id)
}

// RAG (Retrieval-Augmented Generation) operations

/// Chunk embedding for RAG-enhanced code completions (v9+)
/// Each chunk represents a function, class, method, or toplevel code block
#[derive(Serialize, Deserialize, Clone)]
pub struct ChunkEmbedding {
    pub id: i64,
    pub node_id: String,
    pub pipeline_id: String,
    pub chunk_id: String, // e.g., "func:train_model" or "toplevel:0"
    pub content_hash: String,
    pub embedding: Vec<f32>,
    pub embedding_model: String,
    pub embedding_dim: usize,
    pub symbol_name: Option<String>,
    pub symbol_type: Option<String>, // function, class, method, toplevel
    pub start_line: Option<i64>,
    pub end_line: Option<i64>,
    pub created_at: String,
}

/// Input for saving a chunk embedding
#[derive(Serialize, Deserialize, Clone)]
pub struct ChunkToIndex {
    pub chunk_id: String,
    pub content: String,
    pub content_hash: String,
    pub symbol_name: Option<String>,
    pub symbol_type: String,
    pub start_line: i64,
    pub end_line: i64,
}

/// Status of the RAG index for a pipeline
#[derive(Serialize, Deserialize, Clone)]
pub struct RagStatus {
    pub pipeline_id: Option<String>,
    pub nodes_indexed: usize,
    pub embedding_model: Option<String>,
    pub last_indexed_at: Option<String>,
}

/// Result of a similarity search
#[derive(Serialize, Deserialize, Clone)]
pub struct SearchResult {
    pub node_id: String,
    pub score: f32,
}

/// Convert embedding vector to BLOB bytes (little-endian f32)
fn embedding_to_blob(embedding: &[f32]) -> Vec<u8> {
    embedding.iter().flat_map(|&f| f.to_le_bytes()).collect()
}

/// Convert BLOB bytes back to embedding vector
fn blob_to_embedding(blob: &[u8]) -> Vec<f32> {
    blob.chunks(4)
        .map(|chunk| {
            let arr: [u8; 4] = chunk.try_into().unwrap_or([0; 4]);
            f32::from_le_bytes(arr)
        })
        .collect()
}

/// Compute dot product of two pre-normalized vectors (cosine similarity)
fn dot_product(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b.iter()).map(|(x, y)| x * y).sum()
}

/// Check if a chunk needs re-embedding (content hash changed)
pub fn rag_chunk_needs_reindex(node_id: &str, chunk_id: &str, current_hash: &str) -> Result<bool> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;

    let result: Option<String> = conn
        .query_row(
            "SELECT content_hash FROM chunk_embeddings WHERE node_id = ?1 AND chunk_id = ?2",
            [node_id, chunk_id],
            |row| row.get(0),
        )
        .ok();

    match result {
        Some(stored_hash) => Ok(stored_hash != current_hash),
        None => Ok(true),
    }
}

/// Check if embedding model has changed (requires full re-index)
pub fn rag_model_mismatch(pipeline_id: &str, model: &str) -> Result<bool> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;

    let result: Option<String> = conn
        .query_row(
            "SELECT embedding_model FROM chunk_embeddings WHERE pipeline_id = ?1 LIMIT 1",
            [pipeline_id],
            |row| row.get(0),
        )
        .ok();

    match result {
        Some(stored_model) => Ok(stored_model != model),
        None => Ok(false),
    }
}

/// Save a chunk embedding to the database
pub fn rag_save_chunk_embedding(
    node_id: &str,
    pipeline_id: &str,
    chunk_id: &str,
    content_hash: &str,
    embedding: &[f32],
    embedding_model: &str,
    symbol_name: Option<&str>,
    symbol_type: &str,
    start_line: i64,
    end_line: i64,
) -> Result<()> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;

    let blob = embedding_to_blob(embedding);

    conn.execute(
        "INSERT OR REPLACE INTO chunk_embeddings
         (node_id, pipeline_id, chunk_id, content_hash, embedding, embedding_model, embedding_dim,
          symbol_name, symbol_type, start_line, end_line, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, datetime('now'))",
        rusqlite::params![
            node_id,
            pipeline_id,
            chunk_id,
            content_hash,
            blob,
            embedding_model,
            embedding.len() as i64,
            symbol_name,
            symbol_type,
            start_line,
            end_line
        ],
    )?;

    Ok(())
}

/// Load all chunk embeddings for a pipeline
pub fn rag_load_chunk_embeddings(pipeline_id: &str) -> Result<Vec<ChunkEmbedding>> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;

    let mut stmt = conn.prepare(
        "SELECT id, node_id, pipeline_id, chunk_id, content_hash, embedding, embedding_model, embedding_dim,
                symbol_name, symbol_type, start_line, end_line, created_at
         FROM chunk_embeddings WHERE pipeline_id = ?1"
    )?;

    let rows = stmt.query_map([pipeline_id], |row| {
        let blob: Vec<u8> = row.get(5)?;
        Ok(ChunkEmbedding {
            id: row.get(0)?,
            node_id: row.get(1)?,
            pipeline_id: row.get(2)?,
            chunk_id: row.get(3)?,
            content_hash: row.get(4)?,
            embedding: blob_to_embedding(&blob),
            embedding_model: row.get(6)?,
            embedding_dim: row.get::<_, i64>(7)? as usize,
            symbol_name: row.get(8)?,
            symbol_type: row.get(9)?,
            start_line: row.get(10)?,
            end_line: row.get(11)?,
            created_at: row.get(12)?,
        })
    })?;

    rows.collect()
}

/// Search result for chunk-level search
#[derive(Serialize, Deserialize, Clone)]
pub struct ChunkSearchResult {
    pub node_id: String,
    pub chunk_id: String,
    pub symbol_name: Option<String>,
    pub symbol_type: Option<String>,
    pub score: f32,
}

/// Search for similar chunks using dot product (cosine similarity on pre-normalized vectors)
pub fn rag_search_similar_chunks(
    pipeline_id: &str,
    query_embedding: &[f32],
    exclude_node_id: Option<&str>,
    top_k: usize,
) -> Result<Vec<ChunkSearchResult>> {
    let embeddings = rag_load_chunk_embeddings(pipeline_id)?;

    let mut scores: Vec<ChunkSearchResult> = embeddings
        .iter()
        .filter(|e| exclude_node_id.map_or(true, |ex| e.node_id != ex))
        .map(|e| ChunkSearchResult {
            node_id: e.node_id.clone(),
            chunk_id: e.chunk_id.clone(),
            symbol_name: e.symbol_name.clone(),
            symbol_type: e.symbol_type.clone(),
            score: dot_product(query_embedding, &e.embedding),
        })
        .collect();

    scores.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));

    Ok(scores.into_iter().take(top_k).collect())
}

/// Legacy search function that returns node-level results (for backwards compatibility)
pub fn rag_search_similar(
    pipeline_id: &str,
    query_embedding: &[f32],
    exclude_node_id: Option<&str>,
    top_k: usize,
) -> Result<Vec<SearchResult>> {
    let chunk_results = rag_search_similar_chunks(pipeline_id, query_embedding, exclude_node_id, top_k * 2)?;

    // Deduplicate by node_id, keeping best score
    let mut node_scores: std::collections::HashMap<String, f32> = std::collections::HashMap::new();
    for result in chunk_results {
        let entry = node_scores.entry(result.node_id.clone()).or_insert(0.0);
        if result.score > *entry {
            *entry = result.score;
        }
    }

    let mut scores: Vec<SearchResult> = node_scores
        .into_iter()
        .map(|(node_id, score)| SearchResult { node_id, score })
        .collect();

    scores.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));

    Ok(scores.into_iter().take(top_k).collect())
}

/// Delete all chunk embeddings for a specific node
pub fn rag_delete_node_chunks(node_id: &str) -> Result<()> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;

    conn.execute("DELETE FROM chunk_embeddings WHERE node_id = ?1", [node_id])?;
    Ok(())
}

/// Delete orphan chunks for a node (chunks not in the keep list)
pub fn rag_delete_orphan_chunks(node_id: &str, keep_chunk_ids: &[String]) -> Result<usize> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;

    if keep_chunk_ids.is_empty() {
        // Delete all chunks for this node
        let deleted = conn.execute(
            "DELETE FROM chunk_embeddings WHERE node_id = ?1",
            [node_id],
        )?;
        return Ok(deleted);
    }

    // Build IN clause with parameter placeholders
    let placeholders: String = keep_chunk_ids
        .iter()
        .enumerate()
        .map(|(i, _)| format!("?{}", i + 2))
        .collect::<Vec<_>>()
        .join(",");

    let query = format!(
        "DELETE FROM chunk_embeddings WHERE node_id = ?1 AND chunk_id NOT IN ({})",
        placeholders
    );

    let mut params: Vec<&dyn rusqlite::ToSql> = vec![&node_id as &dyn rusqlite::ToSql];
    for id in keep_chunk_ids {
        params.push(id as &dyn rusqlite::ToSql);
    }

    let deleted = conn.execute(&query, rusqlite::params_from_iter(params.iter()))?;
    Ok(deleted)
}

/// Delete all chunk embeddings for a pipeline
pub fn rag_delete_pipeline_embeddings(pipeline_id: &str) -> Result<()> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;

    conn.execute("DELETE FROM chunk_embeddings WHERE pipeline_id = ?1", [pipeline_id])?;
    Ok(())
}

/// Get RAG status for a pipeline (counts unique nodes, not chunks)
pub fn rag_get_status(pipeline_id: &str) -> Result<RagStatus> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;

    // Count unique nodes (not chunks) for backwards compatibility
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(DISTINCT node_id) FROM chunk_embeddings WHERE pipeline_id = ?1",
            [pipeline_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let model: Option<String> = conn
        .query_row(
            "SELECT embedding_model FROM chunk_embeddings WHERE pipeline_id = ?1 LIMIT 1",
            [pipeline_id],
            |row| row.get(0),
        )
        .ok();

    let last_indexed: Option<String> = conn
        .query_row(
            "SELECT MAX(created_at) FROM chunk_embeddings WHERE pipeline_id = ?1",
            [pipeline_id],
            |row| row.get(0),
        )
        .ok()
        .flatten();

    Ok(RagStatus {
        pipeline_id: Some(pipeline_id.to_string()),
        nodes_indexed: count as usize,
        embedding_model: model,
        last_indexed_at: last_indexed,
    })
}

/// Get list of node IDs that have embeddings for a pipeline
pub fn rag_get_indexed_node_ids(pipeline_id: &str) -> Result<Vec<String>> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;

    let mut stmt = conn.prepare("SELECT DISTINCT node_id FROM chunk_embeddings WHERE pipeline_id = ?1")?;
    let rows = stmt.query_map([pipeline_id], |row| row.get(0))?;
    rows.collect()
}

/// Get list of chunk IDs for a specific node
pub fn rag_get_node_chunk_ids(node_id: &str) -> Result<Vec<String>> {
    let conn = DB.get().ok_or(rusqlite::Error::InvalidQuery)?.lock().map_err(|_| {
        rusqlite::Error::InvalidQuery
    })?;

    let mut stmt = conn.prepare("SELECT chunk_id FROM chunk_embeddings WHERE node_id = ?1")?;
    let rows = stmt.query_map([node_id], |row| row.get(0))?;
    rows.collect()
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
