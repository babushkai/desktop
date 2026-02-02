import { useState, useEffect, useCallback, Fragment, useRef, useLayoutEffect } from "react";
import { Listbox, Transition } from "@headlessui/react";
import {
  RiRocketLine,
  RiLoader4Line,
  RiPlayLine,
  RiStopLine,
  RiDeleteBinLine,
  RiArrowDownSLine,
  RiCheckLine,
  RiHistoryLine,
  RiCloseLine,
  RiUpload2Line,
  RiDownloadLine,
  RiFileTextLine,
} from "@remixicon/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import Papa from "papaparse";
import {
  listModels,
  listModelVersions,
  startInferenceServer,
  stopInferenceServer,
  getInferenceServerStatus,
  runInference,
  runBatchInference,
  ModelMetadata,
  ModelVersion,
  ServerStatus,
} from "@/lib/tauri";
import {
  usePipelineStore,
  InferenceRequest,
  BatchInferenceResult,
} from "@/stores/pipelineStore";
import { cn } from "@/lib/utils";

function getStageBadge(stage: string) {
  switch (stage) {
    case "production":
      return { icon: "prod", className: "text-state-success bg-state-success/20" };
    case "staging":
      return { icon: "staging", className: "text-state-warning bg-state-warning/20" };
    default:
      return { icon: "none", className: "text-text-muted bg-white/10" };
  }
}

interface FeatureInputProps {
  name: string;
  value: string;
  onChange: (value: string) => void;
}

function FeatureInput({ name, value, onChange }: FeatureInputProps) {
  return (
    <div className="flex items-center gap-2">
      <label className="w-32 text-xs text-text-muted truncate" title={name}>
        {name}
      </label>
      <input
        type="number"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 input text-sm py-1 px-2"
        placeholder="0.0"
      />
    </div>
  );
}

interface HistoryItemProps {
  request: InferenceRequest;
  onClick: () => void;
}

function HistoryItem({ request, onClick }: HistoryItemProps) {
  const isError = request.result?.error;
  const prediction = request.result?.prediction;

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2 hover:bg-white/5 border-b border-white/5 last:border-b-0"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted">
          {new Date(request.timestamp).toLocaleTimeString()}
        </span>
        {isError ? (
          <span className="text-xs text-state-error">Error</span>
        ) : (
          <span className="text-xs text-state-success font-mono">
            {prediction?.[0] !== undefined ? String(prediction[0]) : "-"}
          </span>
        )}
      </div>
      <div className="text-xs text-text-secondary truncate mt-0.5">
        {Object.entries(request.input)
          .slice(0, 3)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ")}
        {Object.keys(request.input).length > 3 && "..."}
      </div>
    </button>
  );
}

// Drop zone component for CSV file upload
interface DropZoneProps {
  onFile: (file: File) => void;
  fileName?: string;
  rowCount?: number;
}

function DropZone({ onFile, fileName, rowCount }: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      className={cn(
        "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer",
        "hover:border-accent/50 transition-colors",
        dragOver && "border-accent bg-accent/5"
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file?.name.endsWith(".csv")) onFile(file);
      }}
      onClick={() => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".csv";
        input.onchange = () => input.files?.[0] && onFile(input.files[0]);
        input.click();
      }}
    >
      {fileName ? (
        <div className="flex items-center justify-center gap-2">
          <RiFileTextLine className="w-5 h-5 text-accent" />
          <div>
            <p className="text-sm text-text-primary">{fileName}</p>
            <p className="text-xs text-text-muted">{rowCount?.toLocaleString()} rows</p>
          </div>
        </div>
      ) : (
        <>
          <RiUpload2Line className="w-6 h-6 mx-auto mb-1 text-text-muted" />
          <p className="text-xs text-text-muted">Drop CSV or click to browse</p>
        </>
      )}
    </div>
  );
}

// Virtual scrolling results table for batch predictions
interface BatchResultsTableProps {
  inputs: Record<string, unknown>[];
  predictions: (number | string)[];
  probabilities?: number[][];
  classes?: (string | number)[];
}

