// Model Explainability Configuration (v7)

export type ShapExplainer = "TreeExplainer" | "LinearExplainer" | "KernelExplainer";
export type ShapSpeed = "fast" | "moderate" | "very_slow";

export interface ExplainCapabilities {
  // Built-in feature importance attribute (e.g., "feature_importances_" or "coef_")
  builtinImportance: string | null;
  // Which SHAP explainer to use
  shapExplainer: ShapExplainer;
  // Expected speed for SHAP computation
  shapSpeed: ShapSpeed;
  // Whether PDP is supported (some models have limited support)
  pdpSupported: boolean;
  // Warning message for slow/limited support
  shapWarning?: string;
}

// Model compatibility matrix for explainability methods
export const MODEL_EXPLAIN_CONFIG: Record<string, ExplainCapabilities> = {
  // Tree-based regressors
  random_forest: {
    builtinImportance: "feature_importances_",
    shapExplainer: "TreeExplainer",
    shapSpeed: "fast",
    pdpSupported: true,
  },
  gradient_boosting: {
    builtinImportance: "feature_importances_",
    shapExplainer: "TreeExplainer",
    shapSpeed: "fast",
    pdpSupported: true,
  },

  // Tree-based classifiers
  random_forest_classifier: {
    builtinImportance: "feature_importances_",
    shapExplainer: "TreeExplainer",
    shapSpeed: "fast",
    pdpSupported: true,
  },
  gradient_boosting_classifier: {
    builtinImportance: "feature_importances_",
    shapExplainer: "TreeExplainer",
    shapSpeed: "fast",
    pdpSupported: true,
  },

  // Linear models
  linear_regression: {
    builtinImportance: "coef_",
    shapExplainer: "LinearExplainer",
    shapSpeed: "fast",
    pdpSupported: true,
  },
  logistic_regression: {
    builtinImportance: "coef_",
    shapExplainer: "LinearExplainer",
    shapSpeed: "fast",
    pdpSupported: true,
  },

  // Support Vector Machines
  svr: {
    builtinImportance: null,
    shapExplainer: "KernelExplainer",
    shapSpeed: "very_slow",
    pdpSupported: false,
    shapWarning:
      "KernelExplainer is O(n²) and can be very slow. Limited to 50 samples.",
  },
  svc: {
    builtinImportance: null,
    shapExplainer: "KernelExplainer",
    shapSpeed: "very_slow",
    pdpSupported: false,
    shapWarning:
      "KernelExplainer is O(n²) and can be very slow. Limited to 50 samples.",
  },

  // K-Nearest Neighbors
  knn_regressor: {
    builtinImportance: null,
    shapExplainer: "KernelExplainer",
    shapSpeed: "very_slow",
    pdpSupported: true,
    shapWarning:
      "KernelExplainer is O(n²) and can be very slow. Limited to 50 samples.",
  },
  knn_classifier: {
    builtinImportance: null,
    shapExplainer: "KernelExplainer",
    shapSpeed: "very_slow",
    pdpSupported: true,
    shapWarning:
      "KernelExplainer is O(n²) and can be very slow. Limited to 50 samples.",
  },

  // Neural Networks
  mlp_regressor: {
    builtinImportance: null,
    shapExplainer: "KernelExplainer",
    shapSpeed: "very_slow",
    pdpSupported: false,
    shapWarning:
      "KernelExplainer is O(n²) and can be very slow. Limited to 50 samples.",
  },
  mlp_classifier: {
    builtinImportance: null,
    shapExplainer: "KernelExplainer",
    shapSpeed: "very_slow",
    pdpSupported: false,
    shapWarning:
      "KernelExplainer is O(n²) and can be very slow. Limited to 50 samples.",
  },
};

// Get capabilities for a model type (with fallback to KernelExplainer)
export function getModelExplainConfig(modelType: string): ExplainCapabilities {
  return (
    MODEL_EXPLAIN_CONFIG[modelType] || {
      builtinImportance: null,
      shapExplainer: "KernelExplainer",
      shapSpeed: "very_slow",
      pdpSupported: true,
      shapWarning: `Unknown model type "${modelType}". Using KernelExplainer (slow).`,
    }
  );
}

// Check if SHAP will be slow for this model
export function isSlowShap(modelType: string): boolean {
  const config = getModelExplainConfig(modelType);
  return config.shapSpeed === "very_slow";
}

// Get max SHAP samples based on model type
export function getMaxShapSamples(modelType: string): number {
  const config = getModelExplainConfig(modelType);
  return config.shapSpeed === "very_slow" ? 50 : 100;
}
