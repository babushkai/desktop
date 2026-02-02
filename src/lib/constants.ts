// Use /tmp to avoid triggering Tauri's file watcher during dev
export const WORK_DIR = "/tmp/mlops-desktop";
export const SPLIT_INDICES_FILE = `${WORK_DIR}/split_indices.json`;
export const MODEL_FILE = `${WORK_DIR}/model.joblib`;
