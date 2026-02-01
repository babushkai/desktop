import { NodeData } from "../stores/pipelineStore";
import { SPLIT_INDICES_FILE, MODEL_FILE } from "./constants";

const MODEL_CONFIG: Record<string, { module: string; class: string }> = {
  linear_regression: { module: "sklearn.linear_model", class: "LinearRegression" },
  random_forest: { module: "sklearn.ensemble", class: "RandomForestRegressor" },
  gradient_boosting: { module: "sklearn.ensemble", class: "GradientBoostingRegressor" },
};

// Sanitize file path for embedding in Python string
const sanitizePath = (p: string): string =>
  p.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

export const generateTrainerCode = (nodeData: NodeData, inputPath: string): string => {
  const config = MODEL_CONFIG[nodeData.modelType || "linear_regression"];
  const targetCol = nodeData.targetColumn?.replace(/"/g, '\\"') || "target";
  const testSplit = nodeData.testSplit || 0.2;
  const safePath = sanitizePath(inputPath);

  return `import sys
import pandas as pd
import joblib
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, mean_absolute_error
from ${config.module} import ${config.class}

try:
    df = pd.read_csv("${safePath}")

    target_col = "${targetCol}"
    if target_col not in df.columns:
        print(f"ERROR: Column '{target_col}' not found. Available: {list(df.columns)}")
        sys.exit(1)

    X = df.drop(target_col, axis=1)
    y = df[target_col]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=${testSplit}, random_state=42
    )

    model = ${config.class}()
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    print(f"Model: ${nodeData.modelType || "linear_regression"}")
    print(f"R² Score: {model.score(X_test, y_test):.4f}")
    print(f"MSE: {mean_squared_error(y_test, y_pred):.4f}")
    print(f"MAE: {mean_absolute_error(y_test, y_pred):.4f}")

    joblib.dump(model, "${MODEL_FILE}")
    print(f"Model saved to ${MODEL_FILE}")

except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
`;
};

export const generateTrainerCodeWithSplit = (
  nodeData: NodeData,
  inputPath: string
): string => {
  const config = MODEL_CONFIG[nodeData.modelType || "linear_regression"];
  const targetCol = nodeData.targetColumn?.replace(/"/g, '\\"') || "target";
  const safePath = sanitizePath(inputPath);

  return `import sys
import os
import json
import pandas as pd
import joblib
from ${config.module} import ${config.class}

try:
    # Pre-execution validation
    if not os.path.exists("${SPLIT_INDICES_FILE}"):
        print("ERROR: ${SPLIT_INDICES_FILE} not found. Run DataSplit node first.")
        sys.exit(1)

    df = pd.read_csv("${safePath}")

    with open("${SPLIT_INDICES_FILE}", "r") as f:
        split_info = json.load(f)

    train_idx = split_info["train_indices"]

    target_col = "${targetCol}"
    if target_col not in df.columns:
        print(f"ERROR: Column '{target_col}' not found. Available: {list(df.columns)}")
        sys.exit(1)

    X = df.drop(target_col, axis=1)
    y = df[target_col]

    # Use pre-computed indices from DataSplit
    X_train = X.iloc[train_idx]
    y_train = y.iloc[train_idx]

    model = ${config.class}()
    model.fit(X_train, y_train)

    print(f"Model: ${nodeData.modelType || "linear_regression"}")
    print(f"Training samples: {len(train_idx)}")

    joblib.dump(model, "${MODEL_FILE}")
    print(f"Model saved to ${MODEL_FILE}")

except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
`;
};
