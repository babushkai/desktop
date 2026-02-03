import { useEffect, useCallback, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Canvas } from "./components/Canvas";
import { NodePalette } from "./components/NodePalette";
import { OutputPanel } from "./components/OutputPanel";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { PlaygroundPanel } from "./components/PlaygroundPanel";
import { TuningPanel } from "./components/TuningPanel";
import { Toolbar } from "./components/Toolbar";
import { usePipelineStore } from "./stores/pipelineStore";
import { cn } from "./lib/utils";
import {
  RiLayoutLeftLine,
  RiTerminalBoxLine,
} from "@remixicon/react";
import {
  checkPythonPackage,
  runScriptAndWait,
  ScriptEvent,
  createRun,
  completeRun,
  failRun,
  saveRunMetrics,
  MetricInput,
  createTuningSession,
  completeTuningSession,
  saveTuningTrial,
} from "./lib/tauri";
import { generateTuningCode, generateTuningCodeWithSplit } from "./lib/tunerCodeGen";
import { generateDataSplitCode } from "./lib/dataSplitCodeGen";
import { TuningConfig } from "./lib/tuningTypes";
import { generateExplainerCode } from "./lib/explainerCodeGen";
import {
  ExplainData,
  FeatureImportanceData,
  RegressionShapData,
  ClassificationShapData,
  RegressionPDPData,
  ClassificationPDPData,
  isClassificationShapData,
} from "./lib/explainTypes";
import { ExplainMetadataData } from "./lib/tauri";

