import { NodeData } from "../stores/pipelineStore";
import { SPLIT_INDICES_FILE, MODEL_FILE, MODEL_INFO_FILE } from "./constants";

// TrainerData subset - what the evaluator actually needs from trainer
export interface TrainerInfo {
  targetColumn?: string;
  testSplit?: number;
  modelType?: string;
}

const sanitizePath = (p: string): string =>
  p.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

// Preprocessing code for handling categorical features (must match trainer)
const PREPROCESSING_CODE = `
def preprocess_features(df, target_col, model_info=None):
    """Preprocess features: handle missing values and encode categorical columns."""
    import warnings
    warnings.filterwarnings('ignore', category=FutureWarning)

    X = df.drop(target_col, axis=1)

    # Drop columns that are typically not useful for ML
    cols_to_drop = []
    for col in X.columns:
        # Drop ID-like columns
        if col.lower() in ['id', 'index', 'passengerid', 'ticket', 'cabin', 'name']:
            cols_to_drop.append(col)
        # Drop columns with too many unique values (likely IDs or free text)
        elif X[col].dtype == 'object' and X[col].nunique() > 50:
            cols_to_drop.append(col)

    if cols_to_drop:
        print(f"Dropping columns: {cols_to_drop}")
        X = X.drop(cols_to_drop, axis=1)

    # Identify categorical columns (include 'string' for pandas 2.0+)
    cat_cols = X.select_dtypes(include=['object', 'category', 'string']).columns.tolist()
    num_cols = X.select_dtypes(include=['number']).columns.tolist()

    # Fill missing values
    for col in num_cols:
        if X[col].isnull().any():
            X[col] = X[col].fillna(X[col].median())

    for col in cat_cols:
        if X[col].isnull().any():
            X[col] = X[col].fillna(X[col].mode()[0] if len(X[col].mode()) > 0 else 'Unknown')

    # Encode categorical columns using Label Encoding
    from sklearn.preprocessing import LabelEncoder
    encoders = {}
    for col in cat_cols:
        le = LabelEncoder()
        # If we have model_info with encoder classes, use them for consistent encoding
        if model_info and 'encoders' in model_info and col in model_info['encoders']:
            le.classes_ = np.array(model_info['encoders'][col])
            # Transform, handling unseen values
            X[col] = X[col].astype(str).apply(lambda x: le.transform([x])[0] if x in le.classes_ else -1)
        else:
            X[col] = le.fit_transform(X[col].astype(str))
        encoders[col] = le

    return X, encoders
`;

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
import os
import json
import pandas as pd
import joblib
import numpy as np
from sklearn.base import is_classifier, is_regressor
from sklearn.model_selection import train_test_split
import json as _json
${PREPROCESSING_CODE}
try:
    model = joblib.load("${safeModelPath}")
    df = pd.read_csv("${safeDataPath}")

    # Load model info for consistent encoding
    model_info = None
    if os.path.exists("${MODEL_INFO_FILE}"):
        with open("${MODEL_INFO_FILE}", "r") as f:
            model_info = json.load(f)

    target_col = "${targetCol}"
    if target_col not in df.columns:
        print(f"ERROR: Column '{target_col}' not found. Available: {list(df.columns)}")
        sys.exit(1)

    # Preprocess features (handle categorical columns and missing values)
    X, encoders = preprocess_features(df, target_col, model_info)
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
${PREPROCESSING_CODE}
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

    # Load model info for consistent encoding
    model_info = None
    if os.path.exists("${MODEL_INFO_FILE}"):
        with open("${MODEL_INFO_FILE}", "r") as f:
            model_info = json.load(f)

    test_idx = split_info["test_indices"]

    target_col = "${targetCol}"
    if target_col not in df.columns:
        print(f"ERROR: Column '{target_col}' not found. Available: {list(df.columns)}")
        sys.exit(1)

    # Preprocess features (handle categorical columns and missing values)
    X, encoders = preprocess_features(df, target_col, model_info)
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
import json
import pandas as pd
import joblib
import numpy as np
from sklearn.base import is_classifier, is_regressor
from sklearn.model_selection import train_test_split
import json as _json
${PREPROCESSING_CODE}
try:
    if not os.path.exists("${safeModelPath}"):
        print(f"ERROR: Model file not found: ${safeModelPath}")
        print("If using Script node, ensure your script saves a model to this location using:")
        print("  joblib.dump(model, '${safeModelPath}')")
        sys.exit(1)

    model = joblib.load("${safeModelPath}")
    df = pd.read_csv("${safeDataPath}")

    # Load model info for consistent encoding
    model_info = None
    if os.path.exists("${MODEL_INFO_FILE}"):
        with open("${MODEL_INFO_FILE}", "r") as f:
            model_info = json.load(f)

    # Auto-detect target column: assume last column is target
    target_col = df.columns[-1]
    print(f"Auto-detected target column: {target_col}")

    # Preprocess features (handle categorical columns and missing values)
    X, encoders = preprocess_features(df, target_col, model_info)
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
