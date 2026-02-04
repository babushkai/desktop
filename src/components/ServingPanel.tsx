import { useState, useEffect, useCallback, useMemo } from "react";
import {
  RiPlayFill,
  RiStopFill,
  RiLoader4Line,
  RiFileCopyLine,
  RiExternalLinkLine,
  RiRefreshLine,
  RiCheckLine,
  RiCloseLine,
  RiSettings3Line,
  RiAlertLine,
} from "@remixicon/react";
import { Listbox } from "@headlessui/react";
import { cn } from "@/lib/utils";
import { usePipelineStore } from "@/stores/pipelineStore";
import {
  listModels,
  listModelVersions,
  checkPythonPackage,
  startHttpServer,
  stopHttpServer,
  getHttpServerStatus,
  getHttpServerMetrics,
  resetHttpServerMetrics,
  listenToHttpRequestLog,
  findPython,
  HttpServerStatus,
  HttpServerMetrics,
  HttpRequestLog,
  HttpServerConfig,
  ModelMetadata,
  ModelVersion,
  PythonInfo,
} from "@/lib/tauri";
import { ServerConfigDialog } from "./ServerConfigDialog";

type ServerState = "stopped" | "starting" | "running" | "stopping";

interface DependencyStatus {
  fastapi: boolean;
  uvicorn: boolean;
  slowapi: boolean;
  onnxruntime: boolean;
}

