import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { DataProfile } from "./dataProfileTypes";
import {
  FeatureImportanceData,
  RegressionShapData,
  ClassificationShapData,
  RegressionPDPData,
  ClassificationPDPData,
  ExplainProgressData,
} from "./explainTypes";

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

// Explain metadata event data
export interface ExplainMetadataData {
  modelType: string;
  isClassifier: boolean;
  nSamples: number;
  nFeatures: number;
  classNames: string[];
  shapExplainer?: string;
}

export type ScriptEvent =
  | { type: "log"; message: string }
  | { type: "progress"; current: number; total: number }
  | { type: "error"; message: string }
  | { type: "metrics"; modelType: string; data: MetricsData }
  | { type: "dataProfile"; nodeId: string; data: DataProfile }
  | { type: "complete" }
  | { type: "exit"; code: number }
  | { type: "trial"; trialNumber: number; params: Record<string, unknown>; score: number; durationMs?: number }
  | { type: "tuningComplete"; bestParams: Record<string, unknown>; bestScore: number; totalTrials: number; durationMs?: number }
  // Explain events
  | { type: "explainProgress"; data: ExplainProgressData }
  | { type: "featureImportance"; data: FeatureImportanceData }
  | { type: "shapData"; data: RegressionShapData | ClassificationShapData }
  | { type: "partialDependence"; data: RegressionPDPData | ClassificationPDPData }
  | { type: "explainMetadata"; data: ExplainMetadataData }
  | { type: "explainComplete"; durationMs: number };

// Python runtime information
export interface PythonInfo {
  path: string;
  version: string;
  is_bundled: boolean;
}

export async function getPythonPath(): Promise<string | null> {
  return invoke<string | null>("get_python_path");
}

export async function setPythonPath(path: string): Promise<void> {
  return invoke("set_python_path", { path });
}

