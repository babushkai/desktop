# API Reference

MLOps Desktop uses Tauri for IPC between the React frontend and Rust backend.
All API functions are exported from `src/lib/tauri.ts`.

## Types

### ScriptEvent

Events emitted during script execution:

```typescript
type ScriptEvent =
  | { type: "log"; message: string }
  | { type: "progress"; current: number; total: number }
  | { type: "error"; message: string }
  | { type: "metrics"; modelType: string; data: MetricsData }
  | { type: "dataProfile"; nodeId: string; data: DataProfile }
  | { type: "complete" }
  | { type: "exit"; code: number }
  | { type: "trial"; trialNumber: number; params: Record<string, unknown>; score: number; durationMs?: number }
  | { type: "tuningComplete"; bestParams: Record<string, unknown>; bestScore: number; totalTrials: number; durationMs?: number }
  | { type: "explainProgress"; data: ExplainProgressData }
  | { type: "featureImportance"; data: FeatureImportanceData }
  | { type: "shapData"; data: RegressionShapData | ClassificationShapData }
  | { type: "partialDependence"; data: RegressionPDPData | ClassificationPDPData }
  | { type: "explainMetadata"; data: ExplainMetadataData }
  | { type: "explainComplete"; durationMs: number };
```

### PipelineMetadata

```typescript
interface PipelineMetadata {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}
```

### Experiment

```typescript
interface Experiment {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'completed' | 'archived';
  created_at: string;
  updated_at: string;
  run_count?: number;
}
```

### RunMetadata

```typescript
interface RunMetadata {
  id: string;
  pipeline_name: string;
  status: string;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  hyperparameters?: string;
  error_message?: string;
  experiment_id?: string;
  experiment_name?: string;
  display_name?: string;
  notes?: string;
  tags?: string[];
}
```

### ModelVersion

```typescript
interface ModelVersion {
  id: string;
  model_id: string;
  version: number;
  run_id?: string;
  file_path: string;
  file_size?: number;
  format: string;
  stage: "none" | "staging" | "production" | "archived";
  metrics_snapshot?: string;
  feature_names?: string;
  created_at: string;
  promoted_at?: string;
  description?: string;
  notes?: string;
  onnx_path?: string;
  coreml_path?: string;
  n_features?: number;
  tags?: string[];
}
```

### HttpServerStatus

```typescript
interface HttpServerStatus {
  running: boolean;
  host?: string;
  port?: number;
  version_id?: string;
  model_name?: string;
  runtime?: string;
  model_info?: ModelInfo;
  url?: string;
}
```

## Script Execution

### runScript(scriptCode, inputPath)

Execute Python script with real-time output streaming.

```typescript
async function runScript(scriptCode: string, inputPath: string): Promise<void>
```

### runScriptAndWait(scriptCode, inputPath, onOutput?)

Execute script and wait for completion with optional event callback.

```typescript
async function runScriptAndWait(
  scriptCode: string,
  inputPath: string,
  onOutput?: (event: ScriptEvent) => void
): Promise<number>
```

### cancelScript()

Cancel currently running script.

```typescript
async function cancelScript(): Promise<void>
```

### listenToScriptOutput(callback)

Subscribe to script output events.

```typescript
async function listenToScriptOutput(
  callback: (event: ScriptEvent) => void
): Promise<UnlistenFn>
```

## Pipeline Management

### savePipeline(id, name, data)

Save pipeline to database.

```typescript
async function savePipeline(id: string, name: string, data: string): Promise<void>
```

### loadPipeline(id)

Load pipeline by ID.

```typescript
async function loadPipeline(id: string): Promise<string | null>
```

### listPipelines()

List all saved pipelines.

```typescript
async function listPipelines(): Promise<PipelineMetadata[]>
```

### deletePipeline(id)

Delete pipeline by ID.

```typescript
async function deletePipeline(id: string): Promise<void>
```

## Experiment Tracking

### createExperiment(name, description?)

Create a new experiment.

```typescript
async function createExperiment(name: string, description?: string): Promise<string>
```

### updateExperiment(id, name?, description?, status?)

Update experiment properties.

```typescript
async function updateExperiment(
  id: string,
  name?: string,
  description?: string,
  status?: 'active' | 'completed' | 'archived'
): Promise<void>
```

### listExperiments(includeArchived?)

List experiments.

```typescript
async function listExperiments(includeArchived?: boolean): Promise<Experiment[]>
```

### deleteExperiment(id)

Delete experiment and associated runs.

```typescript
async function deleteExperiment(id: string): Promise<void>
```

## Run History

### createRun(pipelineName, hyperparameters, experimentId?)

Create a new run record.

```typescript
async function createRun(
  pipelineName: string,
  hyperparameters: object,
  experimentId?: string
): Promise<string>
```

### completeRun(id, durationMs)

Mark run as completed.

```typescript
async function completeRun(id: string, durationMs: number): Promise<void>
```

