import { useState, useEffect, useCallback, Fragment } from "react";
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
} from "@remixicon/react";
import {
  listModels,
  listModelVersions,
  startInferenceServer,
  stopInferenceServer,
  getInferenceServerStatus,
  runInference,
  ModelMetadata,
  ModelVersion,
  ServerStatus,
} from "@/lib/tauri";
import {
  usePipelineStore,
  InferenceRequest,
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

export function PlaygroundPanel() {
  const playgroundOpen = usePipelineStore((s) => s.playgroundOpen);
  const closePlayground = usePipelineStore((s) => s.closePlayground);
  const inferenceHistory = usePipelineStore((s) => s.inferenceHistory);
  const addInferenceRequest = usePipelineStore((s) => s.addInferenceRequest);
  const clearInferenceHistory = usePipelineStore((s) => s.clearInferenceHistory);

  const [models, setModels] = useState<ModelMetadata[]>([]);
  const [versions, setVersions] = useState<ModelVersion[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelMetadata | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<ModelVersion | null>(null);
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [serverLoading, setServerLoading] = useState(false);
  const [inferenceLoading, setInferenceLoading] = useState(false);

  // Feature inputs
  const [featureValues, setFeatureValues] = useState<Record<string, string>>({});
  const [jsonInput, setJsonInput] = useState("");

  // Result
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
      // Filter to models with at least one version
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
      // Filter to only joblib/pickle formats (sklearn models)
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
    try {
      const status = await startInferenceServer(selectedVersion.id);
      setServerStatus(status);

      // Initialize feature inputs from feature_names
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
    // Priority: version.feature_names > status.feature_names > status.model_info.feature_names
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

  const handleRunInference = useCallback(async () => {
    if (!serverStatus?.running) return;

    let input: Record<string, unknown>;

    if (featureNames.length > 0) {
      // Use feature inputs
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
      // Use JSON input
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

      // Add to history
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

  const handleHistoryClick = (request: InferenceRequest) => {
    // Re-populate inputs from history
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

        {/* Input Form */}
        {serverStatus?.running && (
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

        {/* Result Display */}
        {result && (
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

        {/* History */}
        {inferenceHistory.length > 0 && (
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
