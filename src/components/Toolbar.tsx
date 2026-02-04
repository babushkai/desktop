import { useCallback, useEffect, useState, Fragment } from "react";
import { Menu, Transition, Dialog, Listbox } from "@headlessui/react";
import {
  RiPlayFill,
  RiStopFill,
  RiSaveLine,
  RiFolderOpenLine,
  RiAddLine,
  RiSettings4Line,
  RiDeleteBinLine,
  RiArrowDownSLine,
  RiCheckLine,
  RiCloseLine,
  RiSideBarLine,
  RiTerminalBoxLine,
  RiRocketLine,
  RiTestTubeLine,
  RiLayoutGridLine,
} from "@remixicon/react";
import { usePipelineStore } from "../stores/pipelineStore";
import {
  findPython,
  getPythonPath,
  setPythonPath,
  cancelScript,
  listPipelines,
  deletePipeline,
  PipelineMetadata,
  runScriptAndWait,
  ScriptEvent,
  createRun,
  completeRun,
  failRun,
  saveRunMetrics,
  MetricInput,
} from "../lib/tauri";
import { ExperimentDialog } from "./ExperimentDialog";
import { TemplateGallery } from "./TemplateGallery";
import { generateTrainerCode, generateTrainerCodeWithSplit } from "../lib/trainerCodeGen";
import { generateEvaluatorCode, generateEvaluatorCodeWithSplit, generateAutoEvaluatorCode } from "../lib/evaluatorCodeGen";
import { generateLoadModelCode } from "../lib/loadModelCodeGen";
import { MODEL_FILE } from "../lib/constants";
import { generateExporterCode } from "../lib/exporterCodeGen";
import { generateDataSplitCode } from "../lib/dataSplitCodeGen";
import { cn } from "@/lib/utils";

interface ToolbarProps {
  showNodePalette?: boolean;
  showOutputPanel?: boolean;
  showPlayground?: boolean;
  onToggleNodePalette?: () => void;
  onToggleOutputPanel?: () => void;
  onTogglePlayground?: () => void;
}