### failRun(id, error)

Mark run as failed with error message.

```typescript
async function failRun(id: string, error: string): Promise<void>
```

### listRuns(pipelineName?, experimentId?)

List runs with optional filters.

```typescript
async function listRuns(
  pipelineName?: string,
  experimentId?: string
): Promise<RunMetadata[]>
```

### getRunMetrics(runId)

Get metrics for a specific run.

```typescript
async function getRunMetrics(runId: string): Promise<Metric[]>
```

### saveRunMetrics(runId, metrics)

Save metrics for a run.

```typescript
async function saveRunMetrics(runId: string, metrics: MetricInput[]): Promise<void>
```

### getRunsForComparison(runIds)

Get data for comparing multiple runs.

```typescript
async function getRunsForComparison(runIds: string[]): Promise<RunComparison>
```

## Model Registry

### createModel(name, description?)

Create a new model entry.

```typescript
async function createModel(name: string, description?: string): Promise<string>
```

### listModels()

List all registered models.

```typescript
async function listModels(): Promise<ModelMetadata[]>
```

### deleteModel(modelId)

Delete model and all versions.

```typescript
async function deleteModel(modelId: string): Promise<void>
```

### registerModelVersion(modelId, sourcePath, format, runId?, metricsSnapshot?, featureNames?)

Register a new model version.

```typescript
async function registerModelVersion(
  modelId: string,
  sourcePath: string,
  format: string,
  runId?: string,
  metricsSnapshot?: string,
  featureNames?: string[]
): Promise<RegisterVersionResult>
```

### listModelVersions(modelId)

List versions for a model.

```typescript
async function listModelVersions(modelId: string): Promise<ModelVersion[]>
```

### promoteModel(versionId, stage)

Promote model version to a stage.

```typescript
async function promoteModel(versionId: string, stage: string): Promise<void>
```

### getModelFilePath(versionId)

Get file path for a model version.

```typescript
async function getModelFilePath(versionId: string): Promise<string | null>
```

## Model Serving

### startHttpServer(versionId, config?)

Start HTTP inference server for a model version.

```typescript
async function startHttpServer(
  versionId: string,
  config?: Partial<HttpServerConfig>
): Promise<HttpServerStatus>
```

### stopHttpServer()

Stop the running HTTP server.

```typescript
async function stopHttpServer(): Promise<void>
```

### getHttpServerStatus()

Get current server status.

```typescript
async function getHttpServerStatus(): Promise<HttpServerStatus>
```

### getHttpServerMetrics()

Get server metrics (request counts, latency, etc.).

```typescript
async function getHttpServerMetrics(): Promise<HttpServerMetrics>
```

### runInference(requestId, input)

Run inference on loaded model.

```typescript
async function runInference(
  requestId: string,
  input: Record<string, unknown> | Record<string, unknown>[]
): Promise<PredictionResult>
```

### runBatchInference(inputs, options?)

Run batch inference with chunking support.

```typescript
async function runBatchInference(
  inputs: Record<string, unknown>[],
  options?: {
    chunkSize?: number;
    onProgress?: (current: number, total: number) => void;
    signal?: AbortSignal;
  }
): Promise<BatchChunkResult>
```

## Hyperparameter Tuning

### createTuningSession(runId, sampler, searchSpace, nTrials, cvFolds, scoringMetric)

Create a new tuning session.

```typescript
async function createTuningSession(
  runId: string,
  sampler: string,
  searchSpace: string,
  nTrials: number | null,
  cvFolds: number,
  scoringMetric: string
): Promise<string>
```

### completeTuningSession(sessionId, bestTrialId?)

Mark tuning session as complete.

```typescript
async function completeTuningSession(
  sessionId: string,
  bestTrialId?: string
): Promise<void>
```

### listTuningTrials(sessionId)

List trials for a tuning session.

```typescript
async function listTuningTrials(sessionId: string): Promise<TuningTrial[]>
```

### getBestTrial(sessionId)

Get the best trial from a session.

```typescript
async function getBestTrial(sessionId: string): Promise<TuningTrial | null>
```

## Utilities

### findPython()

Detect Python installation.

```typescript
async function findPython(): Promise<PythonInfo | null>
```

### getPythonPath()

Get configured Python path.

```typescript
async function getPythonPath(): Promise<string | null>
```

### setPythonPath(path)

Set Python path in settings.

```typescript
async function setPythonPath(path: string): Promise<void>
```

### checkPythonPackage(packageName)

Check if a Python package is installed.

```typescript
async function checkPythonPackage(packageName: string): Promise<boolean>
```

### getExampleDataPath(dataset)

Get path to bundled example dataset.

```typescript
async function getExampleDataPath(dataset: string): Promise<string>
```

### listExampleDatasets()

List available example datasets.

```typescript
async function listExampleDatasets(): Promise<ExampleDataset[]>
```