export async function findPython(): Promise<PythonInfo | null> {
  return invoke<PythonInfo | null>("find_python");
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
  // Create deferred promise handlers
  let resolvePromise: (code: number) => void;
  let rejectPromise: (err: Error) => void;

  const resultPromise = new Promise<number>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  // AWAIT listener setup BEFORE running script - this is the key fix
  const unlistener = await listenToScriptOutput((event) => {
    onOutput?.(event);
    if (event.type === "exit") {
      unlistener(); // Guaranteed to be defined - we awaited above
      if (event.code === 0) {
        resolvePromise(event.code);
      } else {
        rejectPromise(new Error(`Script exited with code ${event.code}`));
      }
    }
  });

  // NOW start script - listener is ready, unlistener is defined
  try {
    await runScript(scriptCode, inputPath);
  } catch (err) {
    unlistener(); // Cleanup on error
    throw err; // Re-throw to caller
  }

  return resultPromise;
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
  experiment_id?: string;
  experiment_name?: string; // Joined from experiments table
  display_name?: string;
  notes?: string;           // Joined from run_notes table
  tags?: string[];          // Joined from run_tags table
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

export async function createRun(pipelineName: string, hyperparameters: object, experimentId?: string): Promise<string> {
  return invoke<string>("create_run", {
    pipelineName,
    hyperparameters: JSON.stringify(hyperparameters),
    experimentId,
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

export async function listRuns(pipelineName?: string, experimentId?: string): Promise<RunMetadata[]> {
  return invoke<RunMetadata[]>("list_runs", { pipelineName, experimentId });
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
  stage: string; // "none" | "staging" | "production" | "archived"
  metrics_snapshot?: string;
  feature_names?: string; // JSON array of feature names
  created_at: string;
  promoted_at?: string;
  // v9: Enhanced model metadata
  description?: string;
  notes?: string;
  onnx_path?: string;
  coreml_path?: string;
  n_features?: number;
  tags?: string[];
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

// Tuning

export async function checkPythonPackage(packageName: string): Promise<boolean> {
  return invoke<boolean>("check_python_package", { package: packageName });
}

export interface TuningSession {
  id: string;
  run_id: string;
  sampler: string;
  search_space: string;
  n_trials?: number;
  cv_folds: number;
  scoring_metric: string;
  status: string;
  best_trial_id?: string;
  created_at: string;
  completed_at?: string;
}

export interface TuningTrial {
  id: string;
  session_id: string;
  trial_number: number;
  hyperparameters: string;
  score?: number;
  duration_ms?: number;
  status: string;
  error_message?: string;
  created_at: string;
}

export async function createTuningSession(
  runId: string,
  sampler: string,
  searchSpace: string,
  nTrials: number | null,
  cvFolds: number,
  scoringMetric: string
): Promise<string> {
  return invoke<string>("create_tuning_session", {
    runId,
    sampler,
    searchSpace,
    nTrials,
    cvFolds,
    scoringMetric,
  });
}

export async function completeTuningSession(
  sessionId: string,
  bestTrialId?: string
): Promise<void> {
  return invoke("complete_tuning_session", { sessionId, bestTrialId });
}

export async function cancelTuningSession(sessionId: string): Promise<void> {
  return invoke("cancel_tuning_session", { sessionId });
}

export async function getTuningSession(sessionId: string): Promise<TuningSession | null> {
  return invoke<TuningSession | null>("get_tuning_session", { sessionId });
}

export async function getTuningSessionByRun(runId: string): Promise<TuningSession | null> {
  return invoke<TuningSession | null>("get_tuning_session_by_run", { runId });
}

export async function saveTuningTrial(
  sessionId: string,
  trialNumber: number,
  hyperparameters: string,
  score?: number,
  durationMs?: number
): Promise<string> {
  return invoke<string>("save_tuning_trial", {
    sessionId,
    trialNumber,
    hyperparameters,
    score,
    durationMs,
  });
}

export async function listTuningTrials(sessionId: string): Promise<TuningTrial[]> {
  return invoke<TuningTrial[]>("list_tuning_trials", { sessionId });
}

export async function getBestTrial(sessionId: string): Promise<TuningTrial | null> {
  return invoke<TuningTrial | null>("get_best_trial", { sessionId });
}

// Experiments

export interface Experiment {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'completed' | 'archived';
  created_at: string;
  updated_at: string;
  run_count?: number; // Computed in query
}

export async function createExperiment(name: string, description?: string): Promise<string> {
  return invoke<string>("create_experiment", { name, description });
}

export async function updateExperiment(
  id: string,
  name?: string,
  description?: string,
  status?: 'active' | 'completed' | 'archived'
): Promise<void> {
  return invoke("update_experiment", { id, name, description, status });
}

export async function listExperiments(includeArchived: boolean = false): Promise<Experiment[]> {
  return invoke<Experiment[]>("list_experiments", { includeArchived });
}

export async function getExperiment(id: string): Promise<Experiment | null> {
  return invoke<Experiment | null>("get_experiment", { id });
}

export async function deleteExperiment(id: string): Promise<void> {
  return invoke("delete_experiment", { id });
}

// Run Annotations

export async function updateRunDisplayName(id: string, displayName?: string): Promise<void> {
  return invoke("update_run_display_name", { id, displayName });
}

export async function setRunExperiment(id: string, experimentId?: string): Promise<void> {
  return invoke("set_run_experiment", { id, experimentId });
}

export async function setRunNote(runId: string, content: string): Promise<void> {
  return invoke("set_run_note", { runId, content });
}

export async function getRunNote(runId: string): Promise<string | null> {
  return invoke<string | null>("get_run_note", { runId });
}

export async function deleteRunNote(runId: string): Promise<void> {
  return invoke("delete_run_note", { runId });
}

export async function addRunTag(runId: string, tag: string): Promise<void> {
  return invoke("add_run_tag", { runId, tag });
}

export async function removeRunTag(runId: string, tag: string): Promise<void> {
  return invoke("remove_run_tag", { runId, tag });
}

export async function getRunTags(runId: string): Promise<string[]> {
  return invoke<string[]>("get_run_tags", { runId });
}

export async function listAllTags(): Promise<string[]> {
  return invoke<string[]>("list_all_tags");
}

// Run Comparison

export interface RunComparison {
  run_ids: string[];
  metrics: Record<string, Record<string, number | null>>; // runId -> metricName -> value
  hyperparameters: Record<string, Record<string, unknown>>; // runId -> paramName -> value
}

export async function getRunsForComparison(runIds: string[]): Promise<RunComparison> {
  return invoke<RunComparison>("get_runs_for_comparison", { runIds });
}

// Model Metadata & Tags (v9)

export interface ModelVersionFilters {
  search?: string;
  stage?: string; // 'none' | 'staging' | 'production' | 'archived' | 'all'
  model_type?: string;
  tags?: string[];
}

export interface ModelVersionComparisonItem {
  version_id: string;
  model_name: string;
  version: number;
  run_id?: string;
  stage: string;
  created_at: string;
  metrics: Record<string, number | null>;
  hyperparameters: Record<string, unknown>;
}

export interface ModelVersionComparison {
  versions: ModelVersionComparisonItem[];
}

export async function updateModelVersionMetadata(
  versionId: string,
  description?: string,
  notes?: string
): Promise<void> {
  return invoke("update_model_version_metadata", { versionId, description, notes });
}

export async function updateModelVersionTrainingInfo(
  versionId: string,
  nFeatures?: number,
  featureNames?: string
): Promise<void> {
  return invoke("update_model_version_training_info", { versionId, nFeatures, featureNames });
}

export async function updateModelVersionExportPath(
  versionId: string,
  onnxPath?: string,
  coremlPath?: string
): Promise<void> {
  return invoke("update_model_version_export_path", { versionId, onnxPath, coremlPath });
}

export async function addModelTag(versionId: string, tag: string): Promise<void> {
  return invoke("add_model_tag", { versionId, tag });
}

export async function removeModelTag(versionId: string, tag: string): Promise<void> {
  return invoke("remove_model_tag", { versionId, tag });
}

export async function getModelTags(versionId: string): Promise<string[]> {
  return invoke<string[]>("get_model_tags", { versionId });
}

export async function listAllModelTags(): Promise<string[]> {
  return invoke<string[]>("list_all_model_tags");
}

export async function listAllModelVersionsFiltered(
  filters?: ModelVersionFilters
): Promise<ModelVersion[]> {
  return invoke<ModelVersion[]>("list_all_model_versions_filtered", { filters });
}

export async function getModelVersionsForComparison(
  versionIds: string[]
): Promise<ModelVersionComparison> {
  return invoke<ModelVersionComparison>("get_model_versions_for_comparison", { versionIds });
}

export async function getComparableVersions(modelId: string): Promise<ModelVersion[]> {
  return invoke<ModelVersion[]>("get_comparable_versions", { modelId });
}

// HTTP Server (v10)

export interface HttpServerConfig {
  host: string;
  port: number;
  use_onnx: boolean;
  cors_origins?: string[];
}

export interface HttpServerStatus {
  running: boolean;
  host?: string;
  port?: number;
  version_id?: string;
  model_name?: string;
  runtime?: string;
  model_info?: ModelInfo;
  url?: string;
}

export interface HttpRequestLog {
  id: string;
  timestamp: number;
  method: string;
  path: string;
  status_code: number;
  latency_ms: number;
  batch_size: number;
}

export interface HttpServerMetrics {
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  avg_latency_ms: number;
  requests_per_minute: number;
  recent_requests: HttpRequestLog[];
}

export interface HttpServerError {
  code: string;
  message: string;
}

export async function startHttpServer(
  versionId: string,
  config?: Partial<HttpServerConfig>
): Promise<HttpServerStatus> {
  const fullConfig: HttpServerConfig = {
    host: config?.host ?? "127.0.0.1",
    port: config?.port ?? 8080,
    use_onnx: config?.use_onnx ?? false,
    cors_origins: config?.cors_origins,
  };
  return invoke<HttpServerStatus>("start_http_server", { versionId, config: fullConfig });
}

export async function stopHttpServer(): Promise<void> {
  return invoke("stop_http_server");
}

export async function getHttpServerStatus(): Promise<HttpServerStatus> {
  return invoke<HttpServerStatus>("get_http_server_status");
}

export async function getHttpServerMetrics(): Promise<HttpServerMetrics> {
  return invoke<HttpServerMetrics>("get_http_server_metrics");
}

export async function resetHttpServerMetrics(): Promise<void> {
  return invoke("reset_http_server_metrics");
}

export async function getServingVersionId(): Promise<string | null> {
  return invoke<string | null>("get_serving_version_id");
}

export async function deleteModelVersionSafe(versionId: string): Promise<void> {
  return invoke("delete_model_version_safe", { versionId });
}

export async function listenToHttpRequestLog(
  callback: (log: HttpRequestLog) => void
): Promise<UnlistenFn> {
  return listen<HttpRequestLog>("http-request-log", (event) => {
    callback(event.payload);
  });
}

export async function listenToHttpServerError(
  callback: (error: HttpServerError) => void
): Promise<UnlistenFn> {
  return listen<HttpServerError>("http-server-error", (event) => {
    callback(event.payload);
  });
}

export async function listenToHttpServerLog(
  callback: (log: string) => void
): Promise<UnlistenFn> {
  return listen<string>("http-server-log", (event) => {
    callback(event.payload);
  });
}

// Ollama LLM Integration

export async function checkOllama(host?: string): Promise<boolean> {
  return invoke<boolean>("check_ollama", { host });
}

export async function listOllamaModels(host?: string): Promise<string[]> {
  return invoke<string[]>("list_ollama_models", { host });
}

export async function generateCompletion(
  requestId: string,
  host: string | undefined,
  model: string,
  context: string,
  cursorLine: string,
  columns: string[]
): Promise<string> {
  return invoke<string>("generate_completion", {
    requestId,
    host,
    model,
    context,
    cursorLine,
    columns,
  });
}

export async function cancelCompletion(requestId: string): Promise<void> {
  return invoke("cancel_completion", { requestId });
}

// LSP (Language Server Protocol) Integration

export interface PyrightInfo {
  installed: boolean;
  version: string | null;
  python_path: string;
}

export interface LspStatus {
  running: boolean;
  initialized: boolean;
  pyright_version: string | null;
  restart_count: number;
}

export interface LspDiagnostic {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  message: string;
  severity?: number; // 1 = Error, 2 = Warning, 3 = Info, 4 = Hint
  source?: string;
  code?: string | number;
}

export interface LspPublishDiagnosticsParams {
  uri: string;
  diagnostics: LspDiagnostic[];
}

export interface LspHoverResult {
  contents: Array<string | { language: string; value: string }>;
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

export interface LspCompletionItem {
  label: string;
  kind?: number;
  detail?: string;
  documentation?: string | { kind: string; value: string };
  insertText?: string;
  insertTextFormat?: number;
}

export interface LspCompletionList {
  isIncomplete: boolean;
  items: LspCompletionItem[];
}

export interface LspLocation {
  uri: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

export async function checkPyright(): Promise<PyrightInfo> {
  return invoke<PyrightInfo>("check_pyright");
}

export async function startLspServer(workspaceRoot?: string): Promise<void> {
  return invoke("start_lsp_server", { workspaceRoot });
}

export async function stopLspServer(): Promise<void> {
  return invoke("stop_lsp_server");
}

export async function lspRequest<T = unknown>(method: string, params: unknown): Promise<T> {
  return invoke<T>("lsp_request", { method, params });
}

export async function lspNotify(method: string, params: unknown): Promise<void> {
  return invoke("lsp_notify", { method, params });
}

export async function lspCancelRequest(requestId: number): Promise<void> {
  return invoke("lsp_cancel_request", { requestId });
}

export async function getLspStatus(): Promise<LspStatus> {
  return invoke<LspStatus>("get_lsp_status");
}

export async function listenToLspDiagnostics(
  callback: (params: LspPublishDiagnosticsParams) => void
): Promise<UnlistenFn> {
  return listen<LspPublishDiagnosticsParams>("lsp-diagnostics", (event) => {
    callback(event.payload);
  });
}

export async function listenToLspRestarted(callback: () => void): Promise<UnlistenFn> {
  return listen("lsp-restarted", () => {
    callback();
  });
}

export async function listenToLspFailed(callback: (message: string) => void): Promise<UnlistenFn> {
  return listen<string>("lsp-failed", (event) => {
    callback(event.payload);
  });
}