export function Toolbar({
  showNodePalette,
  showOutputPanel,
  showPlayground,
  onToggleNodePalette,
  onToggleOutputPanel,
  onTogglePlayground,
}: ToolbarProps) {
  const {
    nodes,
    edges,
    executionStatus,
    pythonPath,
    setPythonPath: setStorePythonPath,
    setExecutionStatus,
    appendLog,
    clearLogs,
    setMetrics,
    validatePipeline,
    currentPipelineName,
    isDirty,
    savePipeline,
    loadPipeline,
    newPipeline,
    setCurrentRunId,
    loadRunHistory,
    profilingNodeId,
    setProfilingStatus,
    setProfilingNodeId,
    tuningNodeId,
    setTuningNodeId,
    setTuningStatus,
    experiments,
    selectedExperimentId,
    setSelectedExperimentId,
    loadExperiments,
  } = usePipelineStore();

  const [isEditingPath, setIsEditingPath] = useState(false);
  const [pathInput, setPathInput] = useState("");
  const [pipelines, setPipelines] = useState<PipelineMetadata[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveNameInput, setSaveNameInput] = useState("");
  const [showExperimentDialog, setShowExperimentDialog] = useState(false);
  const [showTemplateGallery, setShowTemplateGallery] = useState(false);

  useEffect(() => {
    const loadPythonPath = async () => {
      let path = await getPythonPath();
      if (!path) {
        const pythonInfo = await findPython();
        if (pythonInfo) {
          path = pythonInfo.path;
        }
      }
      if (path) {
        setStorePythonPath(path);
        setPathInput(path);
      }
    };
    loadPythonPath();
  }, [setStorePythonPath]);

  // Load experiments on mount
  useEffect(() => {
    loadExperiments();
  }, [loadExperiments]);

  const handleRun = useCallback(async () => {
    const errors = validatePipeline();
    if (errors.length > 0) {
      clearLogs();
      errors.forEach((e) => appendLog(`ERROR: ${e}`));
      return;
    }

    clearLogs();
    setExecutionStatus("running");

    const trainerNode = nodes.find((n) => n.type === "trainer");
    const evaluatorNode = nodes.find((n) => n.type === "evaluator");
    const scriptNode = nodes.find((n) => n.type === "script");
    const dataSplitNode = nodes.find((n) => n.type === "dataSplit");

    const useDataSplit =
      dataSplitNode &&
      trainerNode &&
      edges.some((e) => e.source === dataSplitNode.id && e.target === trainerNode.id);

    let inputPath: string | undefined;

    if (useDataSplit && dataSplitNode) {
      const dsEdge = edges.find((e) => e.target === dataSplitNode.id);
      const dataLoaderNode = nodes.find((n) => n.id === dsEdge?.source);
      inputPath = dataLoaderNode?.data.filePath;
    } else {
      const targetNode = trainerNode || scriptNode;
      if (!targetNode) {
        appendLog("ERROR: No executable node found");
        setExecutionStatus("error");
        return;
      }

      const edge = edges.find((e) => e.target === targetNode.id);
      const dataLoaderNode = nodes.find((n) => n.id === edge?.source);
      inputPath = dataLoaderNode?.data.filePath;
    }

    if (!inputPath) {
      appendLog("ERROR: No input file selected");
      setExecutionStatus("error");
      return;
    }

    // Extract hyperparameters from nodes
    const hyperparams: Record<string, unknown> = {};
    if (trainerNode) {
      hyperparams.modelType = trainerNode.data.modelType;
      hyperparams.targetColumn = trainerNode.data.targetColumn;
      hyperparams.testSplit = trainerNode.data.testSplit;
      hyperparams.trainerMode = trainerNode.data.trainerMode;
    }
    if (dataSplitNode) {
      hyperparams.splitRatio = dataSplitNode.data.splitRatio;
      hyperparams.randomState = dataSplitNode.data.randomState;
      hyperparams.stratify = dataSplitNode.data.stratify;
    }

    // Create run record
    const pipelineName = currentPipelineName || "Untitled";
    let runId: string | null = null;
    const startTime = Date.now();

    try {
      // Only pass experimentId if an experiment is selected (active experiments only)
      const activeExperiment = experiments.find(e => e.id === selectedExperimentId && e.status === 'active');
      runId = await createRun(pipelineName, hyperparams, activeExperiment?.id);
      setCurrentRunId(runId);
    } catch (error) {
      console.error("Failed to create run:", error);
    }

    // Collect metrics to save at the end
    let collectedMetrics: MetricInput[] = [];

    const handleOutput = (event: ScriptEvent) => {
      if (event.type === "log") {
        appendLog(event.message);
      } else if (event.type === "error") {
        appendLog(`ERROR: ${event.message}`);
      } else if (event.type === "metrics") {
        setMetrics({ ...event.data, modelType: event.modelType as "classifier" | "regressor" });

        // Collect metrics for run history
        const data = event.data;
        if (data.accuracy !== undefined) collectedMetrics.push({ name: "accuracy", value: data.accuracy });
        if (data.precision !== undefined) collectedMetrics.push({ name: "precision", value: data.precision });
        if (data.recall !== undefined) collectedMetrics.push({ name: "recall", value: data.recall });
        if (data.f1 !== undefined) collectedMetrics.push({ name: "f1", value: data.f1 });
        if (data.r2 !== undefined) collectedMetrics.push({ name: "r2", value: data.r2 });
        if (data.mse !== undefined) collectedMetrics.push({ name: "mse", value: data.mse });
        if (data.rmse !== undefined) collectedMetrics.push({ name: "rmse", value: data.rmse });
        if (data.mae !== undefined) collectedMetrics.push({ name: "mae", value: data.mae });
        if (data.confusionMatrix) collectedMetrics.push({ name: "confusion_matrix", valueJson: JSON.stringify(data.confusionMatrix) });
      }
    };

    try {
      if (useDataSplit && dataSplitNode) {
        appendLog("--- Running Data Split ---");
        appendLog(`Input: ${inputPath}`);
        appendLog(`Split ratio: ${((dataSplitNode.data.splitRatio || 0.2) * 100).toFixed(0)}%`);
        appendLog(`Random state: ${dataSplitNode.data.randomState ?? 42}`);
        if (dataSplitNode.data.stratify) {
          appendLog(`Stratify by: ${dataSplitNode.data.splitTargetColumn || "(not set)"}`);
        }
        appendLog("");

        const splitCode = generateDataSplitCode(dataSplitNode.data, inputPath);
        await runScriptAndWait(splitCode, inputPath, handleOutput);
      }

      if (trainerNode) {
        const isLoadMode = trainerNode.data.trainerMode === "load";

        if (isLoadMode) {
          appendLog("");
          appendLog("--- Loading Pre-trained Model ---");
          appendLog(`Model file: ${trainerNode.data.modelFilePath}`);
          appendLog("");

          const loadCode = generateLoadModelCode(trainerNode.data.modelFilePath!);
          await runScriptAndWait(loadCode, inputPath, handleOutput);
        } else {
          appendLog("");
          appendLog("--- Running Trainer ---");
          appendLog(`Input: ${inputPath}`);
          appendLog(`Model: ${trainerNode.data.modelType || "linear_regression"}`);
          appendLog(`Target: ${trainerNode.data.targetColumn || "target"}`);
          if (!useDataSplit) {
            appendLog(`Test split: ${((trainerNode.data.testSplit || 0.2) * 100).toFixed(0)}%`);
          }
          appendLog("");

          let trainerCode;
          if (useDataSplit) {
            trainerCode = generateTrainerCodeWithSplit(trainerNode.data, inputPath);
          } else {
            trainerCode = generateTrainerCode(trainerNode.data, inputPath);
          }
          await runScriptAndWait(trainerCode, inputPath, handleOutput);
        }
      } else if (scriptNode) {
        appendLog("--- Running Script ---");
        appendLog(`Input: ${inputPath}`);
        appendLog("");

        await runScriptAndWait(scriptNode.data.code!, inputPath, handleOutput);
      }

      if (evaluatorNode) {
        const evalEdge = edges.find((e) => e.target === evaluatorNode.id);
        const evalSourceNode = nodes.find((n) => n.id === evalEdge?.source);

        // Run evaluator if connected to trainer or script
        if (evalSourceNode?.type === "trainer" || evalSourceNode?.type === "script") {
          appendLog("");
          appendLog("--- Running Evaluator ---");

          let evalCode;
          // For load mode or script source, use auto-detect evaluator
          const isLoadMode = trainerNode?.data.trainerMode === "load";
          const isScriptSource = evalSourceNode?.type === "script";

          if (isLoadMode || isScriptSource) {
            // For load mode or script, use auto-detect evaluator
            evalCode = generateAutoEvaluatorCode(MODEL_FILE, inputPath);
          } else if (useDataSplit && trainerNode) {
            evalCode = generateEvaluatorCodeWithSplit(trainerNode.data, inputPath);
          } else if (trainerNode) {
            evalCode = generateEvaluatorCode(trainerNode.data, MODEL_FILE, inputPath);
          } else {
            evalCode = generateAutoEvaluatorCode(MODEL_FILE, inputPath);
          }
          await runScriptAndWait(evalCode, inputPath, handleOutput);
        }
      }

      const modelExporterNode = nodes.find((n) => n.type === "modelExporter");
      if (modelExporterNode) {
        const exportEdge = edges.find((e) => e.target === modelExporterNode.id);
        if (exportEdge) {
          const sourceNode = nodes.find((n) => n.id === exportEdge.source);
          if (sourceNode?.type === "evaluator" || sourceNode?.type === "trainer") {
            appendLog("");
            appendLog("--- Running Model Exporter ---");

            const exportCode = generateExporterCode(modelExporterNode.data, MODEL_FILE);
            await runScriptAndWait(exportCode, inputPath, handleOutput);
          }
        }
      }

      // Save metrics and complete run
      const duration = Date.now() - startTime;
      if (runId) {
        if (collectedMetrics.length > 0) {
          await saveRunMetrics(runId, collectedMetrics);
        }
        await completeRun(runId, duration);
      }

      // Log run summary
      appendLog("");
      appendLog("--- Run Complete ---");
      appendLog(`Run ID: ${runId?.slice(0, 8)}...`);
      appendLog(`Duration: ${(duration / 1000).toFixed(1)}s`);
      appendLog(`Status: completed`);
      if (collectedMetrics.length > 0) {
        const acc = collectedMetrics.find(m => m.name === "accuracy");
        const r2 = collectedMetrics.find(m => m.name === "r2");
        if (acc) appendLog(`Accuracy: ${(acc.value! * 100).toFixed(1)}%`);
        if (r2) appendLog(`R²: ${r2.value!.toFixed(4)}`);
      }

      setExecutionStatus("success");
    } catch (error) {
      // Log run failure summary
      appendLog("");
      appendLog("--- Run Failed ---");
      appendLog(`Run ID: ${runId?.slice(0, 8)}...`);
      appendLog(`Error: ${String(error)}`);

      setExecutionStatus("error");

      // Mark run as failed
      if (runId) {
        await failRun(runId, String(error));
      }
    }

    // Refresh run history
    await loadRunHistory(pipelineName);
  }, [nodes, edges, validatePipeline, clearLogs, appendLog, setExecutionStatus, currentPipelineName, setCurrentRunId, loadRunHistory, experiments, selectedExperimentId]);

  const handleCancel = useCallback(async () => {
    try {
      await cancelScript();
      appendLog("--- Script cancelled ---");
      setExecutionStatus("idle");
    } catch (error) {
      appendLog(`ERROR: ${error}`);
    }
  }, [appendLog, setExecutionStatus]);

  const handleCancelProfiling = useCallback(async () => {
    try {
      await cancelScript();
      appendLog("--- Profiling cancelled ---");
      if (profilingNodeId) {
        setProfilingStatus(profilingNodeId, "cancelled");
        setProfilingNodeId(null);
      }
    } catch (error) {
      appendLog(`ERROR: ${error}`);
    }
  }, [appendLog, profilingNodeId, setProfilingStatus, setProfilingNodeId]);

  const handleCancelTuning = useCallback(async () => {
    try {
      await cancelScript();
      appendLog("--- Tuning cancelled ---");
      setTuningStatus("cancelled");
      setTuningNodeId(null);
    } catch (error) {
      appendLog(`ERROR: ${error}`);
    }
  }, [appendLog, setTuningStatus, setTuningNodeId]);

  const handleSavePythonPath = useCallback(async () => {
    await setPythonPath(pathInput);
    setStorePythonPath(pathInput);
    setIsEditingPath(false);
  }, [pathInput, setStorePythonPath]);

  const handleSave = useCallback(async () => {
    if (currentPipelineName) {
      try {
        await savePipeline(currentPipelineName);
        appendLog(`Pipeline saved: ${currentPipelineName}`);
      } catch (error) {
        appendLog(`ERROR: Failed to save pipeline: ${error}`);
      }
    } else {
      setSaveNameInput("");
      setShowSaveDialog(true);
    }
  }, [currentPipelineName, savePipeline, appendLog]);

  const handleSaveConfirm = useCallback(async () => {
    const name = saveNameInput.trim() || `Pipeline ${Date.now()}`;
    setShowSaveDialog(false);
    try {
      await savePipeline(name);
      appendLog(`Pipeline saved: ${name}`);
    } catch (error) {
      appendLog(`ERROR: Failed to save pipeline: ${error}`);
    }
  }, [saveNameInput, savePipeline, appendLog]);

  const handleLoadMenu = useCallback(async () => {
    const list = await listPipelines();
    setPipelines(list);
  }, []);

  const handleLoadPipeline = useCallback(
    async (id: string) => {
      if (isDirty) {
        const confirmed = window.confirm("Discard unsaved changes?");
        if (!confirmed) return;
      }
      await loadPipeline(id);
    },
    [isDirty, loadPipeline]
  );

  const handleDeletePipeline = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = window.confirm("Delete this pipeline?");
    if (confirmed) {
      await deletePipeline(id);
      const list = await listPipelines();
      setPipelines(list);
    }
  }, []);

  const handleNew = useCallback(() => {
    if (isDirty) {
      const confirmed = window.confirm("Discard unsaved changes?");
      if (!confirmed) return;
    }
    newPipeline();
  }, [isDirty, newPipeline]);

  const hasExecutableNode = nodes.some(
    (n) => n.type === "script" || n.type === "trainer" || n.type === "evaluator"
  );
  const hasDataLoaderWithFile = nodes.some((n) => n.type === "dataLoader" && n.data.filePath);
  const isRunnable = hasExecutableNode && hasDataLoaderWithFile;

  return (
    <div className="flex items-center gap-4 px-4 py-3 panel-toolbar border-b border-white/5">
      {/* Title */}
      <h1 className="text-lg font-semibold text-text-primary">
        MLOps Desktop
        {currentPipelineName && (
          <span className="font-normal text-text-muted ml-2">
            - {currentPipelineName}
            {isDirty && <span className="text-state-warning"> *</span>}
          </span>
        )}
        {!currentPipelineName && isDirty && (
          <span className="font-normal text-text-muted ml-2">
            - Untitled<span className="text-state-warning"> *</span>
          </span>
        )}
      </h1>

      {/* Pipeline buttons */}
      <div className="flex items-center gap-2">
        <button onClick={handleNew} className="btn-secondary">
          <RiAddLine className="w-4 h-4" />
          New
        </button>

        <button onClick={handleSave} className="btn-secondary">
          <RiSaveLine className="w-4 h-4" />
          Save
        </button>

        <Menu as="div" className="relative">
          <Menu.Button onClick={handleLoadMenu} className="btn-secondary">
            <RiFolderOpenLine className="w-4 h-4" />
            Load
            <RiArrowDownSLine className="w-3 h-3 ml-1" />
          </Menu.Button>

          <Transition
            as={Fragment}
            enter="transition ease-out duration-100"
            enterFrom="transform opacity-0 scale-95"
            enterTo="transform opacity-100 scale-100"
            leave="transition ease-in duration-75"
            leaveFrom="transform opacity-100 scale-100"
            leaveTo="transform opacity-0 scale-95"
          >
            <Menu.Items className="absolute left-0 mt-1 w-56 origin-top-left rounded-lg bg-background-surface border border-white/10 shadow-lg focus:outline-none z-50">
              <div className="px-3 py-2 text-xs font-semibold text-text-muted uppercase tracking-wider">
                Saved Pipelines
              </div>
              <div className="border-t border-white/5" />
              {pipelines.length === 0 ? (
                <div className="px-3 py-2 text-xs text-text-muted">No saved pipelines</div>
              ) : (
                pipelines.map((p) => (
                  <Menu.Item key={p.id}>
                    {({ active }) => (
                      <div
                        onClick={() => handleLoadPipeline(p.id)}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2 text-sm text-left cursor-pointer group",
                          active && "bg-background-elevated text-text-primary"
                        )}
                      >
                        <span className="truncate">{p.name}</span>
                        <span
                          onClick={(e) => handleDeletePipeline(p.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-state-error/20 text-state-error"
                        >
                          <RiDeleteBinLine className="w-3 h-3" />
                        </span>
                      </div>
                    )}
                  </Menu.Item>
                ))
              )}
            </Menu.Items>
          </Transition>
        </Menu>

        <button
          onClick={() => setShowTemplateGallery(true)}
          className="btn-secondary"
        >
          <RiLayoutGridLine className="w-4 h-4" />
          Templates
        </button>
      </div>

      {/* Experiment selector */}
      <div className="flex items-center gap-2">
        <RiTestTubeLine className="w-4 h-4 text-text-muted" />
        <Listbox value={selectedExperimentId} onChange={setSelectedExperimentId}>
          <div className="relative">
            <Listbox.Button className="btn-secondary min-w-[140px] justify-between whitespace-nowrap">
              <span className={cn("truncate max-w-[120px]", !selectedExperimentId && "text-text-muted")}>
                {selectedExperimentId
                  ? experiments.find((e) => e.id === selectedExperimentId)?.name || "Unknown"
                  : "No Experiment"}
              </span>
              <RiArrowDownSLine className="w-4 h-4 ml-1 flex-shrink-0" />
            </Listbox.Button>
            <Transition
              as={Fragment}
              leave="transition ease-in duration-100"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <Listbox.Options className="absolute left-0 mt-1 w-56 origin-top-left rounded-lg bg-background-surface border border-white/10 shadow-lg focus:outline-none z-50 overflow-hidden">
                <Listbox.Option
                  value={null}
                  className={({ active }) =>
                    cn(
                      "relative cursor-pointer select-none py-2 px-3 text-sm",
                      active && "bg-background-elevated"
                    )
                  }
                >
                  {({ selected }) => (
                    <div className="flex items-center justify-between">
                      <span className="text-text-muted">(No Experiment)</span>
                      {selected && <RiCheckLine className="w-4 h-4 text-accent" />}
                    </div>
                  )}
                </Listbox.Option>
                {experiments.filter(e => e.status === 'active').length > 0 && (
                  <div className="border-t border-white/5" />
                )}
                {experiments.filter(e => e.status === 'active').map((exp) => (
                  <Listbox.Option
                    key={exp.id}
                    value={exp.id}
                    className={({ active }) =>
                      cn(
                        "relative cursor-pointer select-none py-2 px-3 text-sm",
                        active && "bg-background-elevated"
                      )
                    }
                  >
                    {({ selected }) => (
                      <div className="flex items-center justify-between">
                        <span className={selected ? "font-medium text-text-primary" : "text-text-secondary"}>
                          {exp.name}
                        </span>
                        {selected && <RiCheckLine className="w-4 h-4 text-accent" />}
                      </div>
                    )}
                  </Listbox.Option>
                ))}
                <div className="border-t border-white/5" />
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowExperimentDialog(true);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-accent hover:bg-background-elevated"
                >
                  <RiAddLine className="w-4 h-4" />
                  New Experiment...
                </button>
              </Listbox.Options>
            </Transition>
          </div>
        </Listbox>
      </div>

      <div className="flex-1" />

      {/* Python path display/edit */}
      <div className="flex items-center gap-2">
        <RiSettings4Line className="w-4 h-4 text-text-muted" />
        <span className="text-xs text-text-muted">Python:</span>

        {isEditingPath ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              className="input w-72 h-7 text-xs font-mono"
            />
            <button onClick={handleSavePythonPath} className="btn-ghost h-7 w-7 p-0">
              <RiCheckLine className="w-4 h-4 text-state-success" />
            </button>
            <button onClick={() => setIsEditingPath(false)} className="btn-ghost h-7 w-7 p-0">
              <RiCloseLine className="w-4 h-4 text-text-muted" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-primary font-mono">
              {pythonPath || "Not found"}
            </span>
            <button onClick={() => setIsEditingPath(true)} className="btn-ghost text-xs">
              Change
            </button>
          </div>
        )}
      </div>

      {/* View toggles - only show if callbacks provided */}
      {(onToggleNodePalette || onToggleOutputPanel || onTogglePlayground) && (
        <>
          <div className="flex items-center gap-1">
            {onToggleNodePalette && (
              <button
                onClick={onToggleNodePalette}
                className={cn(
                  "btn-ghost h-8 w-8 p-0",
                  showNodePalette && "bg-accent/20 text-accent"
                )}
                title="Toggle Components Panel (Ctrl+B)"
              >
                <RiSideBarLine className="w-4 h-4" />
              </button>
            )}
            {onToggleOutputPanel && (
              <button
                onClick={onToggleOutputPanel}
                className={cn(
                  "btn-ghost h-8 w-8 p-0",
                  showOutputPanel && "bg-accent/20 text-accent"
                )}
                title="Toggle Output Panel (Ctrl+J)"
              >
                <RiTerminalBoxLine className="w-4 h-4" />
              </button>
            )}
            {onTogglePlayground && (
              <button
                onClick={onTogglePlayground}
                className={cn(
                  "btn-ghost h-8 w-8 p-0",
                  showPlayground && "bg-accent/20 text-accent"
                )}
                title="Toggle Playground (Ctrl+Shift+P)"
              >
                <RiRocketLine className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="w-px h-6 bg-white/10" />
        </>
      )}

      {/* Run/Cancel buttons */}
      {tuningNodeId ? (
        <button onClick={handleCancelTuning} className="btn-destructive">
          <RiStopFill className="w-4 h-4" />
          Cancel Tuning
        </button>
      ) : profilingNodeId ? (
        <button onClick={handleCancelProfiling} className="btn-destructive">
          <RiStopFill className="w-4 h-4" />
          Cancel Profile
        </button>
      ) : executionStatus === "running" ? (
        <button onClick={handleCancel} className="btn-destructive">
          <RiStopFill className="w-4 h-4" />
          Cancel
        </button>
      ) : (
        <button
          onClick={handleRun}
          disabled={!isRunnable || profilingNodeId !== null || tuningNodeId !== null}
          className="btn-primary"
        >
          <RiPlayFill className="w-4 h-4" />
          Run
        </button>
      )}

      {/* Status indicator */}
      <div
        className={cn(
          "w-3 h-3 rounded-full transition-colors",
          executionStatus === "running" && "bg-state-warning animate-pulse",
          executionStatus === "success" && "bg-state-success",
          executionStatus === "error" && "bg-state-error",
          executionStatus === "idle" && "bg-text-muted"
        )}
      />

      {/* Experiment Dialog */}
      <ExperimentDialog
        isOpen={showExperimentDialog}
        onClose={() => setShowExperimentDialog(false)}
        onSuccess={() => loadExperiments()}
      />

      {/* Save Dialog */}
      <Transition appear show={showSaveDialog} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setShowSaveDialog(false)}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-200"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-150"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-md rounded-xl bg-background-surface border border-white/10 p-6 shadow-xl">
                  <Dialog.Title className="text-lg font-semibold text-text-primary mb-4">
                    Save Pipeline
                  </Dialog.Title>
                  <input
                    type="text"
                    value={saveNameInput}
                    onChange={(e) => setSaveNameInput(e.target.value)}
                    placeholder="Enter pipeline name..."
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && handleSaveConfirm()}
                    className="input mb-4"
                  />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowSaveDialog(false)} className="btn-secondary">
                      Cancel
                    </button>
                    <button onClick={handleSaveConfirm} className="btn-primary">
                      Save
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* Template Gallery */}
      <TemplateGallery
        isOpen={showTemplateGallery}
        onClose={() => setShowTemplateGallery(false)}
      />
    </div>
  );
}
