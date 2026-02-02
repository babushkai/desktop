#!/usr/bin/env python3
"""
Inference Server for MLOps Desktop

This script runs as a long-lived subprocess, communicating via stdin/stdout.
All responses are prefixed with __RESPONSE__: sentinel for reliable parsing.

Protocol:
- Input: JSON objects on stdin, one per line
- Output: JSON objects with __RESPONSE__: prefix on stdout

Commands:
- {"cmd": "health", "request_id": "..."}
- {"cmd": "info", "request_id": "..."}
- {"cmd": "predict", "request_id": "...", "input": {...}}

Responses:
- __RESPONSE__:{"request_id": "...", "status": "ok", ...}
- __RESPONSE__:{"request_id": "...", "status": "error", "message": "..."}
"""

import json
import sys
import warnings

# Suppress sklearn/numpy warnings that could pollute stdout
warnings.filterwarnings("ignore")


def respond(obj: dict) -> None:
    """Send a response with sentinel prefix for reliable parsing."""
    print("__RESPONSE__:" + json.dumps(obj), flush=True)


def respond_error(request_id: str, message: str) -> None:
    """Send an error response."""
    respond({"request_id": request_id, "status": "error", "message": message})


def respond_ok(request_id: str, **kwargs) -> None:
    """Send a success response."""
    respond({"request_id": request_id, "status": "ok", **kwargs})


class InferenceServer:
    def __init__(self, model_path: str):
        self.model_path = model_path
        self.model = None
        self.model_info = {}
        self._load_model()

    def _load_model(self) -> None:
        """Load the model from disk."""
        import joblib

        try:
            self.model = joblib.load(self.model_path)
            self._extract_model_info()
        except Exception as e:
            raise RuntimeError(f"Failed to load model: {e}")

    def _extract_model_info(self) -> None:
        """Extract information about the loaded model."""
        model = self.model
        self.model_info = {
            "type": type(model).__name__,
            "is_classifier": hasattr(model, "predict_proba"),
            "classes": None,
            "feature_names": None,
        }

        # Extract classes for classifiers
        if hasattr(model, "classes_"):
            classes = model.classes_
            if hasattr(classes, "tolist"):
                self.model_info["classes"] = classes.tolist()
            else:
                self.model_info["classes"] = list(classes)

        # Extract feature names if available (sklearn >= 1.0)
        if hasattr(model, "feature_names_in_"):
            names = model.feature_names_in_
            if hasattr(names, "tolist"):
                self.model_info["feature_names"] = names.tolist()
            else:
                self.model_info["feature_names"] = list(names)

    def handle_health(self, request_id: str) -> None:
        """Handle health check command."""
        respond_ok(request_id, type="ready", model_info=self.model_info)

    def handle_info(self, request_id: str) -> None:
        """Handle model info command."""
        respond_ok(request_id, model_info=self.model_info)

    def handle_predict(self, request_id: str, input_data) -> None:
        """Handle prediction command.

        Supports both single prediction (dict) and batch prediction (list of dicts).
        """
        import numpy as np

        try:
            # Detect single vs batch input
            if isinstance(input_data, list):
                # Batch: list of dicts
                samples = input_data
            else:
                # Single: dict
                samples = [input_data]

            if not samples:
                respond_error(request_id, "No input data provided")
                return

            # Build feature matrix
            if self.model_info.get("feature_names"):
                # Model has feature names, use them to order input
                feature_names = self.model_info["feature_names"]
                values = []
                for i, sample in enumerate(samples):
                    missing = [f for f in feature_names if f not in sample]
                    if missing:
                        respond_error(request_id, f"Row {i}: Missing features: {', '.join(missing)}")
                        return
                    values.append([sample[f] for f in feature_names])
            else:
                # No feature names, expect numeric keys or array-like input
                values = []
                for sample in samples:
                    if isinstance(sample, dict):
                        values.append(list(sample.values()))
                    else:
                        values.append(sample)

            X = np.array(values, dtype=np.float64)
            predictions = self.model.predict(X)

            result = {
                "prediction": predictions.tolist() if hasattr(predictions, "tolist") else list(predictions)
            }

            # Get probabilities for classifiers
            if self.model_info["is_classifier"] and hasattr(self.model, "predict_proba"):
                try:
                    probabilities = self.model.predict_proba(X)
                    result["probabilities"] = probabilities.tolist()
                    result["classes"] = self.model_info.get("classes")
                except Exception:
                    pass  # Some classifiers don't support predict_proba

            respond_ok(request_id, **result)

        except Exception as e:
            respond_error(request_id, str(e))

    def process_command(self, cmd_str: str) -> bool:
        """Process a command and return True to continue, False to exit."""
        try:
            cmd = json.loads(cmd_str)
        except json.JSONDecodeError as e:
            respond_error("unknown", f"Invalid JSON: {e}")
            return True

        request_id = cmd.get("request_id", "unknown")
        cmd_type = cmd.get("cmd", "")

        if cmd_type == "health":
            self.handle_health(request_id)
        elif cmd_type == "info":
            self.handle_info(request_id)
        elif cmd_type == "predict":
            input_data = cmd.get("input", {})
            self.handle_predict(request_id, input_data)
        elif cmd_type == "shutdown":
            respond_ok(request_id, message="Shutting down")
            return False
        else:
            respond_error(request_id, f"Unknown command: {cmd_type}")

        return True


def main():
    if len(sys.argv) < 2:
        print("Usage: inference_server.py <model_path>", file=sys.stderr)
        sys.exit(1)

    model_path = sys.argv[1]

    try:
        server = InferenceServer(model_path)
    except Exception as e:
        # Send startup error with sentinel
        respond({"request_id": "startup", "status": "error", "message": str(e)})
        sys.exit(1)

    # Send ready signal
    respond({
        "request_id": "startup",
        "status": "ok",
        "type": "ready",
        "model_info": server.model_info
    })

    # Main loop - read commands from stdin until EOF
    while True:
        try:
            line = sys.stdin.readline()
            if not line:  # EOF - parent closed stdin
                break
            line = line.strip()
            if not line:
                continue
            if not server.process_command(line):
                break
        except KeyboardInterrupt:
            break
        except Exception as e:
            respond_error("unknown", f"Internal error: {e}")


if __name__ == "__main__":
    main()
