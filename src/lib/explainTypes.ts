// Model Explainability Types (v7)

export type ExplainStatus = "idle" | "running" | "completed" | "cancelled" | "error";

// Configuration for explainability analysis
export interface ExplainConfig {
  nTopFeatures: number; // Number of top features for PDP (default: 5)
  nShapSamples: number; // Number of samples for SHAP (default: 100, 50 for KernelExplainer)
  nPermutationRepeats: number; // Repeats for permutation importance (default: 10)
}

export const DEFAULT_EXPLAIN_CONFIG: ExplainConfig = {
  nTopFeatures: 5,
  nShapSamples: 100,
  nPermutationRepeats: 10,
};

// Feature importance from permutation importance
export interface FeatureImportanceData {
  features: string[];
  importances: number[];
  stdDevs: number[];
}

// SHAP data for regression
export interface RegressionShapData {
  featureNames: string[];
  shapValues: number[][]; // [sample][feature]
  baseValue: number;
  featureValues: number[][]; // Original feature values for coloring
}

// SHAP data for classification
export interface ClassificationShapData {
  featureNames: string[];
  shapValues: number[][][]; // [class][sample][feature] - NORMALIZED
  baseValues: number[]; // Per class
  featureValues: number[][]; // Original feature values for coloring
  classNames: string[];
}

// Partial Dependence Plot data for regression
export interface RegressionPDPData {
  feature: string;
  gridValues: number[];
  pdpValues: number[];
  iceLines?: number[][]; // [sample][grid_point]
}

// Partial Dependence Plot data for classification
export interface ClassificationPDPData {
  feature: string;
  gridValues: number[];
  pdpByClass: Record<string, number[]>;
}

// Combined explain data for regression
export interface RegressionExplainData {
  type: "regression";
  modelType: string;
  featureImportance: FeatureImportanceData;
  shap?: RegressionShapData;
  pdp?: RegressionPDPData[];
  metadata: ExplainMetadata;
}

// Combined explain data for classification
export interface ClassificationExplainData {
  type: "classification";
  modelType: string;
  classNames: string[];
  featureImportance: FeatureImportanceData;
  shap?: ClassificationShapData;
  pdp?: ClassificationPDPData[];
  metadata: ExplainMetadata;
}

// Metadata about the explain run
export interface ExplainMetadata {
  runId: string;
  timestamp: string;
  nSamples: number;
  nFeatures: number;
  shapExplainer?: string;
  durationMs?: number;
}

// Union type for all explain data
export type ExplainData = RegressionExplainData | ClassificationExplainData;

// Progress event data
export interface ExplainProgressData {
  stage: "permutation_importance" | "shap" | "pdp";
  percentComplete: number;
  feature?: string;
  samplesProcessed?: number;
  totalSamples?: number;
}

// Script event types for explain (emitted from Python)
export interface ExplainProgressEvent {
  type: "explainProgress";
  data: ExplainProgressData;
}

export interface FeatureImportanceEvent {
  type: "featureImportance";
  data: FeatureImportanceData;
}

export interface ShapDataEvent {
  type: "shapData";
  data: RegressionShapData | ClassificationShapData;
}

export interface PartialDependenceEvent {
  type: "partialDependence";
  data: RegressionPDPData | ClassificationPDPData;
}

export interface ExplainCompleteEvent {
  type: "explainComplete";
  durationMs: number;
}

// Type guard helpers
export function isClassificationExplainData(
  data: ExplainData
): data is ClassificationExplainData {
  return data.type === "classification";
}

export function isRegressionExplainData(
  data: ExplainData
): data is RegressionExplainData {
  return data.type === "regression";
}

export function isClassificationShapData(
  data: RegressionShapData | ClassificationShapData
): data is ClassificationShapData {
  return "classNames" in data && Array.isArray(data.classNames);
}

export function isClassificationPDPData(
  data: RegressionPDPData | ClassificationPDPData
): data is ClassificationPDPData {
  return "pdpByClass" in data;
}
