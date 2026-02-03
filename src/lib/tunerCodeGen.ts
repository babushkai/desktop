// Optuna-based hyperparameter tuning code generator (v6)

import { NodeData } from "../stores/pipelineStore";
import { TuningConfig, ParamSpec } from "./tuningTypes";
import { WORK_DIR, MODEL_FILE } from "./constants";

// Model configuration mapping (same as trainerCodeGen.ts)
const MODEL_CONFIG: Record<string, { module: string; class: string }> = {
  // Regressors
  linear_regression: { module: "sklearn.linear_model", class: "LinearRegression" },
  random_forest: { module: "sklearn.ensemble", class: "RandomForestRegressor" },
  gradient_boosting: { module: "sklearn.ensemble", class: "GradientBoostingRegressor" },
  svr: { module: "sklearn.svm", class: "SVR" },
  knn_regressor: { module: "sklearn.neighbors", class: "KNeighborsRegressor" },
  mlp_regressor: { module: "sklearn.neural_network", class: "MLPRegressor" },
  // Classifiers
  logistic_regression: { module: "sklearn.linear_model", class: "LogisticRegression" },
  random_forest_classifier: { module: "sklearn.ensemble", class: "RandomForestClassifier" },
  gradient_boosting_classifier: { module: "sklearn.ensemble", class: "GradientBoostingClassifier" },
  svc: { module: "sklearn.svm", class: "SVC" },
  knn_classifier: { module: "sklearn.neighbors", class: "KNeighborsClassifier" },
  mlp_classifier: { module: "sklearn.neural_network", class: "MLPClassifier" },
};

// Sanitize file path for embedding in Python string
const sanitizePath = (p: string): string =>
  p.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

// Generate suggest call for a parameter
function generateSuggestCall(name: string, spec: ParamSpec): string {
  if (spec.type === "categorical") {
    // Convert values to Python literals (null -> None)
    const pyValues = spec.values!.map(toPythonValue).join(", ");
    return `trial.suggest_categorical("${name}", [${pyValues}])`;
  } else if (spec.type === "int") {
    if (spec.step !== undefined && spec.step > 1) {
      return `trial.suggest_int("${name}", ${spec.min}, ${spec.max}, step=${spec.step})`;
    }
    return `trial.suggest_int("${name}", ${spec.min}, ${spec.max})`;
  } else {
    // float
    if (spec.distribution === "log") {
      return `trial.suggest_float("${name}", ${spec.min}, ${spec.max}, log=True)`;
    }
    return `trial.suggest_float("${name}", ${spec.min}, ${spec.max})`;
  }
}

// Convert JSON value to Python literal (handles null -> None)
function toPythonValue(value: unknown): string {
  if (value === null) return "None";
  if (typeof value === "string") return `"${value}"`;
  if (typeof value === "boolean") return value ? "True" : "False";
  return String(value);
}

// Generate GridSampler search space dict (explicit enumeration)
function generateGridSearchSpaceDict(searchSpace: Record<string, ParamSpec>): string {
  const entries: string[] = [];

  for (const [name, spec] of Object.entries(searchSpace)) {
    if (spec.type === "categorical") {
      // Convert each value to Python literal
      const pyValues = spec.values!.map(toPythonValue).join(", ");
      entries.push(`"${name}": [${pyValues}]`);
    } else if (spec.type === "int" && spec.step !== undefined) {
      const values: number[] = [];
      for (let v = spec.min!; v <= spec.max!; v += spec.step) {
        values.push(v);
      }
      entries.push(`"${name}": [${values.join(", ")}]`);
    } else if (spec.type === "float" && spec.step !== undefined) {
      // Float with step can also be enumerated
      const values: number[] = [];
      for (let v = spec.min!; v <= spec.max!; v += spec.step) {
        values.push(Math.round(v * 10000) / 10000); // Avoid floating point issues
      }
      entries.push(`"${name}": [${values.join(", ")}]`);
    }
    // Note: Continuous ranges without step should have been caught by validation
  }

  return `{${entries.join(", ")}}`;
}