function BatchResultsTable({
  inputs,
  predictions,
  probabilities,
  classes,
}: BatchResultsTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(32);

  // Measure header height dynamically
  useLayoutEffect(() => {
    if (headerRef.current) {
      setHeaderHeight(headerRef.current.offsetHeight);
    }
  }, [probabilities, classes]);

  const rowVirtualizer = useVirtualizer({
    count: predictions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 10,
  });

  const featureNames = Object.keys(inputs[0] || {});

  return (
    <div ref={parentRef} className="h-48 overflow-auto border border-white/10 rounded-lg">
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize() + headerHeight}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {/* Header */}
        <div
          ref={headerRef}
          className="sticky top-0 z-10 flex bg-background-surface border-b border-white/10 text-xs font-medium"
        >
          <div className="w-10 px-2 py-1.5 flex-shrink-0">#</div>
          <div className="w-20 px-2 py-1.5 flex-shrink-0">Pred</div>
          {probabilities && <div className="w-14 px-2 py-1.5 flex-shrink-0">Conf</div>}
          {probabilities &&
            classes?.map((cls) => (
              <div
                key={String(cls)}
                className="w-14 px-2 py-1.5 flex-shrink-0 truncate"
                title={`P(${String(cls)})`}
              >
                P({String(cls).slice(0, 4)})
              </div>
            ))}
          {featureNames.slice(0, 2).map((f) => (
            <div key={f} className="w-16 px-2 py-1.5 flex-shrink-0 truncate" title={f}>
              {f}
            </div>
          ))}
        </div>

        {/* Virtual rows */}
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const idx = virtualRow.index;
          const maxProb = probabilities ? Math.max(...probabilities[idx]) : null;

          return (
            <div
              key={idx}
              className="absolute flex text-xs border-b border-white/5 hover:bg-white/5"
              style={{
                top: `${virtualRow.start + headerHeight}px`,
                height: `${virtualRow.size}px`,
                width: "100%",
              }}
            >
              <div className="w-10 px-2 py-1 flex-shrink-0 text-text-muted">{idx + 1}</div>
              <div className="w-20 px-2 py-1 flex-shrink-0 font-mono truncate">
                {String(predictions[idx])}
              </div>
              {probabilities && (
                <div className="w-14 px-2 py-1 flex-shrink-0 text-text-muted">
                  {maxProb !== null ? `${(maxProb * 100).toFixed(0)}%` : "-"}
                </div>
              )}
              {probabilities &&
                probabilities[idx].map((prob, i) => (
                  <div
                    key={i}
                    className="w-14 px-2 py-1 flex-shrink-0 text-text-muted"
                  >
                    {(prob * 100).toFixed(1)}%
                  </div>
                ))}
              {featureNames.slice(0, 2).map((f) => (
                <div
                  key={f}
                  className="w-16 px-2 py-1 flex-shrink-0 truncate text-text-muted"
                >
                  {String(inputs[idx][f])}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type PlaygroundMode = "single" | "batch";
type BatchInputSource = "csv" | "json" | "paste";

export function PlaygroundPanel() {
  const playgroundOpen = usePipelineStore((s) => s.playgroundOpen);
  const closePlayground = usePipelineStore((s) => s.closePlayground);
  const inferenceHistory = usePipelineStore((s) => s.inferenceHistory);
  const addInferenceRequest = usePipelineStore((s) => s.addInferenceRequest);
  const clearInferenceHistory = usePipelineStore((s) => s.clearInferenceHistory);
  const batchResult = usePipelineStore((s) => s.batchResult);
  const setBatchResult = usePipelineStore((s) => s.setBatchResult);

  const [models, setModels] = useState<ModelMetadata[]>([]);
  const [versions, setVersions] = useState<ModelVersion[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelMetadata | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<ModelVersion | null>(null);
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [serverLoading, setServerLoading] = useState(false);
  const [inferenceLoading, setInferenceLoading] = useState(false);

  // Mode toggle
  const [mode, setMode] = useState<PlaygroundMode>("single");

  // Single mode - Feature inputs
  const [featureValues, setFeatureValues] = useState<Record<string, string>>({});
  const [jsonInput, setJsonInput] = useState("");

  // Batch mode
  const [inputSource, setInputSource] = useState<BatchInputSource>("csv");
  const [batchData, setBatchData] = useState<Record<string, unknown>[] | null>(null);
  const [batchFileName, setBatchFileName] = useState<string>("");
  const [batchJsonInput, setBatchJsonInput] = useState("");
  const [pasteInput, setPasteInput] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Single mode result
  const [result, setResult] = useState<{
    prediction?: (number | string)[];
    probabilities?: number[][];
    classes?: (string | number)[];
    error?: string;
  } | null>(null);

  // Load models on mount
  useEffect(() => {
    if (playgroundOpen) {
      loadModels();
      checkServerStatus();
    }
  }, [playgroundOpen]);

  // Load versions when model changes
  useEffect(() => {
    if (selectedModel) {
      loadVersions(selectedModel.id);
    } else {
      setVersions([]);
      setSelectedVersion(null);
    }
  }, [selectedModel]);

  const loadModels = async () => {
    setLoading(true);
    try {
      const data = await listModels();
      const modelsWithVersions = data.filter((m) => m.version_count > 0);
      setModels(modelsWithVersions);
    } catch (error) {
      console.error("Failed to load models:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadVersions = async (modelId: string) => {
    try {
      const data = await listModelVersions(modelId);
      const supportedVersions = data.filter(
        (v) => v.format === "joblib" || v.format === "pickle"
      );
      setVersions(supportedVersions);
      if (supportedVersions.length > 0 && !selectedVersion) {
        setSelectedVersion(supportedVersions[0]);
      }
    } catch (error) {
      console.error("Failed to load versions:", error);
    }
  };

  const checkServerStatus = async () => {
    try {
      const status = await getInferenceServerStatus(selectedVersion?.id);
      setServerStatus(status);
    } catch {
      setServerStatus(null);
    }
  };

  const handleStartServer = async () => {
    if (!selectedVersion) return;

    setServerLoading(true);
    setResult(null);
    setBatchResult(null);
    try {
      const status = await startInferenceServer(selectedVersion.id);
      setServerStatus(status);

      const featureNames = getFeatureNames(selectedVersion, status);
      const initialValues: Record<string, string> = {};
      featureNames.forEach((name) => {
        initialValues[name] = "";
      });
      setFeatureValues(initialValues);
    } catch (error) {
      console.error("Failed to start server:", error);
      setResult({ error: String(error) });
    } finally {
      setServerLoading(false);
    }
  };

  const handleStopServer = async () => {
    setServerLoading(true);
    try {
      await stopInferenceServer();
      setServerStatus(null);
      setResult(null);
    } catch (error) {
      console.error("Failed to stop server:", error);
    } finally {
      setServerLoading(false);
    }
  };

  const getFeatureNames = (
    version: ModelVersion | null,
    status: ServerStatus | null
  ): string[] => {
    if (version?.feature_names) {
      try {
        return JSON.parse(version.feature_names);
      } catch {
        // Fall through
      }
    }
    if (status?.feature_names) {
      return status.feature_names;
    }
    if (status?.model_info?.feature_names) {
      return status.model_info.feature_names;
    }
    return [];
  };

  const featureNames = getFeatureNames(selectedVersion, serverStatus);

  // Column validation for batch data
  const validateColumns = useCallback(
    (data: Record<string, unknown>[]): string | null => {
      if (!data.length) return "No data rows found";
      if (!featureNames.length) return null; // No feature names = skip validation

      const actualColumns = Object.keys(data[0]);
      const missing = featureNames.filter((f) => !actualColumns.includes(f));

      if (missing.length > 0) {
        return `Missing columns: ${missing.join(", ")}`;
      }
      return null;
    },
    [featureNames]
  );

  // CSV file upload handler
  const handleFileUpload = useCallback(
    (file: File) => {
      Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => {
          const data = results.data as Record<string, unknown>[];
          const error = validateColumns(data);
          setValidationError(error);
          setBatchData(data);
          setBatchFileName(file.name);
          setBatchResult(null);
        },
        error: (error) => {
          setValidationError(`CSV parse error: ${error.message}`);
          setBatchData(null);
        },
      });
    },
    [validateColumns, setBatchResult]
  );

  // JSON array parse handler
  const handleJsonParse = useCallback(() => {
    try {
      const data = JSON.parse(batchJsonInput);
      if (!Array.isArray(data)) throw new Error("Must be array of objects");
      if (data.length > 0 && typeof data[0] !== "object") {
        throw new Error("Each row must be an object with feature keys");
      }
      const error = validateColumns(data);
      setValidationError(error);
      setBatchData(data);
      setBatchFileName("json_input");
      setBatchResult(null);
    } catch (e) {
      setValidationError(
        `JSON parse error: ${e instanceof Error ? e.message : "Invalid JSON"}`
      );
      setBatchData(null);
    }
  }, [batchJsonInput, validateColumns, setBatchResult]);

  // Tab-separated paste handler
  const handlePasteParse = useCallback(() => {
    if (!pasteInput.trim()) {
      setValidationError("No data pasted");
      return;
    }
    Papa.parse(pasteInput, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      delimiter: "\t",
      complete: (results) => {
        const data = results.data as Record<string, unknown>[];
        const error = validateColumns(data);
        setValidationError(error);
        setBatchData(data);
        setBatchFileName("pasted_data");
        setBatchResult(null);
      },
    });
  }, [pasteInput, validateColumns, setBatchResult]);

  // Single inference handler
  const handleRunInference = useCallback(async () => {
    if (!serverStatus?.running) return;

    let input: Record<string, unknown>;

    if (featureNames.length > 0) {
      input = {};
      for (const name of featureNames) {
        const val = featureValues[name];
        if (!val || val.trim() === "") {
          setResult({ error: `Missing value for feature: ${name}` });
          return;
        }
        input[name] = parseFloat(val);
        if (isNaN(input[name] as number)) {
          setResult({ error: `Invalid number for feature: ${name}` });
          return;
        }
      }
    } else {
      try {
        input = JSON.parse(jsonInput);
      } catch {
        setResult({ error: "Invalid JSON input" });
        return;
      }
    }

    setInferenceLoading(true);
    setResult(null);

    const requestId = crypto.randomUUID();
    const timestamp = Date.now();

    try {
      const response = await runInference(requestId, input);
      const resultData = {
        prediction: response.prediction,
        probabilities: response.probabilities,
        classes: response.classes,
        error: response.status === "error" ? response.message : undefined,
      };
      setResult(resultData);

      addInferenceRequest({
        id: requestId,
        timestamp,
        input,
        result: resultData,
      });
    } catch (error) {
      const resultData = { error: String(error) };
      setResult(resultData);
      addInferenceRequest({
        id: requestId,
        timestamp,
        input,
        result: resultData,
      });
    } finally {
      setInferenceLoading(false);
    }
  }, [serverStatus, featureNames, featureValues, jsonInput, addInferenceRequest]);

  // Batch inference handler with chunking and cancel support
  const handleBatchInference = useCallback(async () => {
    if (!serverStatus?.running) {
      setValidationError("Server not running. Start the inference server first.");
      return;
    }

    if (!batchData || batchData.length === 0) {
      setValidationError("No data to process");
      return;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsProcessingBatch(true);
    setBatchProgress({ current: 0, total: batchData.length });
    setBatchResult(null);

    try {
      const result = await runBatchInference(batchData, {
        chunkSize: 500,
        signal: abortController.signal,
        onProgress: (current, total) => {
          setBatchProgress({ current, total });
        },
      });

      const batchResultData: BatchInferenceResult = {
        id: `batch-${Date.now()}`,
        timestamp: Date.now(),
        fileName: batchFileName,
        rowCount: result.predictions.length,
        inputs: batchData.slice(0, result.predictions.length),
        predictions: result.predictions,
        probabilities: result.probabilities,
        classes: result.classes,
        error: result.error,
      };

      setBatchResult(batchResultData);
    } catch (error) {
      setValidationError(
        error instanceof Error ? error.message : "Batch inference failed"
      );
    } finally {
      setIsProcessingBatch(false);
      setBatchProgress(null);
      abortControllerRef.current = null;
    }
  }, [serverStatus, batchData, batchFileName, setBatchResult]);

  // Cancel batch processing
  const handleCancelBatch = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  // Export batch results to CSV
  const handleExportCsv = useCallback(() => {
    if (!batchResult) return;

    const rows = batchResult.inputs.map((input, idx) => {
      const row: Record<string, unknown> = {
        ...input,
        prediction: batchResult.predictions[idx],
      };

      if (batchResult.probabilities && batchResult.classes) {
        row.confidence = Math.max(...batchResult.probabilities[idx]);
        batchResult.classes.forEach((cls, classIdx) => {
          row[`prob_${cls}`] = batchResult.probabilities![idx][classIdx];
        });
      }

      return row;
    });

    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `predictions_${batchResult.fileName}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [batchResult]);

  const handleHistoryClick = (request: InferenceRequest) => {
    if (featureNames.length > 0) {
      const newValues: Record<string, string> = {};
      featureNames.forEach((name) => {
        const val = request.input[name];
        newValues[name] = val !== undefined ? String(val) : "";
      });
      setFeatureValues(newValues);
    } else {
      setJsonInput(JSON.stringify(request.input, null, 2));
    }
  };

  // Clear batch state when switching modes
  useEffect(() => {
    if (mode === "single") {
      setBatchData(null);
      setBatchFileName("");
      setValidationError(null);
    } else {
      setResult(null);
    }
  }, [mode]);

  if (!playgroundOpen) {
    return null;
  }

  return (
    <div className="w-80 flex flex-col panel-sidebar-right border-l border-white/5 animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <RiRocketLine className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium text-accent">Playground</span>
        </div>
        <button
          onClick={closePlayground}
          className="p-1 rounded hover:bg-white/10 text-text-muted hover:text-text-primary"
        >
          <RiCloseLine className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Model Selector */}
        <div className="p-4 border-b border-white/5 space-y-3">
          <div>
            <label className="text-xs text-text-muted uppercase mb-1 block">
              Model
            </label>
            <Listbox value={selectedModel} onChange={setSelectedModel}>
              <div className="relative">
                <Listbox.Button className="relative w-full input text-left py-2 pl-3 pr-10">
                  <span className="block truncate">
                    {selectedModel?.name || "Select model..."}
                  </span>
                  <span className="absolute inset-y-0 right-0 flex items-center pr-2">
                    <RiArrowDownSLine className="w-4 h-4 text-text-muted" />
                  </span>
                </Listbox.Button>
                <Transition
                  as={Fragment}
                  leave="transition ease-in duration-100"
                  leaveFrom="opacity-100"
                  leaveTo="opacity-0"
                >
                  <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-background-surface border border-white/10 shadow-lg">
                    {loading ? (
                      <div className="flex items-center justify-center py-4">
                        <RiLoader4Line className="w-4 h-4 animate-spin text-text-muted" />
                      </div>
                    ) : models.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-text-muted">
                        No models available
                      </div>
                    ) : (
                      models.map((model) => (
                        <Listbox.Option
                          key={model.id}
                          value={model}
                          className={({ active }) =>
                            cn(
                              "cursor-pointer select-none py-2 pl-10 pr-4 text-sm",
                              active && "bg-accent/10"
                            )
                          }
                        >
                          {({ selected }) => (
                            <>
                              <span
                                className={cn(
                                  "block truncate",
                                  selected && "font-medium"
                                )}
                              >
                                {model.name}
                              </span>
                              {selected && (
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-accent">
                                  <RiCheckLine className="w-4 h-4" />
                                </span>
                              )}
                            </>
                          )}
                        </Listbox.Option>
                      ))
                    )}
                  </Listbox.Options>
                </Transition>
              </div>
            </Listbox>
          </div>

          {/* Version Selector */}
          {selectedModel && (
            <div>
              <label className="text-xs text-text-muted uppercase mb-1 block">
                Version
              </label>
              <Listbox value={selectedVersion} onChange={setSelectedVersion}>
                <div className="relative">
                  <Listbox.Button className="relative w-full input text-left py-2 pl-3 pr-10">
                    <span className="block truncate">
                      {selectedVersion
                        ? `v${selectedVersion.version} (${selectedVersion.format})`
                        : "Select version..."}
                    </span>
                    <span className="absolute inset-y-0 right-0 flex items-center pr-2">
                      <RiArrowDownSLine className="w-4 h-4 text-text-muted" />
                    </span>
                  </Listbox.Button>
                  <Transition
                    as={Fragment}
                    leave="transition ease-in duration-100"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                  >
                    <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-background-surface border border-white/10 shadow-lg">
                      {versions.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-text-muted">
                          No sklearn versions
                        </div>
                      ) : (
                        versions.map((version) => {
                          const badge = getStageBadge(version.stage);
                          return (
                            <Listbox.Option
                              key={version.id}
                              value={version}
                              className={({ active }) =>
                                cn(
                                  "cursor-pointer select-none py-2 pl-10 pr-4 text-sm",
                                  active && "bg-accent/10"
                                )
                              }
                            >
                              {({ selected }) => (
                                <>
                                  <span className="flex items-center gap-2">
                                    <span
                                      className={cn(
                                        "truncate",
                                        selected && "font-medium"
                                      )}
                                    >
                                      v{version.version}
                                    </span>
                                    <span
                                      className={cn(
                                        "px-1.5 py-0.5 rounded text-xs",
                                        badge.className
                                      )}
                                    >
                                      {badge.icon}
                                    </span>
                                  </span>
                                  {selected && (
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-accent">
                                      <RiCheckLine className="w-4 h-4" />
                                    </span>
                                  )}
                                </>
                              )}
                            </Listbox.Option>
                          );
                        })
                      )}
                    </Listbox.Options>
                  </Transition>
                </div>
              </Listbox>
            </div>
          )}

          {/* Server Control */}
          <div className="flex items-center gap-2">
            {serverStatus?.running ? (
              <>
                <span className="flex items-center gap-1.5 text-xs text-state-success">
                  <span className="w-2 h-2 rounded-full bg-state-success animate-pulse" />
                  Server Running
                </span>
                <button
                  onClick={handleStopServer}
                  disabled={serverLoading}
                  className="ml-auto btn-secondary text-xs py-1 px-3 flex items-center gap-1"
                >
                  {serverLoading ? (
                    <RiLoader4Line className="w-3 h-3 animate-spin" />
                  ) : (
                    <RiStopLine className="w-3 h-3" />
                  )}
                  Stop
                </button>
              </>
            ) : (
              <button
                onClick={handleStartServer}
                disabled={serverLoading || !selectedVersion}
                className="w-full btn-primary text-xs py-2 flex items-center justify-center gap-1"
              >
                {serverLoading ? (
                  <RiLoader4Line className="w-3 h-3 animate-spin" />
                ) : (
                  <RiPlayLine className="w-3 h-3" />
                )}
                Start Server
              </button>
            )}
          </div>
        </div>

        {/* Mode Toggle */}
        {serverStatus?.running && (
          <div className="px-4 py-2 border-b border-white/5">
            <div className="flex rounded-lg bg-background p-0.5">
              <button
                onClick={() => setMode("single")}
                className={cn(
                  "flex-1 py-1.5 text-xs font-medium rounded-md transition-colors",
                  mode === "single"
                    ? "bg-accent text-white"
                    : "text-text-muted hover:text-text-primary"
                )}
              >
                Single
              </button>
              <button
                onClick={() => setMode("batch")}
                className={cn(
                  "flex-1 py-1.5 text-xs font-medium rounded-md transition-colors",
                  mode === "batch"
                    ? "bg-accent text-white"
                    : "text-text-muted hover:text-text-primary"
                )}
              >
                Batch
              </button>
            </div>
          </div>
        )}

        {/* Single Mode Input Form */}
        {serverStatus?.running && mode === "single" && (
          <div className="p-4 border-b border-white/5 space-y-3">
            <label className="text-xs text-text-muted uppercase block">
              Input Features
            </label>

            {featureNames.length > 0 ? (
              <div className="space-y-2">
                {featureNames.map((name) => (
                  <FeatureInput
                    key={name}
                    name={name}
                    value={featureValues[name] || ""}
                    onChange={(value) =>
                      setFeatureValues((prev) => ({ ...prev, [name]: value }))
                    }
                  />
                ))}
              </div>
            ) : (
              <div>
                <p className="text-xs text-text-muted mb-2">
                  Feature names not available. Enter JSON input:
                </p>
                <textarea
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  placeholder='{"feature1": 5.1, "feature2": 3.5}'
                  className="input w-full h-24 font-mono text-xs resize-none"
                />
              </div>
            )}

            <p className="text-xs text-text-muted">
              All features treated as numeric values.
            </p>

            <button
              onClick={handleRunInference}
              disabled={inferenceLoading}
              className="w-full btn-primary text-xs py-2 flex items-center justify-center gap-1"
            >
              {inferenceLoading ? (
                <RiLoader4Line className="w-3 h-3 animate-spin" />
              ) : (
                <RiPlayLine className="w-3 h-3" />
              )}
              Run Inference
            </button>
          </div>
        )}

        {/* Batch Mode Input */}
        {serverStatus?.running && mode === "batch" && (
          <div className="p-4 border-b border-white/5 space-y-3">
            {/* Input Source Toggle */}
            <div>
              <label className="text-xs text-text-muted uppercase mb-2 block">
                Input Source
              </label>
              <div className="flex gap-1">
                {(["csv", "json", "paste"] as BatchInputSource[]).map((src) => (
                  <button
                    key={src}
                    onClick={() => setInputSource(src)}
                    className={cn(
                      "flex-1 py-1 text-xs rounded transition-colors",
                      inputSource === src
                        ? "bg-accent/20 text-accent"
                        : "bg-white/5 text-text-muted hover:text-text-primary"
                    )}
                  >
                    {src.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* CSV Input */}
            {inputSource === "csv" && (
              <DropZone
                onFile={handleFileUpload}
                fileName={batchFileName}
                rowCount={batchData?.length}
              />
            )}

            {/* JSON Input */}
            {inputSource === "json" && (
              <div className="space-y-2">
                <textarea
                  value={batchJsonInput}
                  onChange={(e) => setBatchJsonInput(e.target.value)}
                  placeholder='[{"feature1": 5.1, "feature2": 3.5}, ...]'
                  className="input w-full h-24 font-mono text-xs resize-none"
                />
                <button
                  onClick={handleJsonParse}
                  className="w-full btn-secondary text-xs py-1.5"
                >
                  Parse JSON
                </button>
              </div>
            )}

            {/* Paste Input */}
            {inputSource === "paste" && (
              <div className="space-y-2">
                <textarea
                  value={pasteInput}
                  onChange={(e) => setPasteInput(e.target.value)}
                  placeholder="Paste tab-separated data from Excel/Sheets..."
                  className="input w-full h-24 font-mono text-xs resize-none"
                />
                <button
                  onClick={handlePasteParse}
                  className="w-full btn-secondary text-xs py-1.5"
                >
                  Parse Pasted Data
                </button>
              </div>
            )}

            {/* Validation Error */}
            {validationError && (
              <div className="text-xs text-state-error bg-state-error/10 rounded px-3 py-2">
                {validationError}
              </div>
            )}

            {/* Preview */}
            {batchData && batchData.length > 0 && !validationError && (
              <div>
                <label className="text-xs text-text-muted uppercase mb-1 block">
                  Preview (first 3 of {batchData.length.toLocaleString()} rows)
                </label>
                <div className="text-xs font-mono bg-background rounded p-2 overflow-x-auto">
                  {batchData.slice(0, 3).map((row, i) => (
                    <div key={i} className="truncate text-text-secondary">
                      {Object.entries(row)
                        .slice(0, 4)
                        .map(([k, v]) => `${k}=${v}`)
                        .join(", ")}
                      {Object.keys(row).length > 4 && "..."}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Progress Bar */}
            {batchProgress && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-text-muted">
                  <span>Processing...</span>
                  <span>
                    {batchProgress.current.toLocaleString()}/
                    {batchProgress.total.toLocaleString()}
                  </span>
                </div>
                <div className="h-2 bg-background rounded overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all"
                    style={{
                      width: `${(batchProgress.current / batchProgress.total) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Run/Cancel Button */}
            {isProcessingBatch ? (
              <button
                onClick={handleCancelBatch}
                className="w-full btn-secondary text-xs py-2 flex items-center justify-center gap-1"
              >
                <RiStopLine className="w-3 h-3" />
                Cancel
              </button>
            ) : (
              <button
                onClick={handleBatchInference}
                disabled={!batchData || !!validationError}
                className="w-full btn-primary text-xs py-2 flex items-center justify-center gap-1"
              >
                <RiPlayLine className="w-3 h-3" />
                Run Batch ({batchData?.length.toLocaleString() || 0} rows)
              </button>
            )}
          </div>
        )}

        {/* Single Mode Result Display */}
        {mode === "single" && result && (
          <div className="p-4 border-b border-white/5">
            <label className="text-xs text-text-muted uppercase mb-2 block">
              Result
            </label>

            {result.error ? (
              <div className="bg-state-error/10 border border-state-error/20 rounded-lg p-3">
                <p className="text-sm text-state-error">{result.error}</p>
              </div>
            ) : (
              <div className="bg-state-success/10 border border-state-success/20 rounded-lg p-3 space-y-2">
                <div>
                  <span className="text-xs text-text-muted">Prediction:</span>
                  <p className="text-lg font-mono text-state-success">
                    {result.prediction?.[0] !== undefined
                      ? String(result.prediction[0])
                      : "-"}
                  </p>
                </div>

                {result.probabilities && result.classes && (
                  <div>
                    <span className="text-xs text-text-muted">
                      Probabilities:
                    </span>
                    <div className="space-y-1 mt-1">
                      {result.classes.map((cls, idx) => {
                        const prob = result.probabilities?.[0]?.[idx] || 0;
                        return (
                          <div
                            key={idx}
                            className="flex items-center gap-2 text-xs"
                          >
                            <span className="w-20 text-text-secondary truncate">
                              {String(cls)}
                            </span>
                            <div className="flex-1 h-2 bg-background rounded overflow-hidden">
                              <div
                                className="h-full bg-accent"
                                style={{ width: `${prob * 100}%` }}
                              />
                            </div>
                            <span className="w-12 text-right text-text-muted">
                              {(prob * 100).toFixed(1)}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Batch Mode Results */}
        {mode === "batch" && batchResult && (
          <div className="p-4 border-b border-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs text-text-muted uppercase">
                Results ({batchResult.rowCount.toLocaleString()} rows)
              </label>
              <button
                onClick={handleExportCsv}
                className="btn-secondary text-xs py-1 px-2 flex items-center gap-1"
              >
                <RiDownloadLine className="w-3 h-3" />
                Export CSV
              </button>
            </div>

            {/* Error/Warning Banner */}
            {batchResult.error && (
              <div className="text-xs text-state-warning bg-state-warning/10 rounded px-3 py-2">
                {batchResult.error}
              </div>
            )}

            {/* Results Table */}
            {batchResult.predictions.length > 0 && (
              <BatchResultsTable
                inputs={batchResult.inputs}
                predictions={batchResult.predictions}
                probabilities={batchResult.probabilities}
                classes={batchResult.classes}
              />
            )}
          </div>
        )}

        {/* History (Single mode only) */}
        {mode === "single" && inferenceHistory.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
              <div className="flex items-center gap-1.5 text-xs text-text-muted">
                <RiHistoryLine className="w-3 h-3" />
                History ({inferenceHistory.length})
              </div>
              <button
                onClick={clearInferenceHistory}
                className="p-1 rounded hover:bg-white/10 text-text-muted hover:text-state-error"
              >
                <RiDeleteBinLine className="w-3 h-3" />
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {inferenceHistory.map((request) => (
                <HistoryItem
                  key={request.id}
                  request={request}
                  onClick={() => handleHistoryClick(request)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
