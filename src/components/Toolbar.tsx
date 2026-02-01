import { useEffect, useState } from "react";
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
} from "../lib/tauri";
import { generateTrainerCode, generateTrainerCodeWithSplit } from "../lib/trainerCodeGen";
import { generateEvaluatorCode, generateEvaluatorCodeWithSplit } from "../lib/evaluatorCodeGen";
import { generateExporterCode } from "../lib/exporterCodeGen";
import { generateDataSplitCode } from "../lib/dataSplitCodeGen";

export function Toolbar() {
  const {
    nodes,
    edges,
    executionStatus,
    pythonPath,
    setPythonPath: setStorePythonPath,
    setExecutionStatus,
    appendLog,
    clearLogs,
    validatePipeline,
    currentPipelineName,
    isDirty,
    savePipeline,
    loadPipeline,
    newPipeline,
  } = usePipelineStore();

  const [isEditingPath, setIsEditingPath] = useState(false);
  const [pathInput, setPathInput] = useState("");
  const [showPipelineMenu, setShowPipelineMenu] = useState(false);
  const [pipelines, setPipelines] = useState<PipelineMetadata[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveNameInput, setSaveNameInput] = useState("");

  // Load Python path on mount
  useEffect(() => {
    const loadPythonPath = async () => {
      let path = await getPythonPath();
      if (!path) {
        path = await findPython();
      }
      if (path) {
        setStorePythonPath(path);
        setPathInput(path);
      }
    };
    loadPythonPath();
  }, [setStorePythonPath]);

  const handleRun = async () => {
    // Validate pipeline first
    const errors = validatePipeline();
    if (errors.length > 0) {
      clearLogs();
      errors.forEach((e) => appendLog(`ERROR: ${e}`));
      return;
    }

    clearLogs();
    setExecutionStatus("running");

    // Find pipeline structure
    const trainerNode = nodes.find((n) => n.type === "trainer");
    const evaluatorNode = nodes.find((n) => n.type === "evaluator");
    const scriptNode = nodes.find((n) => n.type === "script");
    const dataSplitNode = nodes.find((n) => n.type === "dataSplit");

    // Detect if using DataSplit flow
    const useDataSplit =
      dataSplitNode &&
      trainerNode &&
      edges.some((e) => e.source === dataSplitNode.id && e.target === trainerNode.id);

    // Get DataLoader for input path
    // In DataSplit flow: DataLoader -> DataSplit -> Trainer
    // Otherwise: DataLoader -> Trainer/Script
    let inputPath: string | undefined;

    if (useDataSplit && dataSplitNode) {
      // Find DataLoader connected to DataSplit
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

    const handleOutput = (event: { type: string; message?: string; code?: number }) => {
      if (event.type === "log" && event.message) {
        appendLog(event.message);
      } else if (event.type === "error" && event.message) {
        appendLog(`ERROR: ${event.message}`);
      }
    };

    try {
      // Step 0: Run DataSplit (if present and connected to Trainer)
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

      // Step 1: Run Trainer or Script
      if (trainerNode) {
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
          // Use pre-computed indices from DataSplit
          trainerCode = generateTrainerCodeWithSplit(trainerNode.data, inputPath);
        } else {
          // Use internal split (backward compat)
          trainerCode = generateTrainerCode(trainerNode.data, inputPath);
        }
        await runScriptAndWait(trainerCode, inputPath, handleOutput);
      } else if (scriptNode) {
        appendLog("--- Running Script ---");
        appendLog(`Input: ${inputPath}`);
        appendLog("");

        await runScriptAndWait(scriptNode.data.code!, inputPath, handleOutput);
      }

      // Step 2: Run Evaluator (if connected to Trainer)
      if (evaluatorNode && trainerNode) {
        const evalEdge = edges.find((e) => e.target === evaluatorNode.id);
        if (evalEdge?.source === trainerNode.id) {
          appendLog("");
          appendLog("--- Running Evaluator ---");

          let evalCode;
          if (useDataSplit) {
            evalCode = generateEvaluatorCodeWithSplit(trainerNode.data, inputPath);
          } else {
            evalCode = generateEvaluatorCode(trainerNode.data, "model.joblib", inputPath);
          }
          await runScriptAndWait(evalCode, inputPath, handleOutput);
        }
      }

      // Step 3: Run ModelExporter (if present)
      const modelExporterNode = nodes.find((n) => n.type === "modelExporter");
      if (modelExporterNode) {
        const exportEdge = edges.find((e) => e.target === modelExporterNode.id);
        if (exportEdge) {
          // Valid sources: evaluator or trainer
          const sourceNode = nodes.find((n) => n.id === exportEdge.source);
          if (sourceNode?.type === "evaluator" || sourceNode?.type === "trainer") {
            appendLog("");
            appendLog("--- Running Model Exporter ---");

            const exportCode = generateExporterCode(modelExporterNode.data, "model.joblib");
            await runScriptAndWait(exportCode, inputPath, handleOutput);
          }
        }
      }

      setExecutionStatus("success");
    } catch (error) {
      appendLog(`ERROR: ${error}`);
      setExecutionStatus("error");
    }
  };

  const handleCancel = async () => {
    try {
      await cancelScript();
      appendLog("--- Script cancelled ---");
      setExecutionStatus("idle");
    } catch (error) {
      appendLog(`ERROR: ${error}`);
    }
  };

  const handleSavePythonPath = async () => {
    await setPythonPath(pathInput);
    setStorePythonPath(pathInput);
    setIsEditingPath(false);
  };

  const handleSave = async () => {
    if (currentPipelineName) {
      // Already has a name, save directly
      try {
        await savePipeline(currentPipelineName);
        appendLog(`Pipeline saved: ${currentPipelineName}`);
      } catch (error) {
        appendLog(`ERROR: Failed to save pipeline: ${error}`);
        console.error("Save error:", error);
      }
    } else {
      // Show save dialog for new pipeline
      setSaveNameInput("");
      setShowSaveDialog(true);
    }
  };

  const handleSaveConfirm = async () => {
    const name = saveNameInput.trim() || `Pipeline ${Date.now()}`;
    setShowSaveDialog(false);
    try {
      await savePipeline(name);
      appendLog(`Pipeline saved: ${name}`);
    } catch (error) {
      appendLog(`ERROR: Failed to save pipeline: ${error}`);
      console.error("Save error:", error);
    }
  };

  const handleLoadMenu = async () => {
    const list = await listPipelines();
    setPipelines(list);
    setShowPipelineMenu(true);
  };

  const handleLoadPipeline = async (id: string) => {
    if (isDirty) {
      const confirmed = window.confirm("Discard unsaved changes?");
      if (!confirmed) return;
    }
    await loadPipeline(id);
    setShowPipelineMenu(false);
  };

  const handleDeletePipeline = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = window.confirm("Delete this pipeline?");
    if (confirmed) {
      await deletePipeline(id);
      const list = await listPipelines();
      setPipelines(list);
    }
  };

  const handleNew = () => {
    if (isDirty) {
      const confirmed = window.confirm("Discard unsaved changes?");
      if (!confirmed) return;
    }
    newPipeline();
  };

  const hasExecutableNode = nodes.some(
    (n) => n.type === "script" || n.type === "trainer" || n.type === "evaluator"
  );
  const hasDataLoaderWithFile = nodes.some((n) => n.type === "dataLoader" && n.data.filePath);
  const isRunnable = hasExecutableNode && hasDataLoaderWithFile;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "12px 16px",
        backgroundColor: "#0f3460",
        borderBottom: "1px solid #394867",
      }}
    >
      <h1 style={{ fontSize: 18, fontWeight: 600 }}>
        MLOps Desktop
        {currentPipelineName && (
          <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 8 }}>
            — {currentPipelineName}{isDirty ? " *" : ""}
          </span>
        )}
        {!currentPipelineName && isDirty && (
          <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 8 }}>
            — Untitled *
          </span>
        )}
      </h1>

      {/* Pipeline buttons */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleNew}
          style={{
            padding: "6px 12px",
            backgroundColor: "#394867",
            color: "#eee",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          New
        </button>
        <button
          onClick={handleSave}
          style={{
            padding: "6px 12px",
            backgroundColor: "#394867",
            color: "#eee",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Save
        </button>
        <div style={{ position: "relative" }}>
          <button
            onClick={handleLoadMenu}
            style={{
              padding: "6px 12px",
              backgroundColor: "#394867",
              color: "#eee",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Load
          </button>
          {showPipelineMenu && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                marginTop: 4,
                backgroundColor: "#1a1a2e",
                border: "1px solid #394867",
                borderRadius: 4,
                minWidth: 200,
                maxHeight: 300,
                overflow: "auto",
                zIndex: 100,
              }}
            >
              {pipelines.length === 0 ? (
                <div style={{ padding: 12, color: "#9ca3af", fontSize: 12 }}>
                  No saved pipelines
                </div>
              ) : (
                pipelines.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => handleLoadPipeline(p.id)}
                    style={{
                      padding: "8px 12px",
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      borderBottom: "1px solid #394867",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#394867")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                  >
                    <span style={{ fontSize: 12 }}>{p.name}</span>
                    <button
                      onClick={(e) => handleDeletePipeline(p.id, e)}
                      style={{
                        padding: "2px 6px",
                        backgroundColor: "#ef4444",
                        color: "#fff",
                        border: "none",
                        borderRadius: 2,
                        cursor: "pointer",
                        fontSize: 10,
                      }}
                    >
                      Del
                    </button>
                  </div>
                ))
              )}
              <div
                onClick={() => setShowPipelineMenu(false)}
                style={{
                  padding: "8px 12px",
                  cursor: "pointer",
                  color: "#9ca3af",
                  fontSize: 11,
                  textAlign: "center",
                }}
              >
                Close
              </div>
            </div>
          )}
        </div>
        {/* Save Dialog */}
        {showSaveDialog && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 200,
            }}
            onClick={() => setShowSaveDialog(false)}
          >
            <div
              style={{
                backgroundColor: "#1a1a2e",
                padding: 20,
                borderRadius: 8,
                border: "1px solid #394867",
                minWidth: 300,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ marginBottom: 12, fontWeight: 500 }}>Save Pipeline</div>
              <input
                type="text"
                value={saveNameInput}
                onChange={(e) => setSaveNameInput(e.target.value)}
                placeholder="Enter pipeline name..."
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleSaveConfirm()}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  backgroundColor: "#0f0f23",
                  border: "1px solid #394867",
                  borderRadius: 4,
                  color: "#eee",
                  fontSize: 14,
                  marginBottom: 12,
                }}
              />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  onClick={() => setShowSaveDialog(false)}
                  style={{
                    padding: "6px 12px",
                    backgroundColor: "#394867",
                    color: "#eee",
                    border: "none",
                    borderRadius: 4,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveConfirm}
                  style={{
                    padding: "6px 12px",
                    backgroundColor: "#4ade80",
                    color: "#1a1a2e",
                    border: "none",
                    borderRadius: 4,
                    cursor: "pointer",
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ flex: 1 }} />

      {/* Python path display/edit */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, color: "#9ca3af" }}>Python:</span>
        {isEditingPath ? (
          <>
            <input
              type="text"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              style={{
                padding: "4px 8px",
                backgroundColor: "#1a1a2e",
                border: "1px solid #394867",
                borderRadius: 4,
                color: "#eee",
                fontSize: 12,
                width: 300,
              }}
            />
            <button
              onClick={handleSavePythonPath}
              style={{
                padding: "4px 8px",
                backgroundColor: "#4ade80",
                color: "#1a1a2e",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Save
            </button>
            <button
              onClick={() => setIsEditingPath(false)}
              style={{
                padding: "4px 8px",
                backgroundColor: "#6b7280",
                color: "#eee",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <span style={{ fontSize: 12, color: "#eee", fontFamily: "monospace" }}>
              {pythonPath || "Not found"}
            </span>
            <button
              onClick={() => setIsEditingPath(true)}
              style={{
                padding: "4px 8px",
                backgroundColor: "#394867",
                color: "#eee",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Change
            </button>
          </>
        )}
      </div>

      <div style={{ width: 1, height: 24, backgroundColor: "#394867" }} />

      {/* Run/Cancel buttons */}
      {executionStatus === "running" ? (
        <button
          onClick={handleCancel}
          style={{
            padding: "8px 16px",
            backgroundColor: "#ef4444",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          Cancel
        </button>
      ) : (
        <button
          onClick={handleRun}
          disabled={!isRunnable}
          style={{
            padding: "8px 16px",
            backgroundColor: isRunnable ? "#4ade80" : "#394867",
            color: isRunnable ? "#1a1a2e" : "#6b7280",
            border: "none",
            borderRadius: 6,
            cursor: isRunnable ? "pointer" : "not-allowed",
            fontWeight: 500,
          }}
        >
          Run
        </button>
      )}

      {/* Status indicator */}
      <div
        style={{
          width: 12,
          height: 12,
          borderRadius: "50%",
          backgroundColor:
            executionStatus === "running"
              ? "#fbbf24"
              : executionStatus === "success"
              ? "#4ade80"
              : executionStatus === "error"
              ? "#ef4444"
              : "#6b7280",
        }}
      />
    </div>
  );
}
