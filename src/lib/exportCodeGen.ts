// Sanitize file path for embedding in Python string
const sanitizePath = (p: string): string =>
  p.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

export interface ExportScriptConfig {
  modelPath: string;
  outputPath: string;
  nFeatures?: number;
  featureNames?: string[];
}

/**
 * Generate Python code for ONNX export
 */
export const generateOnnxExportCode = (config: ExportScriptConfig): string => {
  const safeModelPath = sanitizePath(config.modelPath);
  const safeOutputPath = sanitizePath(config.outputPath);

  return `import sys
import os
import json
import pickle
import joblib

# Output progress via structured messages
def emit(event_type, **kwargs):
    msg = {"type": event_type}
    msg.update(kwargs)
    print(f"__EMIT__{json.dumps(msg)}__EMIT__", flush=True)

try:
    emit("status", message="Loading model...")

    # Try loading with joblib first, fall back to pickle
    model_path = "${safeModelPath}"
    try:
        model = joblib.load(model_path)
    except:
        with open(model_path, "rb") as f:
            model = pickle.load(f)

    emit("status", message="Determining input shape...")

    # Try to determine n_features
    n_features = ${config.nFeatures ?? "None"}

    # Try to load from model_info.json (v9+)
    model_info_path = os.path.join(os.path.dirname(model_path), "model_info.json")
    if n_features is None:
        try:
            with open(model_info_path, "r") as f:
                info = json.load(f)
                n_features = info.get("n_features")
        except FileNotFoundError:
            pass
        except Exception as e:
            emit("warning", message=f"Could not read model_info.json: {e}")

    # Fallback: infer from model
    if n_features is None:
        if hasattr(model, "n_features_in_"):
            n_features = model.n_features_in_
        elif hasattr(model, "coef_"):
            # Linear models have coef_ attribute
            coef = model.coef_
            if hasattr(coef, "shape"):
                n_features = coef.shape[-1] if len(coef.shape) > 0 else 1

    if n_features is None:
        emit("error", message="Cannot determine input shape. Model needs 'n_features_in_' attribute or model_info.json. Re-train with v9+.")
        sys.exit(1)

    emit("status", message=f"Input shape: {n_features} features")

    # Import skl2onnx
    try:
        from skl2onnx import convert_sklearn
        from skl2onnx.common.data_types import FloatTensorType
    except ImportError:
        emit("error", message="skl2onnx not installed. Run: pip install skl2onnx")
        sys.exit(1)

    emit("status", message="Converting to ONNX...")

    # Define input type
    initial_type = [("input", FloatTensorType([None, n_features]))]

    # Attempt conversion
    try:
        onnx_model = convert_sklearn(model, initial_types=initial_type)
    except Exception as e:
        emit("error", message=f"ONNX conversion failed: {e}")
        sys.exit(1)

    # Save ONNX model
    output_path = "${safeOutputPath}"
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    with open(output_path, "wb") as f:
        f.write(onnx_model.SerializeToString())

    # Get file size
    file_size = os.path.getsize(output_path)

    emit("status", message=f"ONNX model saved to {output_path}")
    emit("export_complete", format="onnx", path=output_path, size=file_size)
    print(f"SUCCESS: ONNX export complete ({file_size} bytes)")

except Exception as e:
    emit("error", message=f"Export failed: {e}")
    sys.exit(1)
`;
};

/**
 * Generate Python code for CoreML export (requires ONNX first)
 */
export const generateCoremlExportCode = (config: ExportScriptConfig & { onnxPath: string }): string => {
  const safeOnnxPath = sanitizePath(config.onnxPath);
  const safeOutputPath = sanitizePath(config.outputPath);

  return `import sys
import os
import json

# Output progress via structured messages
def emit(event_type, **kwargs):
    msg = {"type": event_type}
    msg.update(kwargs)
    print(f"__EMIT__{json.dumps(msg)}__EMIT__", flush=True)

try:
    emit("status", message="Loading ONNX model...")

    onnx_path = "${safeOnnxPath}"
    output_path = "${safeOutputPath}"

    if not os.path.exists(onnx_path):
        emit("error", message=f"ONNX model not found at {onnx_path}. Export to ONNX first.")
        sys.exit(1)

    # Import coremltools
    try:
        import coremltools as ct
    except ImportError:
        emit("error", message="coremltools not installed. Run: pip install coremltools")
        sys.exit(1)

    emit("status", message="Converting to CoreML...")

    # Convert ONNX to CoreML
    try:
        mlmodel = ct.converters.onnx.convert(model=onnx_path)
    except Exception as e:
        emit("error", message=f"CoreML conversion failed: {e}")
        sys.exit(1)

    # Save CoreML model
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    mlmodel.save(output_path)

    # Get file/folder size (CoreML can be a folder)
    if os.path.isdir(output_path):
        total_size = sum(os.path.getsize(os.path.join(dirpath, f))
                        for dirpath, _, files in os.walk(output_path)
                        for f in files)
    else:
        total_size = os.path.getsize(output_path)

    emit("status", message=f"CoreML model saved to {output_path}")
    emit("export_complete", format="coreml", path=output_path, size=total_size)
    print(f"SUCCESS: CoreML export complete ({total_size} bytes)")

except Exception as e:
    emit("error", message=f"Export failed: {e}")
    sys.exit(1)
`;
};
