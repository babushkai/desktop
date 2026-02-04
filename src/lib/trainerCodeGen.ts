import { NodeData } from "../stores/pipelineStore";
import { WORK_DIR, SPLIT_INDICES_FILE, MODEL_FILE, MODEL_INFO_FILE } from "./constants";

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

// Preprocessing code for handling categorical features
const PREPROCESSING_CODE = `
def preprocess_features(df, target_col):
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
        X[col] = le.fit_transform(X[col].astype(str))
        encoders[col] = le
        print(f"Encoded '{col}': {list(le.classes_)}")

    return X, encoders
`;

export const generateTrainerCode = (nodeData: NodeData, inputPath: string): string => {
  const config = MODEL_CONFIG[nodeData.modelType || "linear_regression"];
  const targetCol = nodeData.targetColumn?.replace(/"/g, '\\"') || "target";
  const testSplit = nodeData.testSplit || 0.2;
  const safePath = sanitizePath(inputPath);

  return `import sys
import os
import json
import pandas as pd
import joblib
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, mean_absolute_error
from ${config.module} import ${config.class}
${PREPROCESSING_CODE}
try:
    os.makedirs("${WORK_DIR}", exist_ok=True)
    df = pd.read_csv("${safePath}")

    target_col = "${targetCol}"
    if target_col not in df.columns:
        print(f"ERROR: Column '{target_col}' not found. Available: {list(df.columns)}")
        sys.exit(1)

    # Preprocess features (handle categorical columns and missing values)
    X, encoders = preprocess_features(df, target_col)
    y = df[target_col]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=${testSplit}, random_state=42
    )

    # Persist split indices for explainability
    split_info = {
        "train_indices": X_train.index.tolist(),
        "test_indices": X_test.index.tolist(),
        "source_file": "${safePath}",
        "split_ratio": ${testSplit},
        "target_column": target_col
    }
    with open("${SPLIT_INDICES_FILE}", "w") as f:
        json.dump(split_info, f, indent=2)
    print(f"Split indices saved to ${SPLIT_INDICES_FILE}")

    model = ${config.class}()
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    print(f"Model: ${nodeData.modelType || "linear_regression"}")
    print(f"R² Score: {model.score(X_test, y_test):.4f}")
    print(f"MSE: {mean_squared_error(y_test, y_pred):.4f}")
    print(f"MAE: {mean_absolute_error(y_test, y_pred):.4f}")

    joblib.dump(model, "${MODEL_FILE}")
    print(f"Model saved to ${MODEL_FILE}")

    # Save model info for ONNX export (n_features, feature_names)
    model_info = {
        "n_features": X_train.shape[1],
        "feature_names": X_train.columns.tolist() if hasattr(X_train, 'columns') else [f"feature_{i}" for i in range(X_train.shape[1])],
        "model_class": type(model).__name__,
        "model_type": "${nodeData.modelType || "linear_regression"}",
        "encoders": {col: list(le.classes_) for col, le in encoders.items()} if encoders else {}
    }
    with open("${MODEL_INFO_FILE}", "w") as f:
        json.dump(model_info, f, indent=2)
    print(f"Model info saved to ${MODEL_INFO_FILE}")

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
${PREPROCESSING_CODE}
try:
    os.makedirs("${WORK_DIR}", exist_ok=True)

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

    # Preprocess features (handle categorical columns and missing values)
    X, encoders = preprocess_features(df, target_col)
    y = df[target_col]

    # Use pre-computed indices from DataSplit
    X_train = X.iloc[train_idx]
    y_train = y.iloc[train_idx]

    model = ${config.class}()
    model.fit(X_train, y_train)

    print(f"Model: ${nodeData.modelType || "linear_regression"}")
    print(f"Training samples: {len(train_idx)}")

    # Update split_info with target_column for explainability
    split_info["target_column"] = target_col
    with open("${SPLIT_INDICES_FILE}", "w") as f:
        json.dump(split_info, f, indent=2)

    joblib.dump(model, "${MODEL_FILE}")
    print(f"Model saved to ${MODEL_FILE}")

    # Save model info for ONNX export (n_features, feature_names)
    model_info = {
        "n_features": X_train.shape[1],
        "feature_names": X_train.columns.tolist() if hasattr(X_train, 'columns') else [f"feature_{i}" for i in range(X_train.shape[1])],
        "model_class": type(model).__name__,
        "model_type": "${nodeData.modelType || "linear_regression"}",
        "encoders": {col: list(le.classes_) for col, le in encoders.items()} if encoders else {}
    }
    with open("${MODEL_INFO_FILE}", "w") as f:
        json.dump(model_info, f, indent=2)
    print(f"Model info saved to ${MODEL_INFO_FILE}")

except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
`;
};