// Generate sampler initialization code
function generateSamplerCode(config: TuningConfig): string {
  if (config.sampler === "grid") {
    const searchSpaceDict = generateGridSearchSpaceDict(config.searchSpace);
    return `sampler = optuna.samplers.GridSampler(${searchSpaceDict})`;
  } else if (config.sampler === "random") {
    return `sampler = optuna.samplers.RandomSampler(seed=42)`;
  } else {
    // bayesian (TPE)
    return `sampler = optuna.samplers.TPESampler(seed=42)`;
  }
}

// Generate study.optimize call
function generateOptimizeCall(config: TuningConfig): string {
  if (config.sampler === "grid") {
    // Grid runs all combinations automatically
    return `study.optimize(objective, show_progress_bar=False)`;
  } else {
    return `study.optimize(objective, n_trials=${config.nTrials}, show_progress_bar=False)`;
  }
}

// Generate objective function parameter extraction
function generateParamExtraction(searchSpace: Record<string, ParamSpec>): string {
  const lines: string[] = [];

  for (const [name, spec] of Object.entries(searchSpace)) {
    const suggestCall = generateSuggestCall(name, spec);
    lines.push(`        ${name} = ${suggestCall}`);
  }

  return lines.join("\n");
}

// Generate model instantiation with hyperparameters
function generateModelInstantiation(
  modelClass: string,
  searchSpace: Record<string, ParamSpec>
): string {
  const paramNames = Object.keys(searchSpace);

  if (paramNames.length === 0) {
    return `${modelClass}(random_state=42)`;
  }

  // Handle special cases for MLP hidden_layer_sizes
  const params = paramNames.map((name) => {
    if (name === "hidden_layer_sizes") {
      // hidden_layer_sizes is stored as string like "(100, 50)" - need to eval it
      return `hidden_layer_sizes=eval(${name}) if isinstance(${name}, str) else ${name}`;
    }
    return `${name}=${name}`;
  });

  // Add random_state for reproducibility if model supports it
  params.push("random_state=42");

  return `${modelClass}(${params.join(", ")})`;
}

// Determine optimization direction based on metric
function getOptimizationDirection(metric: string): "maximize" | "minimize" {
  // Metrics that should be maximized
  const maximizeMetrics = ["accuracy", "f1", "precision", "recall", "roc_auc", "r2"];

  if (maximizeMetrics.includes(metric)) {
    return "maximize";
  }

  // neg_* metrics in sklearn are already negated, so we maximize them
  if (metric.startsWith("neg_")) {
    return "maximize";
  }

  return "minimize";
}