function App() {
  const [showNodePalette, setShowNodePalette] = useState(true);
  const [showOutputPanel, setShowOutputPanel] = useState(true);
  const [showTuningPanel, setShowTuningPanel] = useState(false);
  const [tuningPanelNodeId, setTuningPanelNodeId] = useState<string | null>(null);

  const playgroundOpen = usePipelineStore((s) => s.playgroundOpen);
  const openPlayground = usePipelineStore((s) => s.openPlayground);
  const closePlayground = usePipelineStore((s) => s.closePlayground);

  const nodes = usePipelineStore((s) => s.nodes);
  const edges = usePipelineStore((s) => s.edges);
  const selectedNodeId = usePipelineStore((s) => s.selectedNodeId);
  const currentPipelineName = usePipelineStore((s) => s.currentPipelineName);
  const executionStatus = usePipelineStore((s) => s.executionStatus);
  const profilingNodeId = usePipelineStore((s) => s.profilingNodeId);
  const setOptunaInstalled = usePipelineStore((s) => s.setOptunaInstalled);
  const setTuningNodeId = usePipelineStore((s) => s.setTuningNodeId);
  const setTuningStatus = usePipelineStore((s) => s.setTuningStatus);
  const addTuningTrial = usePipelineStore((s) => s.addTuningTrial);
  const clearTuningTrials = usePipelineStore((s) => s.clearTuningTrials);
  const setTuningSessionId = usePipelineStore((s) => s.setTuningSessionId);
  const setExecutionStatus = usePipelineStore((s) => s.setExecutionStatus);
  const appendLog = usePipelineStore((s) => s.appendLog);
  const clearLogs = usePipelineStore((s) => s.clearLogs);
  const loadRunHistory = usePipelineStore((s) => s.loadRunHistory);
  const setExplainData = usePipelineStore((s) => s.setExplainData);
  const setExplainRunId = usePipelineStore((s) => s.setExplainRunId);
  const setExplainStatus = usePipelineStore((s) => s.setExplainStatus);
  const setExplainProgress = usePipelineStore((s) => s.setExplainProgress);
  const explainRunId = usePipelineStore((s) => s.explainRunId);

  // Check for Optuna installation on mount
  useEffect(() => {
    checkPythonPackage("optuna").then(setOptunaInstalled);
  }, [setOptunaInstalled]);

  // Show TuningPanel when a trainer node in tune mode is selected
  useEffect(() => {
    if (selectedNodeId) {
      const selectedNode = nodes.find((n) => n.id === selectedNodeId);
      if (selectedNode?.type === "trainer" && selectedNode.data.trainerMode === "tune") {
        setShowTuningPanel(true);
        setTuningPanelNodeId(selectedNodeId);
        return;
      }
    }
    // Close tuning panel if not a trainer in tune mode
    if (showTuningPanel && tuningPanelNodeId) {
      const tuningNode = nodes.find((n) => n.id === tuningPanelNodeId);
      if (!tuningNode || tuningNode.type !== "trainer" || tuningNode.data.trainerMode !== "tune") {
        setShowTuningPanel(false);
        setTuningPanelNodeId(null);
      }
    }
  }, [selectedNodeId, nodes, showTuningPanel, tuningPanelNodeId]);

  const handleStartTuning = useCallback(
    async (config: TuningConfig) => {
      if (!tuningPanelNodeId) return;

      const trainerNode = nodes.find((n) => n.id === tuningPanelNodeId);
      if (!trainerNode) return;

      // Find input path
      const dataSplitNode = nodes.find((n) => n.type === "dataSplit");
      const useDataSplit =
        dataSplitNode &&
        edges.some((e) => e.source === dataSplitNode.id && e.target === trainerNode.id);

      let inputPath: string | undefined;

      if (useDataSplit && dataSplitNode) {
        const dsEdge = edges.find((e) => e.target === dataSplitNode.id);
        const dataLoaderNode = nodes.find((n) => n.id === dsEdge?.source);
        inputPath = dataLoaderNode?.data.filePath;
      } else {
        const edge = edges.find((e) => e.target === trainerNode.id);
        const dataLoaderNode = nodes.find((n) => n.id === edge?.source);
        inputPath = dataLoaderNode?.data.filePath;
      }

      if (!inputPath) {
        appendLog("ERROR: No input file selected");
        return;
      }

      // Clear previous state
      clearLogs();
      clearTuningTrials();
      setTuningNodeId(tuningPanelNodeId);
      setTuningStatus("running");
      setExecutionStatus("running");

      const pipelineName = currentPipelineName || "Untitled";
      const startTime = Date.now();
      let runId: string | null = null;
      let sessionId: string | null = null;

      try {
        // Create run record
        runId = await createRun(pipelineName, {
          tuning: true,
          sampler: config.sampler,
          nTrials: config.nTrials,
          cvFolds: config.cvFolds,
          scoringMetric: config.scoringMetric,
          modelType: trainerNode.data.modelType,
        });

        // Create tuning session
        sessionId = await createTuningSession(
          runId,
          config.sampler,
          JSON.stringify(config.searchSpace),
          config.sampler === "grid" ? null : config.nTrials,
          config.cvFolds,
          config.scoringMetric
        );
        setTuningSessionId(sessionId);

        const collectedMetrics: MetricInput[] = [];

        const handleOutput = async (event: ScriptEvent) => {
          if (event.type === "log") {
            appendLog(event.message);
          } else if (event.type === "error") {
            appendLog(`ERROR: ${event.message}`);
          } else if (event.type === "trial") {
            // Add trial to UI
            addTuningTrial({
              trialNumber: event.trialNumber,
              params: event.params,
              score: event.score,
              durationMs: event.durationMs,
              status: "completed",
            });

            // Save to database
            if (sessionId) {
              await saveTuningTrial(
                sessionId,
                event.trialNumber,
                JSON.stringify(event.params),
                event.score,
                event.durationMs
              );
            }
          } else if (event.type === "tuningComplete") {
            collectedMetrics.push({
              name: "best_params",
              valueJson: JSON.stringify(event.bestParams),
            });
            collectedMetrics.push({
              name: "best_score",
              value: event.bestScore,
            });
            collectedMetrics.push({
              name: "total_trials",
              value: event.totalTrials,
            });
          }
        };

        // Run data split if needed
        if (useDataSplit && dataSplitNode) {
          appendLog("--- Running Data Split ---");
          appendLog(`Split ratio: ${((dataSplitNode.data.splitRatio || 0.2) * 100).toFixed(0)}%`);
          appendLog("");

          const splitCode = generateDataSplitCode(dataSplitNode.data, inputPath);
          await runScriptAndWait(splitCode, inputPath, handleOutput);
        }

        // Run tuning
        appendLog("");
        appendLog("--- Running Hyperparameter Tuning ---");
        appendLog(`Model: ${trainerNode.data.modelType || "random_forest"}`);
        appendLog(`Target: ${trainerNode.data.targetColumn || "target"}`);
        appendLog(`Sampler: ${config.sampler}`);
        appendLog(`Metric: ${config.scoringMetric}`);
        appendLog("");

        let tuningCode;
        if (useDataSplit) {
          tuningCode = generateTuningCodeWithSplit(trainerNode.data, inputPath, config);
        } else {
          tuningCode = generateTuningCode(trainerNode.data, inputPath, config);
        }

        await runScriptAndWait(tuningCode, inputPath, handleOutput);

        // Complete session and run
        const duration = Date.now() - startTime;

        if (sessionId) {
          await completeTuningSession(sessionId);
        }

        if (runId && collectedMetrics.length > 0) {
          await saveRunMetrics(runId, collectedMetrics);
        }

        if (runId) {
          await completeRun(runId, duration);
        }

        setTuningStatus("completed");
        setExecutionStatus("success");

        appendLog("");
        appendLog(`Tuning completed in ${(duration / 1000).toFixed(1)}s`);
      } catch (error) {
        appendLog(`ERROR: ${String(error)}`);
        setTuningStatus("error");
        setExecutionStatus("error");

        if (runId) {
          await failRun(runId, String(error));
        }
      } finally {
        setTuningNodeId(null);
        await loadRunHistory(pipelineName);
      }
    },
    [
      tuningPanelNodeId,
      nodes,
      edges,
      currentPipelineName,
      appendLog,
      clearLogs,
      clearTuningTrials,
      setTuningNodeId,
      setTuningStatus,
      addTuningTrial,
      setTuningSessionId,
      setExecutionStatus,
      loadRunHistory,
    ]
  );

  const handleCloseTuningPanel = useCallback(() => {
    setShowTuningPanel(false);
    setTuningPanelNodeId(null);
  }, []);

  // Handle explain run
  const handleExplainRun = useCallback(
    async (runId: string) => {
      // Clear previous explain state and set up new run
      setExplainRunId(runId);
      setExplainStatus("running");
      setExplainProgress(null);

      // Initialize empty explain data structure - we'll determine type when we get metadata
      let explainMetadata: ExplainMetadataData | null = null;
      let featureImportance: FeatureImportanceData | null = null;
      let shapData: RegressionShapData | ClassificationShapData | null = null;
      const pdpData: (RegressionPDPData | ClassificationPDPData)[] = [];

      const collectedMetrics: MetricInput[] = [];

      appendLog("");
      appendLog("--- Running Model Explainability Analysis ---");
      appendLog(`Run ID: ${runId}`);
      appendLog("");

      try {
        const explainerCode = generateExplainerCode();

        const handleOutput = (event: ScriptEvent) => {
          if (event.type === "log") {
            appendLog(event.message);
          } else if (event.type === "error") {
            appendLog(`ERROR: ${event.message}`);
          } else if (event.type === "explainProgress") {
            setExplainProgress(event.data);
          } else if (event.type === "featureImportance") {
            featureImportance = event.data;
            collectedMetrics.push({
              name: "explain_feature_importance",
              valueJson: JSON.stringify(event.data),
            });
          } else if (event.type === "shapData") {
            shapData = event.data;
            collectedMetrics.push({
              name: "explain_shap",
              valueJson: JSON.stringify(event.data),
            });
          } else if (event.type === "partialDependence") {
            pdpData.push(event.data);
          } else if (event.type === "explainMetadata") {
            explainMetadata = event.data;
            collectedMetrics.push({
              name: "explain_metadata",
              valueJson: JSON.stringify(event.data),
            });
          } else if (event.type === "explainComplete") {
            appendLog("");
            appendLog(`Explainability analysis completed in ${(event.durationMs / 1000).toFixed(1)}s`);
          }
        };

        await runScriptAndWait(explainerCode, "", handleOutput);

        // Save PDP data
        if (pdpData.length > 0) {
          collectedMetrics.push({
            name: "explain_pdp",
            valueJson: JSON.stringify(pdpData),
          });
        }

        // Save metrics to database
        if (collectedMetrics.length > 0) {
          await saveRunMetrics(runId, collectedMetrics);
        }

        // Build and set explain data
        if (featureImportance) {
          const meta = explainMetadata as ExplainMetadataData | null;
          const isClassifier = meta?.isClassifier ?? (shapData ? isClassificationShapData(shapData) : false);
          const modelType = meta?.modelType || "unknown";
          const nSamples = meta?.nSamples || 0;
          const nFeatures = meta?.nFeatures || 0;
          const shapExplainerUsed = meta?.shapExplainer;
          const metaClassNames = meta?.classNames;

          // Cast shapData to avoid closure-related type narrowing issues
          const currentShapData = shapData as RegressionShapData | ClassificationShapData | null;

          // Extract classNames from shapData if it's classification type
          const shapClassNames = currentShapData && isClassificationShapData(currentShapData)
            ? currentShapData.classNames
            : undefined;

          let explainData: ExplainData;
          if (isClassifier) {
            const classShapData: ClassificationShapData | undefined =
              currentShapData && isClassificationShapData(currentShapData) ? currentShapData : undefined;
            const classNames = metaClassNames || shapClassNames || [];
            explainData = {
              type: "classification",
              modelType,
              classNames,
              featureImportance,
              shap: classShapData,
              pdp: pdpData.length > 0 ? pdpData as ClassificationPDPData[] : undefined,
              metadata: {
                runId,
                timestamp: new Date().toISOString(),
                nSamples,
                nFeatures,
                shapExplainer: shapExplainerUsed,
              },
            };
          } else {
            const regShapData: RegressionShapData | undefined =
              currentShapData && !isClassificationShapData(currentShapData) ? currentShapData : undefined;
            explainData = {
              type: "regression",
              modelType,
              featureImportance,
              shap: regShapData,
              pdp: pdpData.length > 0 ? pdpData as RegressionPDPData[] : undefined,
              metadata: {
                runId,
                timestamp: new Date().toISOString(),
                nSamples,
                nFeatures,
                shapExplainer: shapExplainerUsed,
              },
            };
          }

          setExplainData(runId, explainData);
        }

        setExplainStatus("completed");
      } catch (error) {
        appendLog(`ERROR: ${String(error)}`);
        setExplainStatus("error");
      } finally {
        setExplainRunId(null);
        setExplainProgress(null);
      }
    },
    [
      appendLog,
      setExplainRunId,
      setExplainStatus,
      setExplainProgress,
      setExplainData,
    ]
  );

  // Check if tuning can start (mutual exclusion)
  const canStartTuning = executionStatus !== "running" && !profilingNodeId && !explainRunId;

  // Check if explain can start (mutual exclusion)
  const canExplain = executionStatus !== "running" && !profilingNodeId && !explainRunId;

  // Keyboard shortcuts for panel toggles
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in input fields
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      // Ctrl/Cmd + B: Toggle node palette (like VS Code sidebar)
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        setShowNodePalette((prev) => !prev);
      }

      // Ctrl/Cmd + J: Toggle output panel (like VS Code terminal)
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        setShowOutputPanel((prev) => !prev);
      }

      // Ctrl/Cmd + Shift + P: Toggle playground panel
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "P") {
        e.preventDefault();
        if (playgroundOpen) {
          closePlayground();
        } else {
          openPlayground();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [playgroundOpen, openPlayground, closePlayground]);

  const toggleNodePalette = useCallback(() => {
    setShowNodePalette((prev) => !prev);
  }, []);

  const toggleOutputPanel = useCallback(() => {
    setShowOutputPanel((prev) => !prev);
  }, []);

  const togglePlayground = useCallback(() => {
    if (playgroundOpen) {
      closePlayground();
    } else {
      openPlayground();
    }
  }, [playgroundOpen, openPlayground, closePlayground]);

  return (
    <ReactFlowProvider>
      <div className="flex flex-col h-screen bg-background text-text-primary">
        <Toolbar
          showNodePalette={showNodePalette}
          showOutputPanel={showOutputPanel}
          showPlayground={playgroundOpen}
          onToggleNodePalette={toggleNodePalette}
          onToggleOutputPanel={toggleOutputPanel}
          onTogglePlayground={togglePlayground}
        />

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Node Palette - collapsible */}
          <div
            className={cn(
              "transition-all duration-200 ease-out overflow-hidden",
              showNodePalette ? "w-56" : "w-0"
            )}
          >
            {showNodePalette && <NodePalette onCollapse={toggleNodePalette} />}
          </div>

          {/* Collapsed tab for NodePalette */}
          {!showNodePalette && (
            <button
              onClick={toggleNodePalette}
              className={cn(
                "flex items-center justify-center w-6",
                "panel-sidebar border-r border-white/5",
                "hover:bg-background-elevated transition-colors",
                "text-text-muted hover:text-text-primary"
              )}
              title="Show Components Panel (Ctrl+B)"
            >
              <RiLayoutLeftLine className="w-4 h-4" />
            </button>
          )}

          <div className="flex-1 relative">
            <Canvas />
          </div>

          <PropertiesPanel />
          <PlaygroundPanel />

          {/* Tuning Panel - shows when trainer in tune mode is selected */}
          {showTuningPanel && tuningPanelNodeId && canStartTuning && (
            <TuningPanel
              nodeId={tuningPanelNodeId}
              onStartTuning={handleStartTuning}
              onClose={handleCloseTuningPanel}
            />
          )}
        </div>

        {/* Output Panel - collapsible */}
        {showOutputPanel && (
          <OutputPanel
            onCollapse={toggleOutputPanel}
            onExplainRun={handleExplainRun}
            canExplain={canExplain}
          />
        )}

        {/* Collapsed tab for OutputPanel */}
        {!showOutputPanel && (
          <button
            onClick={toggleOutputPanel}
            className={cn(
              "flex items-center justify-center gap-2 h-7 px-3",
              "panel-footer border-t border-white/5",
              "hover:bg-background-elevated transition-colors",
              "text-text-muted hover:text-text-primary text-xs"
            )}
            title="Show Output Panel (Ctrl+J)"
          >
            <RiTerminalBoxLine className="w-4 h-4" />
            <span>Output</span>
          </button>
        )}
      </div>
    </ReactFlowProvider>
  );
}

export default App;
