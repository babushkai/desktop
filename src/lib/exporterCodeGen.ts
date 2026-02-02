import { NodeData } from "../stores/pipelineStore";
import { EXPORTS_DIR } from "./constants";

const sanitizePath = (p: string): string =>
  p.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const formatExtensions: Record<string, string> = {
  joblib: ".joblib",
  pickle: ".pkl",
  onnx: ".onnx",
};

// Strip existing extension if it matches the target format
const getOutputPath = (name: string, format: string): string => {
  const ext = formatExtensions[format] || ".joblib";
  // Remove extension if user already added it (case-insensitive)
  const baseName = name.replace(new RegExp(`\\${ext}$`, "i"), "");
  return `${EXPORTS_DIR}/${baseName}${ext}`;
};

export const generateExporterCode = (
  exporterData: NodeData,
  modelInputPath: string
): string => {
  const format = exporterData.exportFormat || "joblib";
  const rawName = (exporterData.outputFileName || "model_export").replace(/"/g, '\\"');
  const safeInputPath = sanitizePath(modelInputPath);
  const outputPath = getOutputPath(rawName, format);

  if (format === "onnx") {
    return `import sys
import os
import joblib
import numpy as np

os.makedirs("${EXPORTS_DIR}", exist_ok=True)

try:
    model = joblib.load("${safeInputPath}")

    # Try to import onnx conversion
    try:
        from skl2onnx import convert_sklearn
        from skl2onnx.common.data_types import FloatTensorType
    except ImportError:
        print("ERROR: skl2onnx not installed. Run: pip install skl2onnx")
        sys.exit(1)

    # Infer input shape from model
    if hasattr(model, 'n_features_in_'):
        n_features = model.n_features_in_
    else:
        print("ERROR: Cannot determine input features. Model may not support ONNX export.")
        sys.exit(1)

    initial_type = [('float_input', FloatTensorType([None, n_features]))]

    print(f"Converting model to ONNX format...")
    print(f"Input features: {n_features}")

    onnx_model = convert_sklearn(model, initial_types=initial_type)

    with open("${outputPath}", "wb") as f:
        f.write(onnx_model.SerializeToString())

    print("=" * 40)
    print("EXPORT COMPLETE")
    print("=" * 40)
    print(f"Format: ONNX")
    print(f"Output: ${outputPath}")
    print("=" * 40)

except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
`;
  }

  if (format === "pickle") {
    return `import sys
import os
import joblib
import pickle

os.makedirs("${EXPORTS_DIR}", exist_ok=True)

try:
    model = joblib.load("${safeInputPath}")

    with open("${outputPath}", "wb") as f:
        pickle.dump(model, f)

    print("=" * 40)
    print("EXPORT COMPLETE")
    print("=" * 40)
    print(f"Format: pickle")
    print(f"Output: ${outputPath}")
    print("=" * 40)

except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
`;
  }

  // Default: joblib (copy/rename)
  return `import sys
import os
import shutil

os.makedirs("${EXPORTS_DIR}", exist_ok=True)

try:
    shutil.copy("${safeInputPath}", "${outputPath}")

    print("=" * 40)
    print("EXPORT COMPLETE")
    print("=" * 40)
    print(f"Format: joblib")
    print(f"Output: ${outputPath}")
    print("=" * 40)

except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
`;
};
