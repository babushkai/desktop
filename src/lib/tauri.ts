import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { DataProfile } from "./dataProfileTypes";

export interface MetricsData {
  modelType: "classifier" | "regressor";
  // Classification metrics
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1?: number;
  confusionMatrix?: number[][];
  // Regression metrics
  r2?: number;
  mse?: number;
  rmse?: number;
  mae?: number;
}

export type ScriptEvent =
  | { type: "log"; message: string }
  | { type: "progress"; current: number; total: number }
  | { type: "error"; message: string }
  | { type: "metrics"; modelType: string; data: MetricsData }
  | { type: "dataProfile"; nodeId: string; data: DataProfile }
  | { type: "complete" }
  | { type: "exit"; code: number };

export async function getPythonPath(): Promise<string | null> {
  return invoke<string | null>("get_python_path");
}

export async function setPythonPath(path: string): Promise<void> {
  return invoke("set_python_path", { path });
}

export async function findPython(): Promise<string | null> {
  return invoke<string | null>("find_python");
}

export async function runScript(scriptCode: string, inputPath: string): Promise<void> {
  return invoke("run_script", { scriptCode, inputPath });
}

export async function cancelScript(): Promise<void> {
  return invoke("cancel_script");
}

export async function listenToScriptOutput(
  callback: (event: ScriptEvent) => void
): Promise<UnlistenFn> {
  return listen<ScriptEvent>("script-output", (event) => {
    callback(event.payload);
  });
}

export async function runScriptAndWait(
  scriptCode: string,
  inputPath: string,
  onOutput?: (event: ScriptEvent) => void
): Promise<number> {
  return new Promise((resolve, reject) => {
    let unlistener: UnlistenFn | undefined;

    listenToScriptOutput((event) => {
      onOutput?.(event);
      if (event.type === "exit") {
        unlistener?.();
        if (event.code === 0) {
          resolve(event.code);
        } else {
          reject(new Error(`Script exited with code ${event.code}`));
        }
      }
    }).then((unlisten) => {
      unlistener = unlisten;
      runScript(scriptCode, inputPath).catch(reject);
    });
  });
}

// Pipeline CRUD

