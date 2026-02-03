// Tuning validation functions (v6)

import { ParamSpec, TuningConfig, isClassifier } from "./tuningTypes";

// Validate a single parameter specification
export function validateParamSpec(name: string, spec: ParamSpec): string[] {
  const errors: string[] = [];

  if (spec.type === "categorical") {
    if (!spec.values || spec.values.length === 0) {
      errors.push(`${name}: categorical param needs at least 1 value`);
    }
  } else {
    // int or float
    if (spec.min === undefined || spec.max === undefined) {
      errors.push(`${name}: min and max are required`);
    } else if (spec.min >= spec.max) {
      errors.push(`${name}: min must be less than max`);
    }

    if (spec.type === "int" && spec.step !== undefined) {
      if (spec.step <= 0) {
        errors.push(`${name}: step must be positive`);
      }
      if (spec.step > (spec.max! - spec.min!)) {
        errors.push(`${name}: step larger than range`);
      }
    }

    // Model-specific validation
    if (name === "n_estimators" && spec.min !== undefined && spec.min < 1) {
      errors.push(`${name}: must be at least 1`);
    }
    if (name === "n_neighbors" && spec.min !== undefined && spec.min < 1) {
      errors.push(`${name}: must be at least 1`);
    }
    if (name === "max_depth" && spec.min !== undefined && spec.min < 1) {
      errors.push(`${name}: must be at least 1 (use categorical with null for unlimited)`);
    }
    if (name === "C" && spec.min !== undefined && spec.min <= 0) {
      errors.push(`${name}: must be greater than 0`);
    }
    if (name === "learning_rate" && spec.min !== undefined && spec.min <= 0) {
      errors.push(`${name}: must be greater than 0`);
    }
    if (name === "alpha" && spec.min !== undefined && spec.min < 0) {
      errors.push(`${name}: must be non-negative`);
    }
  }

  return errors;
}

// Validate entire search space
export function validateSearchSpace(params: Record<string, ParamSpec>): string[] {
  const errors: string[] = [];

  if (Object.keys(params).length === 0) {
    errors.push("Search space is empty. Add at least one parameter to tune.");
    return errors;
  }

  for (const [name, spec] of Object.entries(params)) {
    errors.push(...validateParamSpec(name, spec));
  }

  return errors;
}

// Calculate total combinations for grid search
export function calculateGridCombinations(params: Record<string, ParamSpec>): number {
  if (Object.keys(params).length === 0) {
    return 0;
  }

  let total = 1;

  for (const spec of Object.values(params)) {
    if (spec.type === "categorical") {
      total *= spec.values!.length;
    } else if (spec.type === "int" && spec.step !== undefined) {
      const range = Math.floor((spec.max! - spec.min!) / spec.step) + 1;
      total *= range;
    } else {
      // Continuous float without step - can't enumerate
      return Infinity;
    }
  }

  return total;
}

// Validate grid search is possible (all params enumerable)
export function validateGridSearch(params: Record<string, ParamSpec>): string[] {
  const errors: string[] = [];

  for (const [name, spec] of Object.entries(params)) {
    if (spec.type === "float" && spec.step === undefined) {
      errors.push(
        `${name}: Grid Search requires discrete values. Add step size or use Random/Bayesian.`
      );
    }
    if (spec.type === "int" && spec.step === undefined) {
      errors.push(
        `${name}: Grid Search requires step size for integer parameters.`
      );
    }
  }

  return errors;
}

// Validate tuning configuration
export function validateTuningConfig(
  config: TuningConfig,
  modelType: string
): string[] {
  const errors: string[] = [];

  // Validate sampler-specific requirements
  if (config.sampler === "grid") {
    const gridErrors = validateGridSearch(config.searchSpace);
    errors.push(...gridErrors);

    if (gridErrors.length === 0) {
      const combinations = calculateGridCombinations(config.searchSpace);
      if (combinations > 10000) {
        errors.push(
          `Grid search would run ${combinations.toLocaleString()} trials. Consider using Random/Bayesian or reducing parameter ranges.`
        );
      }
    }
  } else {
    // Random or Bayesian
    if (config.nTrials < 1) {
      errors.push("Number of trials must be at least 1");
    }
    if (config.nTrials > 1000) {
      errors.push("Number of trials should not exceed 1000");
    }
  }

  // Validate CV folds
  if (config.cvFolds < 2) {
    errors.push("Cross-validation folds must be at least 2");
  }
  if (config.cvFolds > 10) {
    errors.push("Cross-validation folds should not exceed 10");
  }

  // Validate metric matches model type
  const classificationMetrics = ["accuracy", "f1", "precision", "recall", "roc_auc"];
  const regressionMetrics = ["r2", "neg_mean_squared_error", "neg_mean_absolute_error", "neg_root_mean_squared_error"];

  if (isClassifier(modelType)) {
    if (!classificationMetrics.includes(config.scoringMetric)) {
      errors.push(`${config.scoringMetric} is not a valid classification metric`);
    }
  } else {
    if (!regressionMetrics.includes(config.scoringMetric)) {
      errors.push(`${config.scoringMetric} is not a valid regression metric`);
    }
  }

  // Validate search space
  errors.push(...validateSearchSpace(config.searchSpace));

  return errors;
}

// Format grid search warning message
export function formatGridWarning(params: Record<string, ParamSpec>, cvFolds: number): string | null {
  const combinations = calculateGridCombinations(params);

  if (combinations === Infinity) {
    return null; // Grid search not possible
  }

  if (combinations <= 20) {
    return null; // Small enough, no warning needed
  }

  const totalFits = combinations * cvFolds;
  return `Grid Search will run ${combinations} trials (${totalFits} fits with ${cvFolds}-fold CV)`;
}

// Check if tuning is valid for a node
export function canTune(nodeData: {
  trainerMode?: string;
  modelType?: string;
  targetColumn?: string;
}): { valid: boolean; reason?: string } {
  if (nodeData.trainerMode === "load") {
    return { valid: false, reason: "Cannot tune in Load mode" };
  }

  if (!nodeData.modelType) {
    return { valid: false, reason: "Select a model type first" };
  }

  if (!nodeData.targetColumn) {
    return { valid: false, reason: "Set target column first" };
  }

  // Linear regression has no hyperparameters
  if (nodeData.modelType === "linear_regression") {
    return { valid: false, reason: "Linear Regression has no tunable hyperparameters" };
  }

  return { valid: true };
}
