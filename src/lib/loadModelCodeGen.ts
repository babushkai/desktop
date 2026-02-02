import { WORK_DIR, MODEL_FILE } from "./constants";

// Sanitize file path for embedding in Python string
const sanitizePath = (p: string): string =>
  p.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/**
 * Generate Python code to load a pre-trained model from a file.
 * The model is copied to MODEL_FILE for use by downstream nodes.
 */
export const generateLoadModelCode = (modelFilePath: string): string => {
  const safePath = sanitizePath(modelFilePath);

  return `import sys
import os
import shutil
import joblib

try:
    os.makedirs("${WORK_DIR}", exist_ok=True)

    model_path = "${safePath}"

    if not os.path.exists(model_path):
        print(f"ERROR: Model file not found: {model_path}")
        sys.exit(1)

    # Load model to verify it's valid
    print(f"Loading model from: {model_path}")
    model = joblib.load(model_path)

    # Get model type info
    model_type = type(model).__name__
    print(f"Model type: {model_type}")

    # Check if it's a sklearn model
    if hasattr(model, "predict"):
        print("Model has predict method")
    else:
        print("WARNING: Model does not have predict method")

    if hasattr(model, "fit"):
        print("Model has fit method (sklearn-compatible)")

    # Copy to standard location for downstream nodes
    shutil.copy(model_path, "${MODEL_FILE}")
    print(f"Model copied to ${MODEL_FILE}")

except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
`;
};