export interface PipelineMetadata {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export async function savePipeline(id: string, name: string, data: string): Promise<void> {
  return invoke("save_pipeline", { id, name, data });
}

export async function loadPipeline(id: string): Promise<string | null> {
  return invoke<string | null>("load_pipeline", { id });
}

export async function listPipelines(): Promise<PipelineMetadata[]> {
  return invoke<PipelineMetadata[]>("list_pipelines");
}

export async function deletePipeline(id: string): Promise<void> {
  return invoke("delete_pipeline", { id });
}

// Example datasets

export interface ExampleDataset {
  id: string;
  name: string;
  description: string;
  task_type: string;
  target_column: string;
  recommended_model: string;
}

export async function getExampleDataPath(dataset: string): Promise<string> {
  return invoke<string>("get_example_data_path", { dataset });
}

export async function listExampleDatasets(): Promise<ExampleDataset[]> {
  return invoke<ExampleDataset[]>("list_example_datasets");
}

// Run history

export interface RunMetadata {
  id: string;
  pipeline_name: string;
  status: string;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  hyperparameters?: string;
  error_message?: string;
}

export interface Metric {
  name: string;
  value?: number;
  value_json?: string;
}

export interface MetricInput {
  name: string;
  value?: number;
  valueJson?: string;
}

export async function createRun(pipelineName: string, hyperparameters: object): Promise<string> {
  return invoke<string>("create_run", {
    pipelineName,
    hyperparameters: JSON.stringify(hyperparameters),
  });
}

export async function completeRun(id: string, durationMs: number): Promise<void> {
  return invoke("complete_run", { id, durationMs });
}

export async function failRun(id: string, error: string): Promise<void> {
  return invoke("fail_run", { id, error });
}

export async function saveRunMetrics(runId: string, metrics: MetricInput[]): Promise<void> {
  // Convert camelCase valueJson to snake_case value_json for Rust
  const rustMetrics = metrics.map((m) => ({
    name: m.name,
    value: m.value,
    value_json: m.valueJson,
  }));
  return invoke("save_run_metrics", { runId, metrics: rustMetrics });
}

export async function listRuns(pipelineName?: string): Promise<RunMetadata[]> {
  return invoke<RunMetadata[]>("list_runs", { pipelineName });
}

export async function getRunMetrics(runId: string): Promise<Metric[]> {
  return invoke<Metric[]>("get_run_metrics", { runId });
}

export async function deleteRun(id: string): Promise<void> {
  return invoke("delete_run", { id });
}

// Model Registry

export interface ModelMetadata {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
  version_count: number;
  latest_version?: number;
  production_version?: number;
}

export interface ModelVersion {
  id: string;
  model_id: string;
  version: number;
  run_id?: string;
  file_path: string;
  file_size?: number;
  format: string;
  stage: string; // "none" | "staging" | "production"
  metrics_snapshot?: string;
  feature_names?: string; // JSON array of feature names
  created_at: string;
  promoted_at?: string;
}

export interface RegisterVersionResult {
  version_id: string;
  version: number;
}

export async function createModel(name: string, description?: string): Promise<string> {
  return invoke<string>("create_model", { name, description });
}

export async function listModels(): Promise<ModelMetadata[]> {
  return invoke<ModelMetadata[]>("list_models");
}

export async function getModel(modelId: string): Promise<ModelMetadata | null> {
  return invoke<ModelMetadata | null>("get_model", { modelId });
}

export async function deleteModel(modelId: string): Promise<void> {
  return invoke("delete_model", { modelId });
}

export async function registerModelVersion(
  modelId: string,
  sourcePath: string,
  format: string,
  runId?: string,
  metricsSnapshot?: string,
  featureNames?: string[]
): Promise<RegisterVersionResult> {
  return invoke<RegisterVersionResult>("register_model_version", {
    modelId,
    runId,
    sourcePath,
    format,
    metricsSnapshot,
    featureNames: featureNames ? JSON.stringify(featureNames) : undefined,
  });
}

export async function listModelVersions(modelId: string): Promise<ModelVersion[]> {
  return invoke<ModelVersion[]>("list_model_versions", { modelId });
}

export async function promoteModel(versionId: string, stage: string): Promise<void> {
  return invoke("promote_model", { versionId, stage });
}

export async function deleteModelVersion(versionId: string): Promise<void> {
  return invoke("delete_model_version", { versionId });
}

export async function getModelFilePath(versionId: string): Promise<string | null> {
  return invoke<string | null>("get_model_file_path", { versionId });
}

export async function getModelVersion(versionId: string): Promise<ModelVersion | null> {
  return invoke<ModelVersion | null>("get_model_version", { versionId });
}

// Inference Server

export interface ModelInfo {
  type: string;
  is_classifier: boolean;
  classes?: (string | number)[];
  feature_names?: string[];
}

export interface ServerStatus {
  running: boolean;
  model_path?: string;
  feature_names?: string[];
  model_info?: ModelInfo;
}

export interface PredictionResult {
  request_id: string;
  status: "ok" | "error";
  prediction?: (number | string)[];
  probabilities?: number[][];
  classes?: (string | number)[];
  message?: string;
}

export async function startInferenceServer(versionId: string): Promise<ServerStatus> {
  return invoke<ServerStatus>("start_inference_server", { versionId });
}

export async function stopInferenceServer(): Promise<void> {
  return invoke("stop_inference_server");
}

export async function getInferenceServerStatus(versionId?: string): Promise<ServerStatus> {
  return invoke<ServerStatus>("get_inference_server_status", { versionId });
}

export async function runInference(
  requestId: string,
  input: Record<string, unknown> | Record<string, unknown>[]
): Promise<PredictionResult> {
  return invoke<PredictionResult>("run_inference", { requestId, input });
}

// Batch inference with chunking support
export interface BatchChunkResult {
  predictions: (number | string)[];
  probabilities?: number[][];
  classes?: (string | number)[];
  error?: string;
}

export async function runBatchInference(
  inputs: Record<string, unknown>[],
  options: {
    chunkSize?: number;
    onProgress?: (current: number, total: number) => void;
    signal?: AbortSignal;
  } = {}
): Promise<BatchChunkResult> {
  const { chunkSize = 500, onProgress, signal } = options;

  if (inputs.length === 0) {
    return { predictions: [] };
  }

  // For small batches, send all at once
  if (inputs.length <= chunkSize) {
    const requestId = `batch-${Date.now()}`;
    const result = await runInference(requestId, inputs);

    if (result.status === "error") {
      return { predictions: [], error: result.message };
    }

    return {
      predictions: result.prediction || [],
      probabilities: result.probabilities,
      classes: result.classes,
    };
  }

  // For large batches, chunk the requests
  const allPredictions: (string | number)[] = [];
  const allProbabilities: number[][] = [];
  let lastClasses: (string | number)[] | undefined;

  const chunks: Record<string, unknown>[][] = [];
  for (let i = 0; i < inputs.length; i += chunkSize) {
    chunks.push(inputs.slice(i, i + chunkSize));
  }

  for (let i = 0; i < chunks.length; i++) {
    // Check for cancellation
    if (signal?.aborted) {
      return {
        predictions: allPredictions,
        probabilities: allProbabilities.length > 0 ? allProbabilities : undefined,
        classes: lastClasses,
        error: `Cancelled (${allPredictions.length}/${inputs.length} processed)`,
      };
    }

    onProgress?.(i * chunkSize, inputs.length);

    const requestId = `batch-${Date.now()}-${i}`;
    const result = await runInference(requestId, chunks[i]);

    if (result.status === "error") {
      // Return partial results on error
      return {
        predictions: allPredictions,
        probabilities: allProbabilities.length > 0 ? allProbabilities : undefined,
        classes: lastClasses,
        error: `Error at chunk ${i + 1}: ${result.message} (${allPredictions.length}/${inputs.length} processed)`,
      };
    }

    if (result.prediction) {
      allPredictions.push(...result.prediction);
    }
    if (result.probabilities) {
      allProbabilities.push(...result.probabilities);
    }
    if (result.classes) {
      lastClasses = result.classes;
    }
  }

  onProgress?.(inputs.length, inputs.length);

  return {
    predictions: allPredictions,
    probabilities: allProbabilities.length > 0 ? allProbabilities : undefined,
    classes: lastClasses,
  };
}
