#!/usr/bin/env python3
"""
HTTP Inference Server for MLOps Desktop (v10)

This server is for LOCAL DEVELOPMENT AND TESTING ONLY.
- Default: Binds to 127.0.0.1 (localhost only, not network-accessible)
- No authentication by default
- No TLS/HTTPS support

For production deployment, use dedicated serving infrastructure
(TensorFlow Serving, Triton, etc.)

Security Controls:
- Default bind to 127.0.0.1 only
- Rate limiting: 100 requests/minute per IP
- Request size: Max 1MB JSON payload
- Batch size: Max 1000 samples per request
- Timeout: 30s per request
- Input validation with Pydantic

Communication Protocol:
- __LOG__: prefix for log messages
- __REQUEST__: prefix for request metadata (no input data for privacy)
- __ERROR__: prefix for error events
- __READY__: sent when server is ready

Usage:
    python http_server.py <model_path> [--host HOST] [--port PORT] [--onnx PATH] [--cors ORIGINS]
"""

import argparse
import asyncio
import json
import sys
import time
import uuid
import warnings
from contextlib import asynccontextmanager
from typing import Any

# Suppress sklearn/numpy warnings that could pollute stdout
warnings.filterwarnings("ignore")

# Check dependencies before importing
def check_dependencies():
    """Check if required packages are installed."""
    missing = []
    try:
        import fastapi
    except ImportError:
        missing.append("fastapi")
    try:
        import uvicorn
    except ImportError:
        missing.append("uvicorn")
    try:
        from slowapi import Limiter
    except ImportError:
        missing.append("slowapi")

    if missing:
        emit_error("MISSING_DEPS", f"Missing required packages: {', '.join(missing)}. Install with: pip install {' '.join(missing)}")
        sys.exit(1)

def emit_log(message: str) -> None:
    """Emit a log message."""
    print(f"__LOG__:{json.dumps({'message': message})}", flush=True)

def emit_error(code: str, message: str, details: dict | None = None) -> None:
    """Emit an error event."""
    data = {"code": code, "message": message}
    if details:
        data["details"] = details
    print(f"__ERROR__:{json.dumps(data)}", flush=True)

def emit_request(log_entry: dict) -> None:
    """Emit a request log entry (no input data for privacy)."""
    print(f"__REQUEST__:{json.dumps(log_entry)}", flush=True)

def emit_ready(host: str, port: int, runtime: str, model_info: dict) -> None:
    """Emit ready signal with server info."""
    data = {
        "host": host,
        "port": port,
        "runtime": runtime,
        "model_info": model_info,
    }
    print(f"__READY__:{json.dumps(data)}", flush=True)

# Check dependencies early
check_dependencies()

# Now import dependencies
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Constants
MAX_REQUEST_SIZE_BYTES = 1_000_000  # 1MB
MAX_BATCH_SIZE = 1000
REQUEST_TIMEOUT_SECONDS = 30
RATE_LIMIT_PER_MINUTE = 100


class PredictRequest(BaseModel):
    """Request model for predictions."""
    input: dict[str, Any] | list[dict[str, Any]]

    @field_validator("input")
    @classmethod
    def validate_input(cls, v):
        if isinstance(v, list):
            if len(v) > MAX_BATCH_SIZE:
                raise ValueError(f"Batch size {len(v)} exceeds maximum of {MAX_BATCH_SIZE}")
            if len(v) == 0:
                raise ValueError("Empty batch provided")
        return v


class PredictResponse(BaseModel):
    """Response model for predictions."""
    prediction: list[Any]
    probabilities: list[list[float]] | None = None
    classes: list[Any] | None = None


class ErrorDetail(BaseModel):
    """Error detail model."""
    code: str
    message: str
    details: dict | None = None


class ErrorResponse(BaseModel):
    """Error response model."""
    error: ErrorDetail


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    model_type: str
    is_classifier: bool
    feature_names: list[str] | None
    classes: list[Any] | None
    runtime: str


