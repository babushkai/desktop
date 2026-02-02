import { NodeData } from "../stores/pipelineStore";
import { SPLIT_INDICES_FILE, MODEL_FILE } from "./constants";

// TrainerData subset - what the evaluator actually needs from trainer
export interface TrainerInfo {
  targetColumn?: string;
  testSplit?: number;
  modelType?: string;
}

const sanitizePath = (p: string): string =>
  p.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

export const generateEvaluatorCode = (
  trainerData: TrainerInfo | NodeData,
  modelPath: string,
  dataPath: string
): string => {
  const targetCol = trainerData.targetColumn?.replace(/"/g, '\\"') || "target";
  const testSplit = trainerData.testSplit || 0.2;
  const safeModelPath = sanitizePath(modelPath);
  const safeDataPath = sanitizePath(dataPath);

  return `import sys
import pandas as pd
import joblib
import numpy as np
from sklearn.base import is_classifier, is_regressor
from sklearn.model_selection import train_test_split
import json as _json

try:
    model = joblib.load("${safeModelPath}")
    df = pd.read_csv("${safeDataPath}")

    target_col = "${targetCol}"
    if target_col not in df.columns:
        print(f"ERROR: Column '{target_col}' not found. Available: {list(df.columns)}")
        sys.exit(1)

    X = df.drop(target_col, axis=1)
    y = df[target_col]

    _, X_test, _, y_test = train_test_split(
        X, y, test_size=${testSplit}, random_state=42
    )

    y_pred = model.predict(X_test)

    print("=" * 40)
    print("EVALUATION RESULTS")
    print("=" * 40)

    if is_classifier(model):
        from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix

        print("Model Type: Classifier")
        print("-" * 40)

        acc = accuracy_score(y_test, y_pred)
        average = 'binary' if len(np.unique(y)) == 2 else 'weighted'
        prec = precision_score(y_test, y_pred, average=average, zero_division=0)
        rec = recall_score(y_test, y_pred, average=average, zero_division=0)
        f1 = f1_score(y_test, y_pred, average=average, zero_division=0)
        cm = confusion_matrix(y_test, y_pred)

        print(f"Accuracy:  {acc:.4f}")
        print(f"Precision: {prec:.4f}")
        print(f"Recall:    {rec:.4f}")
        print(f"F1 Score:  {f1:.4f}")
        print("-" * 40)
        print("Confusion Matrix:")
        print(cm)

        # Emit structured metrics for visualization
        print(_json.dumps({
            "type": "metrics",
            "modelType": "classifier",
            "data": {
                "accuracy": float(acc),
                "precision": float(prec),
                "recall": float(rec),
                "f1": float(f1),
                "confusionMatrix": cm.tolist()
            }
        }))

    elif is_regressor(model):
        from sklearn.metrics import r2_score, mean_squared_error, mean_absolute_error

        print("Model Type: Regressor")
        print("-" * 40)

        r2 = r2_score(y_test, y_pred)
        mse = mean_squared_error(y_test, y_pred)
        rmse = np.sqrt(mse)
        mae = mean_absolute_error(y_test, y_pred)

        print(f"R2 Score:  {r2:.4f}")
        print(f"MSE:       {mse:.4f}")
        print(f"RMSE:      {rmse:.4f}")
        print(f"MAE:       {mae:.4f}")

        # Emit structured metrics for visualization
        print(_json.dumps({
            "type": "metrics",
            "modelType": "regressor",
            "data": {
                "r2": float(r2),
                "mse": float(mse),
                "rmse": float(rmse),
                "mae": float(mae)
            }
        }))

    else:
        print(f"Warning: Could not determine model type for {type(model).__name__}")

    print("=" * 40)
    print("Evaluation complete!")

except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
`;
};

export const generateEvaluatorCodeWithSplit = (
  trainerData: NodeData,
  dataPath: string
): string => {
  const targetCol = trainerData.targetColumn?.replace(/"/g, '\\"') || "target";
  const safeDataPath = sanitizePath(dataPath);

  return `import sys
import os
import json
import pandas as pd
import joblib
import numpy as np
from sklearn.base import is_classifier, is_regressor
import json as _json

try:
    # Pre-execution validation
    if not os.path.exists("${SPLIT_INDICES_FILE}"):
        print("ERROR: ${SPLIT_INDICES_FILE} not found. Run DataSplit node first.")
        sys.exit(1)
    if not os.path.exists("${MODEL_FILE}"):
        print("ERROR: ${MODEL_FILE} not found. Run Trainer node first.")
        sys.exit(1)

    model = joblib.load("${MODEL_FILE}")
    df = pd.read_csv("${safeDataPath}")

    with open("${SPLIT_INDICES_FILE}", "r") as f:
        split_info = json.load(f)

    test_idx = split_info["test_indices"]

    target_col = "${targetCol}"
    if target_col not in df.columns:
        print(f"ERROR: Column '{target_col}' not found. Available: {list(df.columns)}")
        sys.exit(1)

    X = df.drop(target_col, axis=1)
    y = df[target_col]

    # Use pre-computed indices from DataSplit
    X_test = X.iloc[test_idx]
    y_test = y.iloc[test_idx]

    y_pred = model.predict(X_test)

    print("=" * 40)
    print("EVALUATION RESULTS")
    print("=" * 40)
    print(f"Test samples: {len(test_idx)}")

    if is_classifier(model):
        from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix

        print("Model Type: Classifier")
        print("-" * 40)

        acc = accuracy_score(y_test, y_pred)
        average = 'binary' if len(np.unique(y)) == 2 else 'weighted'
        prec = precision_score(y_test, y_pred, average=average, zero_division=0)
        rec = recall_score(y_test, y_pred, average=average, zero_division=0)
        f1 = f1_score(y_test, y_pred, average=average, zero_division=0)
        cm = confusion_matrix(y_test, y_pred)

        print(f"Accuracy:  {acc:.4f}")
        print(f"Precision: {prec:.4f}")
        print(f"Recall:    {rec:.4f}")
        print(f"F1 Score:  {f1:.4f}")
        print("-" * 40)
        print("Confusion Matrix:")
        print(cm)

        # Emit structured metrics for visualization
        print(_json.dumps({
            "type": "metrics",
            "modelType": "classifier",
            "data": {
                "accuracy": float(acc),
                "precision": float(prec),
                "recall": float(rec),
                "f1": float(f1),
                "confusionMatrix": cm.tolist()
            }
        }))

    elif is_regressor(model):
        from sklearn.metrics import r2_score, mean_squared_error, mean_absolute_error

        print("Model Type: Regressor")
        print("-" * 40)

        r2 = r2_score(y_test, y_pred)
        mse = mean_squared_error(y_test, y_pred)
        rmse = np.sqrt(mse)
        mae = mean_absolute_error(y_test, y_pred)

        print(f"R2 Score:  {r2:.4f}")
        print(f"MSE:       {mse:.4f}")
        print(f"RMSE:      {rmse:.4f}")
        print(f"MAE:       {mae:.4f}")

        # Emit structured metrics for visualization
        print(_json.dumps({
            "type": "metrics",
            "modelType": "regressor",
            "data": {
                "r2": float(r2),
                "mse": float(mse),
                "rmse": float(rmse),
                "mae": float(mae)
            }
        }))

    else:
        print(f"Warning: Could not determine model type for {type(model).__name__}")

    print("=" * 40)
    print("Evaluation complete!")

except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
`;
};

/**
 * Generate evaluator code for auto-detect mode (when loading pre-trained model or from script).
 * Assumes the last column in the dataset is the target column.
 */
export const generateAutoEvaluatorCode = (
  modelPath: string,
  dataPath: string,
  testSplit: number = 0.2
): string => {
  const safeModelPath = sanitizePath(modelPath);
  const safeDataPath = sanitizePath(dataPath);

  return `import sys
import os
import pandas as pd
import joblib
import numpy as np
from sklearn.base import is_classifier, is_regressor
from sklearn.model_selection import train_test_split
import json as _json

try:
    if not os.path.exists("${safeModelPath}"):
        print(f"ERROR: Model file not found: ${safeModelPath}")
        print("If using Script node, ensure your script saves a model to this location using:")
        print("  joblib.dump(model, '${safeModelPath}')")
        sys.exit(1)

    model = joblib.load("${safeModelPath}")
    df = pd.read_csv("${safeDataPath}")

    # Auto-detect target column: assume last column is target
    target_col = df.columns[-1]
    print(f"Auto-detected target column: {target_col}")

    X = df.drop(target_col, axis=1)
    y = df[target_col]

    _, X_test, _, y_test = train_test_split(
        X, y, test_size=${testSplit}, random_state=42
    )

    y_pred = model.predict(X_test)

    print("=" * 40)
    print("EVALUATION RESULTS")
    print("=" * 40)

    if is_classifier(model):
        from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix

        print("Model Type: Classifier")
        print("-" * 40)

        acc = accuracy_score(y_test, y_pred)
        average = 'binary' if len(np.unique(y)) == 2 else 'weighted'
        prec = precision_score(y_test, y_pred, average=average, zero_division=0)
        rec = recall_score(y_test, y_pred, average=average, zero_division=0)
        f1 = f1_score(y_test, y_pred, average=average, zero_division=0)
        cm = confusion_matrix(y_test, y_pred)

        print(f"Accuracy:  {acc:.4f}")
        print(f"Precision: {prec:.4f}")
        print(f"Recall:    {rec:.4f}")
        print(f"F1 Score:  {f1:.4f}")
        print("-" * 40)
        print("Confusion Matrix:")
        print(cm)

        # Emit structured metrics for visualization
        print(_json.dumps({
            "type": "metrics",
            "modelType": "classifier",
            "data": {
                "accuracy": float(acc),
                "precision": float(prec),
                "recall": float(rec),
                "f1": float(f1),
                "confusionMatrix": cm.tolist()
            }
        }))

    elif is_regressor(model):
        from sklearn.metrics import r2_score, mean_squared_error, mean_absolute_error

        print("Model Type: Regressor")
        print("-" * 40)

        r2 = r2_score(y_test, y_pred)
        mse = mean_squared_error(y_test, y_pred)
        rmse = np.sqrt(mse)
        mae = mean_absolute_error(y_test, y_pred)

        print(f"R2 Score:  {r2:.4f}")
        print(f"MSE:       {mse:.4f}")
        print(f"RMSE:      {rmse:.4f}")
        print(f"MAE:       {mae:.4f}")

        # Emit structured metrics for visualization
        print(_json.dumps({
            "type": "metrics",
            "modelType": "regressor",
            "data": {
                "r2": float(r2),
                "mse": float(mse),
                "rmse": float(rmse),
                "mae": float(mae)
            }
        }))

    else:
        print(f"Warning: Could not determine model type for {type(model).__name__}")

    print("=" * 40)
    print("Evaluation complete (auto-detect mode)!")

except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
`;
};
