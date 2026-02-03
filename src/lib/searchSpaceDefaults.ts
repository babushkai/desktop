// Default hyperparameter search spaces per model type (v6)

import { ParamSpec } from "./tuningTypes";

export type SearchSpacePreset = Record<string, ParamSpec>;

// Linear Regression has no tunable hyperparameters in sklearn
// (fit_intercept is always True for standard use)
export const LINEAR_REGRESSION_SPACE: SearchSpacePreset = {};

// Logistic Regression
export const LOGISTIC_REGRESSION_SPACE: SearchSpacePreset = {
  C: {
    type: "float",
    min: 0.01,
    max: 100,
    distribution: "log",
  },
  max_iter: {
    type: "int",
    min: 100,
    max: 1000,
    step: 100,
  },
};

// Random Forest (Regressor and Classifier)
export const RANDOM_FOREST_SPACE: SearchSpacePreset = {
  n_estimators: {
    type: "int",
    min: 50,
    max: 300,
    step: 50,
  },
  max_depth: {
    type: "categorical",
    values: [null, 5, 10, 20, 30],
  },
  min_samples_split: {
    type: "int",
    min: 2,
    max: 20,
    step: 2,
  },
  min_samples_leaf: {
    type: "int",
    min: 1,
    max: 10,
    step: 1,
  },
};

// Gradient Boosting (Regressor and Classifier)
export const GRADIENT_BOOSTING_SPACE: SearchSpacePreset = {
  n_estimators: {
    type: "int",
    min: 50,
    max: 300,
    step: 50,
  },
  learning_rate: {
    type: "float",
    min: 0.01,
    max: 0.3,
    distribution: "log",
  },
  max_depth: {
    type: "int",
    min: 3,
    max: 10,
    step: 1,
  },
  subsample: {
    type: "float",
    min: 0.5,
    max: 1.0,
    distribution: "uniform",
  },
};

// SVM (SVR and SVC)
export const SVM_SPACE: SearchSpacePreset = {
  C: {
    type: "float",
    min: 0.1,
    max: 100,
    distribution: "log",
  },
  kernel: {
    type: "categorical",
    values: ["rbf", "linear", "poly"],
  },
  gamma: {
    type: "categorical",
    values: ["scale", "auto"],
  },
};

// KNN (Regressor and Classifier)
export const KNN_SPACE: SearchSpacePreset = {
  n_neighbors: {
    type: "int",
    min: 3,
    max: 21,
    step: 2,
  },
  weights: {
    type: "categorical",
    values: ["uniform", "distance"],
  },
  metric: {
    type: "categorical",
    values: ["euclidean", "manhattan", "minkowski"],
  },
};

// MLP (Neural Network - Regressor and Classifier)
export const MLP_SPACE: SearchSpacePreset = {
  hidden_layer_sizes: {
    type: "categorical",
    values: ["(50,)", "(100,)", "(100, 50)", "(100, 100)"],
  },
  alpha: {
    type: "float",
    min: 0.0001,
    max: 0.1,
    distribution: "log",
  },
  learning_rate_init: {
    type: "float",
    min: 0.0001,
    max: 0.1,
    distribution: "log",
  },
  max_iter: {
    type: "int",
    min: 200,
    max: 1000,
    step: 100,
  },
};

// Mapping from model type to default search space
const MODEL_SEARCH_SPACES: Record<string, SearchSpacePreset> = {
  // Regressors
  linear_regression: LINEAR_REGRESSION_SPACE,
  random_forest: RANDOM_FOREST_SPACE,
  gradient_boosting: GRADIENT_BOOSTING_SPACE,
  svr: SVM_SPACE,
  knn_regressor: KNN_SPACE,
  mlp_regressor: MLP_SPACE,
  // Classifiers
  logistic_regression: LOGISTIC_REGRESSION_SPACE,
  random_forest_classifier: RANDOM_FOREST_SPACE,
  gradient_boosting_classifier: GRADIENT_BOOSTING_SPACE,
  svc: SVM_SPACE,
  knn_classifier: KNN_SPACE,
  mlp_classifier: MLP_SPACE,
};

// Get default search space for a model type
export function getDefaultSearchSpace(modelType: string): SearchSpacePreset {
  return MODEL_SEARCH_SPACES[modelType] || {};
}

// Get default metric for a model type
export function getDefaultMetric(modelType: string): string {
  const classifiers = [
    "logistic_regression",
    "random_forest_classifier",
    "gradient_boosting_classifier",
    "svc",
    "knn_classifier",
    "mlp_classifier",
  ];
  return classifiers.includes(modelType) ? "accuracy" : "r2";
}

// Human-readable parameter names
export const PARAM_DISPLAY_NAMES: Record<string, string> = {
  n_estimators: "Number of Estimators",
  max_depth: "Max Depth",
  min_samples_split: "Min Samples Split",
  min_samples_leaf: "Min Samples Leaf",
  learning_rate: "Learning Rate",
  subsample: "Subsample Ratio",
  C: "Regularization (C)",
  kernel: "Kernel",
  gamma: "Gamma",
  n_neighbors: "Number of Neighbors",
  weights: "Weights",
  metric: "Distance Metric",
  hidden_layer_sizes: "Hidden Layers",
  alpha: "Alpha (L2 Penalty)",
  learning_rate_init: "Initial Learning Rate",
  max_iter: "Max Iterations",
};

// Get display name for a parameter
export function getParamDisplayName(paramName: string): string {
  return PARAM_DISPLAY_NAMES[paramName] || paramName;
}