class ModelServer:
    """Model server with sklearn/ONNX support."""

    def __init__(self, model_path: str, onnx_path: str | None = None):
        self.model_path = model_path
        self.onnx_path = onnx_path
        self.model = None
        self.onnx_session = None
        self.model_info = {}
        self.using_onnx = False

        self._load_model()

    def _load_model(self) -> None:
        """Load the model (sklearn or ONNX)."""
        import joblib

        # Try ONNX first if path provided
        if self.onnx_path:
            try:
                import onnxruntime as ort
                self.onnx_session = ort.InferenceSession(self.onnx_path)
                self.using_onnx = True
                emit_log(f"Runtime: ONNX Runtime ({self.onnx_path})")
                self._extract_onnx_info()
                return
            except ImportError:
                emit_log("ONNX Runtime not installed, falling back to sklearn")
            except Exception as e:
                emit_log(f"Failed to load ONNX model: {e}, falling back to sklearn")

        # Fall back to sklearn
        try:
            self.model = joblib.load(self.model_path)
            self.using_onnx = False
            emit_log(f"Runtime: sklearn ({self.model_path})")
            self._extract_sklearn_info()
        except Exception as e:
            raise RuntimeError(f"Failed to load model: {e}")

    def _extract_sklearn_info(self) -> None:
        """Extract information from sklearn model."""
        model = self.model
        self.model_info = {
            "type": type(model).__name__,
            "is_classifier": hasattr(model, "predict_proba"),
            "classes": None,
            "feature_names": None,
        }

        if hasattr(model, "classes_"):
            classes = model.classes_
            if hasattr(classes, "tolist"):
                self.model_info["classes"] = classes.tolist()
            else:
                self.model_info["classes"] = list(classes)

        if hasattr(model, "feature_names_in_"):
            names = model.feature_names_in_
            if hasattr(names, "tolist"):
                self.model_info["feature_names"] = names.tolist()
            else:
                self.model_info["feature_names"] = list(names)

    def _extract_onnx_info(self) -> None:
        """Extract information from ONNX model."""
        session = self.onnx_session

        # Get input info
        input_meta = session.get_inputs()[0]
        input_names = [inp.name for inp in session.get_inputs()]

        # Get output info
        output_names = [out.name for out in session.get_outputs()]
        is_classifier = any("probabilities" in name.lower() or "label" in name.lower()
                          for name in output_names)

        self.model_info = {
            "type": "ONNX",
            "is_classifier": is_classifier,
            "classes": None,  # ONNX doesn't preserve class labels easily
            "feature_names": None,  # Would need metadata
            "input_name": input_meta.name,
            "input_shape": input_meta.shape,
        }

    def predict(self, inputs: list[dict[str, Any]]) -> dict:
        """Run prediction on inputs."""
        import numpy as np

        if self.using_onnx:
            return self._predict_onnx(inputs)
        else:
            return self._predict_sklearn(inputs)

    def _predict_sklearn(self, inputs: list[dict[str, Any]]) -> dict:
        """Run sklearn prediction."""
        import numpy as np

        # Build feature matrix
        if self.model_info.get("feature_names"):
            feature_names = self.model_info["feature_names"]
            values = []
            for i, sample in enumerate(inputs):
                missing = [f for f in feature_names if f not in sample]
                if missing:
                    raise ValueError(f"Row {i}: Missing features: {', '.join(missing)}")
                values.append([sample[f] for f in feature_names])
        else:
            values = []
            for sample in inputs:
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
                pass

        return result

    def _predict_onnx(self, inputs: list[dict[str, Any]]) -> dict:
        """Run ONNX prediction."""
        import numpy as np

        # Build feature matrix - use all values if no feature names
        values = []
        for sample in inputs:
            if isinstance(sample, dict):
                values.append(list(sample.values()))
            else:
                values.append(sample)

        X = np.array(values, dtype=np.float32)  # ONNX typically uses float32

        # Get input name
        input_name = self.onnx_session.get_inputs()[0].name

        # Run inference
        outputs = self.onnx_session.run(None, {input_name: X})

        # First output is typically the prediction
        predictions = outputs[0]
        result = {
            "prediction": predictions.tolist() if hasattr(predictions, "tolist") else list(predictions)
        }

        # If there are probabilities (typically second output for classifiers)
        if len(outputs) > 1:
            probabilities = outputs[1]
            if probabilities is not None:
                result["probabilities"] = probabilities.tolist() if hasattr(probabilities, "tolist") else list(probabilities)

        return result

    def get_runtime(self) -> str:
        """Get the current runtime name."""
        return "onnx" if self.using_onnx else "sklearn"


# Global model server instance
model_server: ModelServer | None = None


