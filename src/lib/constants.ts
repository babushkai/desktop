// Use /tmp to avoid triggering Tauri's file watcher during dev
export const WORK_DIR = "/tmp/mlops-desktop";
export const SPLIT_INDICES_FILE = `${WORK_DIR}/split_indices.json`;
export const MODEL_FILE = `${WORK_DIR}/model.joblib`;
export const MODEL_INFO_FILE = `${WORK_DIR}/model_info.json`;
export const EXPORTS_DIR = `${WORK_DIR}/exports`;