// Main tuning code generator
export function generateTuningCode(
  nodeData: NodeData,
  inputPath: string,
  tuningConfig: TuningConfig
): string {
  const modelType = nodeData.modelType || "random_forest";
  const config = MODEL_CONFIG[modelType];
  const targetCol = nodeData.targetColumn?.replace(/"/g, '\\"') || "target";
  const safePath = sanitizePath(inputPath);

  const direction = getOptimizationDirection(tuningConfig.scoringMetric);
  const paramExtraction = generateParamExtraction(tuningConfig.searchSpace);
  const modelInstantiation = generateModelInstantiation(config.class, tuningConfig.searchSpace);
  const samplerCode = generateSamplerCode(tuningConfig);
  const optimizeCall = generateOptimizeCall(tuningConfig);

  return `import sys
import os
import json
import time
import pandas as pd
import joblib

# Check Optuna installation
try:
    import optuna
    optuna.logging.set_verbosity(optuna.logging.WARNING)
except ImportError:
    print(json.dumps({"type": "error", "message": "Optuna not installed. Run: pip install optuna"}))
    sys.exit(1)

from sklearn.model_selection import cross_val_score
from ${config.module} import ${config.class}

def emit(event_type, **kwargs):
    print(json.dumps({"type": event_type, **kwargs}), flush=True)

try:
    os.makedirs("${WORK_DIR}", exist_ok=True)

    # Load data
    df = pd.read_csv("${safePath}")
    target_col = "${targetCol}"

    if target_col not in df.columns:
        emit("error", message=f"Column '{target_col}' not found. Available: {list(df.columns)}")
        sys.exit(1)

    X = df.drop(target_col, axis=1)
    y = df[target_col]

    emit("log", message=f"Starting hyperparameter tuning with {len(X)} samples...")
    emit("log", message=f"Model: ${modelType}")
    emit("log", message=f"Sampler: ${tuningConfig.sampler}")
    emit("log", message=f"Metric: ${tuningConfig.scoringMetric}")
    emit("log", message=f"CV Folds: ${tuningConfig.cvFolds}")
    emit("log", message="")

    start_time = time.time()
    trial_count = 0

    def objective(trial):
        global trial_count
        trial_start = time.time()
        trial_count += 1

        # Extract hyperparameters
${paramExtraction}

        # Create model
        model = ${modelInstantiation}

        # Cross-validation
        scores = cross_val_score(model, X, y, cv=${tuningConfig.cvFolds}, scoring="${tuningConfig.scoringMetric}")
        score = scores.mean()

        trial_duration = int((time.time() - trial_start) * 1000)

        # Emit trial result
        emit("trial",
            trialNumber=trial.number + 1,
            params=trial.params,
            score=float(score),
            durationMs=trial_duration
        )

        return score

    # Create sampler
    ${samplerCode}

    # Create study
    study = optuna.create_study(direction="${direction}", sampler=sampler)

    # Run optimization
    ${optimizeCall}

    total_duration = int((time.time() - start_time) * 1000)

    emit("log", message="")
    emit("log", message="--- Tuning Complete ---")
    emit("log", message=f"Best score: {study.best_value:.4f}")
    emit("log", message=f"Best params: {study.best_params}")
    emit("log", message=f"Total trials: {len(study.trials)}")
    emit("log", message="")

    # Train final model with best params
    emit("log", message="Training final model with best parameters...")

    # Handle hidden_layer_sizes special case
    final_params = {}
    for key, value in study.best_params.items():
        if key == "hidden_layer_sizes" and isinstance(value, str):
            final_params[key] = eval(value)
        else:
            final_params[key] = value

    final_model = ${config.class}(**final_params, random_state=42)
    final_model.fit(X, y)

    # Save model
    joblib.dump(final_model, "${MODEL_FILE}")
    emit("log", message=f"Model saved to ${MODEL_FILE}")

    # Emit completion event
    emit("tuningComplete",
        bestParams=study.best_params,
        bestScore=float(study.best_value),
        totalTrials=len(study.trials),
        durationMs=total_duration
    )
    emit("complete")

except Exception as e:
    import traceback
    emit("error", message=str(e))
    emit("log", message=traceback.format_exc())
    sys.exit(1)
`;
}

// Generate tuning code that uses pre-computed DataSplit indices
export function generateTuningCodeWithSplit(
  nodeData: NodeData,
  inputPath: string,
  tuningConfig: TuningConfig
): string {
  const modelType = nodeData.modelType || "random_forest";
  const config = MODEL_CONFIG[modelType];
  const targetCol = nodeData.targetColumn?.replace(/"/g, '\\"') || "target";
  const safePath = sanitizePath(inputPath);

  const direction = getOptimizationDirection(tuningConfig.scoringMetric);
  const paramExtraction = generateParamExtraction(tuningConfig.searchSpace);
  const modelInstantiation = generateModelInstantiation(config.class, tuningConfig.searchSpace);
  const samplerCode = generateSamplerCode(tuningConfig);
  const optimizeCall = generateOptimizeCall(tuningConfig);

  // Import the split indices file path
  const SPLIT_INDICES_FILE = `${WORK_DIR}/split_indices.json`;

  return `import sys
import os
import json
import time
import pandas as pd
import joblib

# Check Optuna installation
try:
    import optuna
    optuna.logging.set_verbosity(optuna.logging.WARNING)
except ImportError:
    print(json.dumps({"type": "error", "message": "Optuna not installed. Run: pip install optuna"}))
    sys.exit(1)

from sklearn.model_selection import cross_val_score
from ${config.module} import ${config.class}

def emit(event_type, **kwargs):
    print(json.dumps({"type": event_type, **kwargs}), flush=True)

try:
    os.makedirs("${WORK_DIR}", exist_ok=True)

    # Check for split indices file
    if not os.path.exists("${SPLIT_INDICES_FILE}"):
        emit("error", message="${SPLIT_INDICES_FILE} not found. Run DataSplit node first.")
        sys.exit(1)

    # Load data
    df = pd.read_csv("${safePath}")
    target_col = "${targetCol}"

    if target_col not in df.columns:
        emit("error", message=f"Column '{target_col}' not found. Available: {list(df.columns)}")
        sys.exit(1)

    # Load split indices
    with open("${SPLIT_INDICES_FILE}", "r") as f:
        split_info = json.load(f)

    train_idx = split_info["train_indices"]

    X = df.drop(target_col, axis=1)
    y = df[target_col]

    # Use only training data for tuning
    X_train = X.iloc[train_idx]
    y_train = y.iloc[train_idx]

    emit("log", message=f"Starting hyperparameter tuning with {len(X_train)} training samples...")
    emit("log", message=f"Model: ${modelType}")
    emit("log", message=f"Sampler: ${tuningConfig.sampler}")
    emit("log", message=f"Metric: ${tuningConfig.scoringMetric}")
    emit("log", message=f"CV Folds: ${tuningConfig.cvFolds}")
    emit("log", message="")

    start_time = time.time()
    trial_count = 0

    def objective(trial):
        global trial_count
        trial_start = time.time()
        trial_count += 1

        # Extract hyperparameters
${paramExtraction}

        # Create model
        model = ${modelInstantiation}

        # Cross-validation on training set only
        scores = cross_val_score(model, X_train, y_train, cv=${tuningConfig.cvFolds}, scoring="${tuningConfig.scoringMetric}")
        score = scores.mean()

        trial_duration = int((time.time() - trial_start) * 1000)

        # Emit trial result
        emit("trial",
            trialNumber=trial.number + 1,
            params=trial.params,
            score=float(score),
            durationMs=trial_duration
        )

        return score

    # Create sampler
    ${samplerCode}

    # Create study
    study = optuna.create_study(direction="${direction}", sampler=sampler)

    # Run optimization
    ${optimizeCall}

    total_duration = int((time.time() - start_time) * 1000)

    emit("log", message="")
    emit("log", message="--- Tuning Complete ---")
    emit("log", message=f"Best score: {study.best_value:.4f}")
    emit("log", message=f"Best params: {study.best_params}")
    emit("log", message=f"Total trials: {len(study.trials)}")
    emit("log", message="")

    # Train final model with best params on training data
    emit("log", message="Training final model with best parameters...")

    # Handle hidden_layer_sizes special case
    final_params = {}
    for key, value in study.best_params.items():
        if key == "hidden_layer_sizes" and isinstance(value, str):
            final_params[key] = eval(value)
        else:
            final_params[key] = value

    final_model = ${config.class}(**final_params, random_state=42)
    final_model.fit(X_train, y_train)

    # Save model
    joblib.dump(final_model, "${MODEL_FILE}")
    emit("log", message=f"Model saved to ${MODEL_FILE}")

    # Emit completion event
    emit("tuningComplete",
        bestParams=study.best_params,
        bestScore=float(study.best_value),
        totalTrials=len(study.trials),
        durationMs=total_duration
    )
    emit("complete")

except Exception as e:
    import traceback
    emit("error", message=str(e))
    emit("log", message=traceback.format_exc())
    sys.exit(1)
`;
}