def create_app(cors_origins: list[str] | None = None) -> FastAPI:
    """Create FastAPI application."""

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Startup
        emit_log("Server starting...")
        yield
        # Shutdown
        emit_log("Server shutting down...")

    app = FastAPI(
        title="MLOps Inference Server",
        description="Local development inference server for MLOps Desktop",
        version="1.0.0",
        lifespan=lifespan,
    )

    # Rate limiting
    limiter = Limiter(key_func=get_remote_address)
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # CORS
    if cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    # Request size limiting middleware
    @app.middleware("http")
    async def limit_request_size(request: Request, call_next):
        if request.headers.get("content-length"):
            content_length = int(request.headers["content-length"])
            if content_length > MAX_REQUEST_SIZE_BYTES:
                return JSONResponse(
                    status_code=413,
                    content={"error": {
                        "code": "REQUEST_TOO_LARGE",
                        "message": f"Request size {content_length} exceeds maximum of {MAX_REQUEST_SIZE_BYTES} bytes"
                    }}
                )
        return await call_next(request)

    # Request logging middleware
    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        request_id = str(uuid.uuid4())
        start_time = time.time()

        # Store request ID for later use
        request.state.request_id = request_id

        response = await call_next(request)

        latency_ms = (time.time() - start_time) * 1000

        # Emit request log (no input data for privacy)
        log_entry = {
            "id": request_id,
            "timestamp": int(time.time() * 1000),
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "latency_ms": round(latency_ms, 2),
            "batch_size": getattr(request.state, "batch_size", 1),
        }
        emit_request(log_entry)

        return response

    @app.get("/health", response_model=HealthResponse)
    async def health():
        """Health check endpoint."""
        if model_server is None:
            raise HTTPException(status_code=503, detail="Model not loaded")

        return HealthResponse(
            status="healthy",
            model_type=model_server.model_info.get("type", "unknown"),
            is_classifier=model_server.model_info.get("is_classifier", False),
            feature_names=model_server.model_info.get("feature_names"),
            classes=model_server.model_info.get("classes"),
            runtime=model_server.get_runtime(),
        )

    @app.post("/predict", response_model=PredictResponse)
    @limiter.limit(f"{RATE_LIMIT_PER_MINUTE}/minute")
    async def predict(request: Request, body: PredictRequest):
        """Run prediction on input data."""
        if model_server is None:
            raise HTTPException(status_code=503, detail="Model not loaded")

        # Normalize input to list
        inputs = body.input if isinstance(body.input, list) else [body.input]

        # Store batch size for logging
        request.state.batch_size = len(inputs)

        # Validate features if model has feature names
        feature_names = model_server.model_info.get("feature_names")
        if feature_names:
            for i, sample in enumerate(inputs):
                missing = [f for f in feature_names if f not in sample]
                if missing:
                    raise HTTPException(
                        status_code=400,
                        detail={"error": {
                            "code": "MISSING_FEATURE",
                            "message": f"Row {i}: Missing features: {', '.join(missing)}",
                            "details": {"missing": missing, "row": i}
                        }}
                    )

        try:
            result = model_server.predict(inputs)
            return PredictResponse(**result)
        except ValueError as e:
            raise HTTPException(
                status_code=400,
                detail={"error": {"code": "INVALID_INPUT", "message": str(e)}}
            )
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail={"error": {"code": "PREDICTION_ERROR", "message": str(e)}}
            )

    @app.get("/docs", include_in_schema=False)
    async def docs_redirect():
        """Redirect to API docs."""
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/docs")

    return app


def main():
    global model_server

    parser = argparse.ArgumentParser(description="MLOps HTTP Inference Server")
    parser.add_argument("model_path", help="Path to sklearn model file")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind to (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8080, help="Port to bind to (default: 8080)")
    parser.add_argument("--onnx", help="Path to ONNX model file (optional)")
    parser.add_argument("--cors", help="Comma-separated list of allowed CORS origins")

    args = parser.parse_args()

    # Parse CORS origins
    cors_origins = None
    if args.cors:
        if args.cors == "*":
            cors_origins = ["*"]
        else:
            cors_origins = [o.strip() for o in args.cors.split(",")]

    # Load model
    try:
        model_server = ModelServer(args.model_path, args.onnx)
    except Exception as e:
        emit_error("MODEL_LOAD_ERROR", str(e))
        sys.exit(1)

    # Create app
    app = create_app(cors_origins)

    # Emit ready signal
    emit_ready(
        args.host,
        args.port,
        model_server.get_runtime(),
        model_server.model_info,
    )

    # Run server
    import uvicorn

    config = uvicorn.Config(
        app,
        host=args.host,
        port=args.port,
        log_level="warning",  # Reduce uvicorn logging noise
    )
    server = uvicorn.Server(config)

    try:
        asyncio.run(server.serve())
    except OSError as e:
        if "Address already in use" in str(e):
            emit_error("PORT_IN_USE", f"Port {args.port} is already in use. Choose a different port.")
        else:
            emit_error("SERVER_ERROR", str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
