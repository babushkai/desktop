import { NodeData } from "../stores/pipelineStore";
import { SPLIT_INDICES_FILE, MODEL_FILE } from "./constants";

const sanitizePath = (p: string): string =>
  p.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

export const generateEvaluatorCode = (
  trainerData: NodeData,
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
        print(f"Accuracy:  {accuracy_score(y_test, y_pred):.4f}")

        average = 'binary' if len(np.unique(y)) == 2 else 'weighted'
        print(f"Precision: {precision_score(y_test, y_pred, average=average, zero_division=0):.4f}")
        print(f"Recall:    {recall_score(y_test, y_pred, average=average, zero_division=0):.4f}")
        print(f"F1 Score:  {f1_score(y_test, y_pred, average=average, zero_division=0):.4f}")
        print("-" * 40)
        print("Confusion Matrix:")
        print(confusion_matrix(y_test, y_pred))

    elif is_regressor(model):
        from sklearn.metrics import r2_score, mean_squared_error, mean_absolute_error

        print("Model Type: Regressor")
        print("-" * 40)
        print(f"R2 Score:  {r2_score(y_test, y_pred):.4f}")
        print(f"MSE:       {mean_squared_error(y_test, y_pred):.4f}")
        print(f"RMSE:      {np.sqrt(mean_squared_error(y_test, y_pred)):.4f}")
        print(f"MAE:       {mean_absolute_error(y_test, y_pred):.4f}")

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
        print(f"Accuracy:  {accuracy_score(y_test, y_pred):.4f}")

        average = 'binary' if len(np.unique(y)) == 2 else 'weighted'
        print(f"Precision: {precision_score(y_test, y_pred, average=average, zero_division=0):.4f}")
        print(f"Recall:    {recall_score(y_test, y_pred, average=average, zero_division=0):.4f}")
        print(f"F1 Score:  {f1_score(y_test, y_pred, average=average, zero_division=0):.4f}")
        print("-" * 40)
        print("Confusion Matrix:")
        print(confusion_matrix(y_test, y_pred))

    elif is_regressor(model):
        from sklearn.metrics import r2_score, mean_squared_error, mean_absolute_error

        print("Model Type: Regressor")
        print("-" * 40)
        print(f"R2 Score:  {r2_score(y_test, y_pred):.4f}")
        print(f"MSE:       {mean_squared_error(y_test, y_pred):.4f}")
        print(f"RMSE:      {np.sqrt(mean_squared_error(y_test, y_pred)):.4f}")
        print(f"MAE:       {mean_absolute_error(y_test, y_pred):.4f}")

    else:
        print(f"Warning: Could not determine model type for {type(model).__name__}")

    print("=" * 40)
    print("Evaluation complete!")

except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
`;
};
