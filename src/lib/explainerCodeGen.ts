// Model Explainability Code Generator (v7)

import { SPLIT_INDICES_FILE, MODEL_FILE } from "./constants";
import { ExplainConfig, DEFAULT_EXPLAIN_CONFIG } from "./explainTypes";

// Sanitize file path for embedding in Python string
const sanitizePath = (p: string): string =>
  p.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

export function generateExplainerCode(
  config: ExplainConfig = DEFAULT_EXPLAIN_CONFIG
): string {
  const nTopFeatures = config.nTopFeatures;
  const nShapSamples = config.nShapSamples;
  const nPermutationRepeats = config.nPermutationRepeats;

  return `import sys
import os
import json
import time
import numpy as np
import pandas as pd
import joblib
from sklearn.inspection import permutation_importance, partial_dependence
from sklearn.model_selection import train_test_split

SPLIT_INDICES_FILE = "${sanitizePath(SPLIT_INDICES_FILE)}"
MODEL_FILE = "${sanitizePath(MODEL_FILE)}"
N_TOP_FEATURES = ${nTopFeatures}
N_SHAP_SAMPLES = ${nShapSamples}
N_PERMUTATION_REPEATS = ${nPermutationRepeats}

def emit(event_type, **kwargs):
    print(json.dumps({"type": event_type, **kwargs}), flush=True)

start_time = time.time()

try:
    # Load model and infer type
    if not os.path.exists(MODEL_FILE):
        emit("error", message=f"Model file not found: {MODEL_FILE}")
        sys.exit(1)

    model = joblib.load(MODEL_FILE)
    model_class = type(model).__name__
    is_classifier = hasattr(model, "predict_proba")

    emit("log", message=f"Loaded model: {model_class}")
    emit("log", message=f"Type: {'classifier' if is_classifier else 'regressor'}")

    # Load split indices
    if not os.path.exists(SPLIT_INDICES_FILE):
        emit("error", message=f"Split indices not found: {SPLIT_INDICES_FILE}")
        emit("log", message="Run a training pipeline first to create split indices.")
        sys.exit(1)

    with open(SPLIT_INDICES_FILE, "r") as f:
        split_info = json.load(f)

    source_file = split_info.get("source_file")
    if not source_file or not os.path.exists(source_file):
        emit("error", message=f"Source data file not found: {source_file}")
        sys.exit(1)

    target_col = split_info.get("target_column")
    if not target_col:
        emit("error", message="target_column not found in split_indices.json")
        sys.exit(1)

    df = pd.read_csv(source_file)
    X = df.drop(target_col, axis=1)
    y = df[target_col]

    test_indices = split_info.get("test_indices", [])
    if not test_indices:
        emit("error", message="test_indices not found in split_indices.json")
        sys.exit(1)

    X_test = X.iloc[test_indices]
    y_test = y.iloc[test_indices]

    feature_names = X_test.columns.tolist()
    n_features = len(feature_names)
    n_samples = len(X_test)

    emit("log", message=f"Test samples: {n_samples}, Features: {n_features}")

    # Collect class names for classification
    class_names = []
    if is_classifier and hasattr(model, "classes_"):
        class_names = [str(c) for c in model.classes_]
        emit("log", message=f"Classes: {class_names}")

    # 1. Permutation Importance
    emit("log", message="")
    emit("log", message="--- Computing Permutation Importance ---")
    emit("explainProgress", data={"stage": "permutation_importance", "percentComplete": 0})

    perm_result = permutation_importance(
        model, X_test, y_test,
        n_repeats=N_PERMUTATION_REPEATS,
        random_state=42,
        n_jobs=-1
    )

    emit("featureImportance", data={
        "features": feature_names,
        "importances": perm_result.importances_mean.tolist(),
        "stdDevs": perm_result.importances_std.tolist()
    })

    emit("explainProgress", data={"stage": "permutation_importance", "percentComplete": 100})
    emit("log", message="Permutation importance complete")

    # Determine top features
    top_indices = np.argsort(np.abs(perm_result.importances_mean))[::-1][:N_TOP_FEATURES]
    top_features = [feature_names[i] for i in top_indices]
    emit("log", message=f"Top features: {top_features}")

    # 2. SHAP Analysis
    emit("log", message="")
    emit("log", message="--- Computing SHAP Values ---")

    try:
        import shap

        # Map sklearn class names to explainer types
        TREE_MODELS = {
            "RandomForestRegressor", "RandomForestClassifier",
            "GradientBoostingRegressor", "GradientBoostingClassifier",
            "ExtraTreesRegressor", "ExtraTreesClassifier"
        }
        LINEAR_MODELS = {"LinearRegression", "LogisticRegression", "Ridge", "Lasso"}

        shap_explainer_type = "kernel"
        if model_class in TREE_MODELS:
            emit("log", message="Using TreeExplainer (fast)")
            explainer = shap.TreeExplainer(model)
            shap_explainer_type = "tree"
            n_shap_samples = min(N_SHAP_SAMPLES, n_samples)
        elif model_class in LINEAR_MODELS:
            emit("log", message="Using LinearExplainer (fast)")
            explainer = shap.LinearExplainer(model, X_test)
            shap_explainer_type = "linear"
            n_shap_samples = min(N_SHAP_SAMPLES, n_samples)
        else:
            emit("log", message=f"Using KernelExplainer for {model_class} (slow, limited to 50 samples)")
            n_shap_samples = min(50, n_samples)
            background = shap.sample(X_test, min(100, n_samples))
            if is_classifier:
                explainer = shap.KernelExplainer(model.predict_proba, background)
            else:
                explainer = shap.KernelExplainer(model.predict, background)

        # Sample data for SHAP
        if n_shap_samples < n_samples:
            if is_classifier:
                # Stratified sample for classification
                try:
                    _, X_shap, _, y_shap = train_test_split(
                        X_test, y_test,
                        train_size=max(0, n_samples - n_shap_samples),
                        stratify=y_test,
                        random_state=42
                    )
                except ValueError:
                    # Fallback if stratification fails
                    sample_idx = np.random.RandomState(42).choice(
                        n_samples, size=n_shap_samples, replace=False
                    )
                    X_shap = X_test.iloc[sample_idx]
            else:
                # Simple random sample for regression
                sample_idx = np.random.RandomState(42).choice(
                    n_samples, size=n_shap_samples, replace=False
                )
                X_shap = X_test.iloc[sample_idx]
        else:
            X_shap = X_test

        emit("log", message=f"Computing SHAP for {len(X_shap)} samples...")
        emit("explainProgress", data={"stage": "shap", "percentComplete": 0})

        shap_values = explainer(X_shap)

        emit("explainProgress", data={"stage": "shap", "percentComplete": 100})
        emit("log", message="SHAP computation complete")

        # Normalize SHAP dimension ordering
        if is_classifier:
            values = shap_values.values

            if values.ndim == 2:
                # Binary classification: (samples, features) -> (1, samples, features)
                normalized = values[np.newaxis, :, :]
                shap_class_names = [str(model.classes_[1])] if hasattr(model, "classes_") else ["1"]
                base_values = [float(explainer.expected_value)] if np.isscalar(explainer.expected_value) else [float(explainer.expected_value[1])]
            elif values.ndim == 3:
                # Multiclass: (samples, features, classes) -> (classes, samples, features)
                normalized = np.transpose(values, (2, 0, 1))
                shap_class_names = [str(c) for c in model.classes_] if hasattr(model, "classes_") else [str(i) for i in range(values.shape[2])]
                base_values = explainer.expected_value.tolist() if hasattr(explainer.expected_value, 'tolist') else list(explainer.expected_value)
            else:
                raise ValueError(f"Unexpected SHAP values shape: {values.shape}")

            emit("shapData", data={
                "featureNames": feature_names,
                "shapValues": normalized.tolist(),
                "baseValues": base_values,
                "featureValues": X_shap.values.tolist(),
                "classNames": shap_class_names
            })
        else:
            # Regression: (samples, features) - no transpose needed
            base_value = float(explainer.expected_value) if np.isscalar(explainer.expected_value) else float(explainer.expected_value[0])
            emit("shapData", data={
                "featureNames": feature_names,
                "shapValues": shap_values.values.tolist(),
                "baseValue": base_value,
                "featureValues": X_shap.values.tolist()
            })

    except ImportError:
        emit("log", message="SHAP not installed. Skipping SHAP analysis.")
        emit("log", message="Install with: pip install shap")
    except Exception as e:
        emit("log", message=f"SHAP analysis failed: {e}")
        import traceback
        emit("log", message=traceback.format_exc())

    # 3. Partial Dependence Plots
    emit("log", message="")
    emit("log", message="--- Computing Partial Dependence Plots ---")
    emit("explainProgress", data={"stage": "pdp", "percentComplete": 0})

    for i, feature in enumerate(top_features):
        try:
            feature_idx = feature_names.index(feature)

            if is_classifier:
                # For classification, compute PDP for each class
                pd_result = partial_dependence(
                    model, X_test, [feature_idx],
                    kind="average",
                    grid_resolution=50
                )
                grid_values = pd_result["grid_values"][0].tolist()

                # pd_result["average"] shape: (n_classes, n_grid_points) for multiclass
                # or (1, n_grid_points) for binary
                averages = pd_result["average"]
                if averages.ndim == 1:
                    averages = averages.reshape(1, -1)

                pdp_by_class = {}
                if len(class_names) > 0:
                    for c_idx, c_name in enumerate(class_names):
                        if c_idx < len(averages):
                            pdp_by_class[c_name] = averages[c_idx].tolist()
                else:
                    pdp_by_class["0"] = averages[0].tolist()

                emit("partialDependence", data={
                    "feature": feature,
                    "gridValues": grid_values,
                    "pdpByClass": pdp_by_class
                })
            else:
                # For regression, compute PDP with ICE lines
                pd_result = partial_dependence(
                    model, X_test, [feature_idx],
                    kind="both",
                    grid_resolution=50
                )

                grid_values = pd_result["grid_values"][0].tolist()
                pdp_values = pd_result["average"][0].tolist()

                # ICE lines: individual conditional expectations
                ice_lines = None
                if "individual" in pd_result:
                    # Limit ICE lines to avoid huge data
                    ice_raw = pd_result["individual"][0]
                    max_ice_lines = min(50, len(ice_raw))
                    ice_sample_idx = np.random.RandomState(42).choice(
                        len(ice_raw), size=max_ice_lines, replace=False
                    )
                    ice_lines = ice_raw[ice_sample_idx].tolist()

                emit("partialDependence", data={
                    "feature": feature,
                    "gridValues": grid_values,
                    "pdpValues": pdp_values,
                    "iceLines": ice_lines
                })

            emit("log", message=f"PDP computed for: {feature}")

        except Exception as e:
            emit("log", message=f"PDP failed for {feature}: {e}")

        progress = ((i + 1) / len(top_features)) * 100
        emit("explainProgress", data={"stage": "pdp", "percentComplete": progress})

    # Complete
    duration_ms = int((time.time() - start_time) * 1000)
    emit("log", message="")
    emit("log", message=f"Explainability analysis complete in {duration_ms / 1000:.1f}s")

    # Emit metadata
    emit("explainMetadata", data={
        "modelType": model_class,
        "isClassifier": is_classifier,
        "nSamples": n_samples,
        "nFeatures": n_features,
        "classNames": class_names,
        "shapExplainer": shap_explainer_type if 'shap_explainer_type' in dir() else None
    })

    emit("explainComplete", durationMs=duration_ms)

except Exception as e:
    import traceback
    emit("error", message=str(e))
    emit("log", message=traceback.format_exc())
    sys.exit(1)
`;
}
