// Hyperparameter Tuning Types (v6)

export type TuningSampler = "grid" | "random" | "bayesian";

export type TuningStatus = "idle" | "running" | "completed" | "cancelled" | "error";

// Parameter specification for search space
export interface ParamSpec {
  type: "int" | "float" | "categorical";
  // For categorical params
  values?: (string | number | boolean | null)[];
  // For int/float params
  min?: number;
  max?: number;
  step?: number; // For int only (enables grid search enumeration)
  distribution?: "uniform" | "log"; // For float only (default: uniform)
}

// Configuration for a tuning session
export interface TuningConfig {
  sampler: TuningSampler;
  nTrials: number; // For Random/Bayesian only; Grid uses all combinations
  cvFolds: number;
  scoringMetric: string;
  searchSpace: Record<string, ParamSpec>;
}

// Trial result from a single hyperparameter combination
export interface TrialResult {
  trialNumber: number;
  params: Record<string, unknown>;
  score: number;
  durationMs?: number;
  status: "pending" | "running" | "completed" | "failed" | "pruned";
  errorMessage?: string;
}

// Complete tuning session result
export interface TuningResult {
  sessionId: string;
  bestTrialNumber: number;
  bestParams: Record<string, unknown>;
  bestScore: number;
  trials: TrialResult[];
  totalDurationMs: number;
  modelSaved: boolean;
}

// NodeData extension for tuning
export interface TuningNodeData {
  tuningEnabled?: boolean;
  tuningConfig?: TuningConfig;
}

// Script event types for tuning
export interface TuningTrialEvent {
  type: "trial";
  trialNumber: number;
  params: Record<string, unknown>;
  score: number;
  durationMs?: number;
}

export interface TuningCompleteEvent {
  type: "tuningComplete";
  bestParams: Record<string, unknown>;
  bestScore: number;
  totalTrials: number;
}

// Classification metrics
export const CLASSIFICATION_METRICS = [
  { value: "accuracy", label: "Accuracy" },
  { value: "f1", label: "F1 Score" },
  { value: "precision", label: "Precision" },
  { value: "recall", label: "Recall" },
  { value: "roc_auc", label: "ROC AUC" },
] as const;

// Regression metrics
export const REGRESSION_METRICS = [
  { value: "r2", label: "R² Score" },
  { value: "neg_mean_squared_error", label: "Neg MSE" },
  { value: "neg_mean_absolute_error", label: "Neg MAE" },
  { value: "neg_root_mean_squared_error", label: "Neg RMSE" },
] as const;

// Models classified by problem type
export const CLASSIFIER_MODELS = [
  "logistic_regression",
  "random_forest_classifier",
  "gradient_boosting_classifier",
  "svc",
  "knn_classifier",
  "mlp_classifier",
] as const;

export const REGRESSOR_MODELS = [
  "linear_regression",
  "random_forest",
  "gradient_boosting",
  "svr",
  "knn_regressor",
  "mlp_regressor",
] as const;

// Type guard for classifier models
export function isClassifier(modelType: string): boolean {
  return CLASSIFIER_MODELS.includes(modelType as typeof CLASSIFIER_MODELS[number]);
}

// Get valid metrics for a model type
export function getValidMetrics(modelType: string): typeof CLASSIFICATION_METRICS | typeof REGRESSION_METRICS {
  return isClassifier(modelType) ? CLASSIFICATION_METRICS : REGRESSION_METRICS;
}