function formatLatency(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatRPM(rpm: number): string {
  if (rpm < 1) return rpm.toFixed(2);
  return rpm.toFixed(1);
}

export function ServingPanel() {
  const servingVersionId = usePipelineStore((s) => s.servingVersionId);
  const setServingVersionId = usePipelineStore((s) => s.setServingVersionId);

  // Models and versions
  const [models, setModels] = useState<ModelMetadata[]>([]);
  const [versions, setVersions] = useState<ModelVersion[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    servingVersionId
  );

  // Dependencies
  const [deps, setDeps] = useState<DependencyStatus>({
    fastapi: false,
    uvicorn: false,
    slowapi: false,
    onnxruntime: false,
  });
  const [checkingDeps, setCheckingDeps] = useState(true);
  const [pythonInfo, setPythonInfo] = useState<PythonInfo | null>(null);

  // Server state
  const [serverState, setServerState] = useState<ServerState>("stopped");
  const [serverStatus, setServerStatus] = useState<HttpServerStatus | null>(null);
  const [metrics, setMetrics] = useState<HttpServerMetrics | null>(null);
  const [recentRequests, setRecentRequests] = useState<HttpRequestLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Config dialog
  const [configOpen, setConfigOpen] = useState(false);
  const [config, setConfig] = useState<Partial<HttpServerConfig>>({
    host: "127.0.0.1",
    port: 8080,
    use_onnx: false,
  });

  // Check dependencies
  const checkDependencies = useCallback(async () => {
    setCheckingDeps(true);
    try {
      // First check if we have bundled Python
      const pyInfo = await findPython();
      setPythonInfo(pyInfo);

      if (pyInfo?.is_bundled) {
        // Bundled Python has all packages pre-installed
        setDeps({
          fastapi: true,
          uvicorn: true,
          slowapi: true,
          onnxruntime: true,
        });
      } else {
        // System Python - check each package
        const [fastapi, uvicorn, slowapi, onnxruntime] = await Promise.all([
          checkPythonPackage("fastapi"),
          checkPythonPackage("uvicorn"),
          checkPythonPackage("slowapi"),
          checkPythonPackage("onnxruntime"),
        ]);
        setDeps({ fastapi, uvicorn, slowapi, onnxruntime });
      }
    } finally {
      setCheckingDeps(false);
    }
  }, []);

  // Load models
  useEffect(() => {
    listModels().then(setModels);
  }, []);

  // Load versions when model selected
  useEffect(() => {
    if (selectedModelId) {
      listModelVersions(selectedModelId).then(setVersions);
    } else {
      setVersions([]);
    }
  }, [selectedModelId]);

  // Check dependencies on mount
  useEffect(() => {
    checkDependencies();
  }, [checkDependencies]);

  // Check server status on mount and poll
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const status = await getHttpServerStatus();
        setServerStatus(status);
        setServerState(status.running ? "running" : "stopped");
        if (status.running && status.version_id) {
          setSelectedVersionId(status.version_id);
          // Find and select the model
          const version = versions.find((v) => v.id === status.version_id);
          if (version) {
            setSelectedModelId(version.model_id);
          }
        }
      } catch (e) {
        console.error("Failed to check server status:", e);
      }
    };

    checkStatus();

    // Poll every 2 seconds when running
    const interval = setInterval(() => {
      if (serverState === "running") {
        checkStatus();
        getHttpServerMetrics().then(setMetrics);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [serverState, versions]);

  // Listen for request logs
  useEffect(() => {
    const unlisten = listenToHttpRequestLog((log) => {
      setRecentRequests((prev) => [log, ...prev].slice(0, 50));
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Pre-select model/version if servingVersionId is set
  useEffect(() => {
    if (servingVersionId && models.length > 0) {
      // Need to find the model for this version
      const findModelForVersion = async () => {
        for (const model of models) {
          const versions = await listModelVersions(model.id);
          const version = versions.find((v) => v.id === servingVersionId);
          if (version) {
            setSelectedModelId(model.id);
            setSelectedVersionId(servingVersionId);
            break;
          }
        }
      };
      findModelForVersion();
    }
  }, [servingVersionId, models]);

  const selectedVersion = useMemo(() => {
    return versions.find((v) => v.id === selectedVersionId);
  }, [versions, selectedVersionId]);

  const hasRequiredDeps = deps.fastapi && deps.uvicorn && deps.slowapi;
  const canUseOnnx = deps.onnxruntime && selectedVersion?.onnx_path;

  const handleStart = async () => {
    if (!selectedVersionId) return;

    setServerState("starting");
    setError(null);
    setRecentRequests([]);

    try {
      const status = await startHttpServer(selectedVersionId, config);
      setServerStatus(status);
      setServerState("running");
      setServingVersionId(selectedVersionId);
    } catch (e) {
      setError(String(e));
      setServerState("stopped");
    }
  };

  const handleStop = async () => {
    setServerState("stopping");
    setError(null);

    try {
      await stopHttpServer();
      setServerStatus(null);
      setServerState("stopped");
      setMetrics(null);
      setServingVersionId(null);
    } catch (e) {
      setError(String(e));
      setServerState("running");
    }
  };

  const handleCopyUrl = async () => {
    if (serverStatus?.url) {
      await navigator.clipboard.writeText(serverStatus.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleResetMetrics = async () => {
    await resetHttpServerMetrics();
    setMetrics(null);
    setRecentRequests([]);
  };

  // Render
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium text-text-primary">
            HTTP Model Server
          </h2>
          {serverState === "running" && serverStatus && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs bg-state-success/20 text-state-success">
              <span className="w-1.5 h-1.5 rounded-full bg-state-success animate-pulse" />
              Running
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setConfigOpen(true)}
            className="btn-ghost text-xs h-7 px-2"
            disabled={serverState === "running"}
          >
            <RiSettings3Line className="w-3.5 h-3.5 mr-1" />
            Config
          </button>
          <button
            onClick={checkDependencies}
            disabled={checkingDeps}
            className="btn-ghost text-xs h-7 px-2"
          >
            <RiRefreshLine
              className={cn("w-3.5 h-3.5 mr-1", checkingDeps && "animate-spin")}
            />
            Check Deps
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Python status indicator */}
        {!checkingDeps && pythonInfo?.is_bundled && (
          <div className="bg-state-success/10 border border-state-success/30 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <RiCheckLine className="w-4 h-4 text-state-success shrink-0" />
              <div className="text-xs text-state-success">
                <span className="font-medium">Using bundled Python</span>
                <span className="text-state-success/70 ml-2">
                  v{pythonInfo.version} • All packages pre-installed
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Dependency warnings (only for system Python) */}
        {!hasRequiredDeps && !checkingDeps && !pythonInfo?.is_bundled && (
          <div className="bg-state-warning/10 border border-state-warning/30 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <RiAlertLine className="w-4 h-4 text-state-warning shrink-0 mt-0.5" />
              <div className="text-xs text-state-warning">
                <p className="font-medium mb-1">Missing Dependencies</p>
                <p className="text-state-warning/80">
                  Install required packages:
                </p>
                <code className="block mt-1 p-2 bg-black/20 rounded text-[11px]">
                  pip install fastapi uvicorn slowapi
                </code>
                {!deps.onnxruntime && (
                  <p className="mt-2 text-state-warning/80">
                    For ONNX Runtime support (optional):
                    <code className="block mt-1 p-2 bg-black/20 rounded text-[11px]">
                      pip install onnxruntime
                    </code>
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Model Selection */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {/* Model Dropdown */}
            <div>
              <label className="block text-xs text-text-muted mb-1">Model</label>
              <Listbox
                value={selectedModelId}
                onChange={(id) => {
                  setSelectedModelId(id);
                  setSelectedVersionId(null);
                }}
                disabled={serverState === "running"}
              >
                <div className="relative">
                  <Listbox.Button
                    className={cn(
                      "w-full px-3 py-2 text-left text-sm rounded-lg border border-white/10 bg-background-elevated",
                      serverState === "running"
                        ? "opacity-50 cursor-not-allowed"
                        : "hover:border-white/20"
                    )}
                  >
                    {selectedModelId
                      ? models.find((m) => m.id === selectedModelId)?.name
                      : "Select model..."}
                  </Listbox.Button>
                  <Listbox.Options className="absolute z-10 w-full mt-1 bg-background-elevated border border-white/10 rounded-lg shadow-lg max-h-48 overflow-auto">
                    {models.map((model) => (
                      <Listbox.Option
                        key={model.id}
                        value={model.id}
                        className={({ active }) =>
                          cn(
                            "px-3 py-2 text-sm cursor-pointer",
                            active
                              ? "bg-accent/20 text-accent"
                              : "text-text-primary"
                          )
                        }
                      >
                        {model.name}
                      </Listbox.Option>
                    ))}
                  </Listbox.Options>
                </div>
              </Listbox>
            </div>

            {/* Version Dropdown */}
            <div>
              <label className="block text-xs text-text-muted mb-1">Version</label>
              <Listbox
                value={selectedVersionId}
                onChange={setSelectedVersionId}
                disabled={!selectedModelId || serverState === "running"}
              >
                <div className="relative">
                  <Listbox.Button
                    className={cn(
                      "w-full px-3 py-2 text-left text-sm rounded-lg border border-white/10 bg-background-elevated",
                      !selectedModelId || serverState === "running"
                        ? "opacity-50 cursor-not-allowed"
                        : "hover:border-white/20"
                    )}
                  >
                    {selectedVersionId
                      ? `v${versions.find((v) => v.id === selectedVersionId)?.version}`
                      : "Select version..."}
                  </Listbox.Button>
                  <Listbox.Options className="absolute z-10 w-full mt-1 bg-background-elevated border border-white/10 rounded-lg shadow-lg max-h-48 overflow-auto">
                    {versions.map((version) => (
                      <Listbox.Option
                        key={version.id}
                        value={version.id}
                        className={({ active }) =>
                          cn(
                            "px-3 py-2 text-sm cursor-pointer flex items-center justify-between",
                            active
                              ? "bg-accent/20 text-accent"
                              : "text-text-primary"
                          )
                        }
                      >
                        <span>v{version.version}</span>
                        <span className="text-xs text-text-muted">{version.stage}</span>
                      </Listbox.Option>
                    ))}
                  </Listbox.Options>
                </div>
              </Listbox>
            </div>
          </div>

          {/* ONNX checkbox */}
          {selectedVersion && (
            <label
              className={cn(
                "flex items-center gap-2 text-sm",
                !canUseOnnx && "opacity-50 cursor-not-allowed"
              )}
            >
              <input
                type="checkbox"
                checked={config.use_onnx ?? false}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, use_onnx: e.target.checked }))
                }
                disabled={!canUseOnnx || serverState === "running"}
                className="rounded border-white/20"
              />
              <span className="text-text-secondary">
                Use ONNX Runtime
                {!deps.onnxruntime && (
                  <span className="text-text-muted text-xs ml-1">(not installed)</span>
                )}
                {deps.onnxruntime && !selectedVersion?.onnx_path && (
                  <span className="text-text-muted text-xs ml-1">(no ONNX export)</span>
                )}
              </span>
            </label>
          )}
        </div>

        {/* Start/Stop button */}
        <div className="flex items-center gap-3">
          {serverState === "stopped" && (
            <button
              onClick={handleStart}
              disabled={!hasRequiredDeps || !selectedVersionId}
              className={cn(
                "btn-primary h-9 px-4 text-sm flex items-center gap-2",
                (!hasRequiredDeps || !selectedVersionId) && "opacity-50 cursor-not-allowed"
              )}
            >
              <RiPlayFill className="w-4 h-4" />
              Start Server
            </button>
          )}
          {serverState === "starting" && (
            <button disabled className="btn-primary h-9 px-4 text-sm flex items-center gap-2 opacity-50">
              <RiLoader4Line className="w-4 h-4 animate-spin" />
              Starting...
            </button>
          )}
          {serverState === "running" && (
            <button
              onClick={handleStop}
              className="btn-ghost h-9 px-4 text-sm flex items-center gap-2 text-state-error hover:bg-state-error/20"
            >
              <RiStopFill className="w-4 h-4" />
              Stop Server
            </button>
          )}
          {serverState === "stopping" && (
            <button disabled className="btn-ghost h-9 px-4 text-sm flex items-center gap-2 opacity-50">
              <RiLoader4Line className="w-4 h-4 animate-spin" />
              Stopping...
            </button>
          )}

          {/* Server URL */}
          {serverState === "running" && serverStatus?.url && (
            <div className="flex items-center gap-2 flex-1">
              <code className="flex-1 px-3 py-2 bg-background rounded text-xs font-mono text-text-secondary truncate">
                {serverStatus.url}
              </code>
              <button
                onClick={handleCopyUrl}
                className="btn-ghost h-8 px-2"
                title="Copy URL"
              >
                {copied ? (
                  <RiCheckLine className="w-4 h-4 text-state-success" />
                ) : (
                  <RiFileCopyLine className="w-4 h-4" />
                )}
              </button>
              <a
                href={`${serverStatus.url}/docs`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost h-8 px-2"
                title="Open API Docs"
              >
                <RiExternalLinkLine className="w-4 h-4" />
              </a>
            </div>
          )}
        </div>

        {/* Error display */}
        {error && (
          <div className="bg-state-error/10 border border-state-error/30 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <RiCloseLine className="w-4 h-4 text-state-error shrink-0 mt-0.5" />
              <p className="text-xs text-state-error">{error}</p>
            </div>
          </div>
        )}

        {/* Metrics */}
        {serverState === "running" && metrics && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider">
                Metrics
              </h3>
              <button
                onClick={handleResetMetrics}
                className="btn-ghost text-xs h-6 px-2"
              >
                Reset
              </button>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div className="bg-background rounded-lg p-3">
                <div className="text-xs text-text-muted mb-1">Total Requests</div>
                <div className="text-lg font-semibold text-text-primary">
                  {metrics.total_requests}
                </div>
              </div>
              <div className="bg-background rounded-lg p-3">
                <div className="text-xs text-text-muted mb-1">Success Rate</div>
                <div className="text-lg font-semibold text-state-success">
                  {metrics.total_requests > 0
                    ? `${((metrics.successful_requests / metrics.total_requests) * 100).toFixed(1)}%`
                    : "-"}
                </div>
              </div>
              <div className="bg-background rounded-lg p-3">
                <div className="text-xs text-text-muted mb-1">Avg Latency</div>
                <div className="text-lg font-semibold text-text-primary">
                  {metrics.total_requests > 0
                    ? formatLatency(metrics.avg_latency_ms)
                    : "-"}
                </div>
              </div>
              <div className="bg-background rounded-lg p-3">
                <div className="text-xs text-text-muted mb-1">Requests/min</div>
                <div className="text-lg font-semibold text-text-primary">
                  {formatRPM(metrics.requests_per_minute)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Request History */}
        {serverState === "running" && recentRequests.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider">
              Recent Requests
            </h3>
            <div className="bg-background rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="px-3 py-2 text-left font-medium text-text-muted">
                      Time
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-text-muted">
                      Method
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-text-muted">
                      Path
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-text-muted">
                      Status
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-text-muted">
                      Latency
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-text-muted">
                      Batch
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentRequests.slice(0, 10).map((req) => (
                    <tr
                      key={req.id}
                      className="border-b border-white/5 last:border-0"
                    >
                      <td className="px-3 py-2 text-text-muted">
                        {new Date(req.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="px-3 py-2 font-mono text-text-secondary">
                        {req.method}
                      </td>
                      <td className="px-3 py-2 font-mono text-text-secondary">
                        {req.path}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "font-medium",
                            req.status_code >= 200 && req.status_code < 300
                              ? "text-state-success"
                              : req.status_code >= 400
                              ? "text-state-error"
                              : "text-text-secondary"
                          )}
                        >
                          {req.status_code}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-text-muted">
                        {formatLatency(req.latency_ms)}
                      </td>
                      <td className="px-3 py-2 text-text-muted">
                        {req.batch_size}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty state */}
        {serverState === "stopped" && !error && (
          <div className="text-center text-text-muted text-sm py-8">
            <p>Select a model version and click Start Server to begin serving.</p>
            <p className="text-xs mt-2">
              The server will be available at{" "}
              <code className="text-accent">
                http://{config.host}:{config.port}
              </code>
            </p>
          </div>
        )}
      </div>

      {/* Config Dialog */}
      <ServerConfigDialog
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        config={config}
        onConfigChange={setConfig}
        onnxAvailable={selectedVersion?.onnx_path !== undefined}
      />
    </div>
  );
}
