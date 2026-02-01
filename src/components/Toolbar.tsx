import { useEffect, useState } from "react";
import { Play, Square, ChevronDown, Trash2, FileIcon, FolderOpen, Save, Plus } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function Toolbar() {
  // Rule: rerender-derived-state - Single shallow selector
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
  } = usePipelineStore(
    useShallow((s) => ({
      nodes: s.nodes,
      edges: s.edges,
      executionStatus: s.executionStatus,
      pythonPath: s.pythonPath,
      setPythonPath: s.setPythonPath,
      setExecutionStatus: s.setExecutionStatus,
      appendLog: s.appendLog,
      clearLogs: s.clearLogs,
      validatePipeline: s.validatePipeline,
      currentPipelineName: s.currentPipelineName,
      isDirty: s.isDirty,
      savePipeline: s.savePipeline,
      loadPipeline: s.loadPipeline,
      newPipeline: s.newPipeline,
    }))
  );

  const [isEditingPath, setIsEditingPath] = useState(false);
  const [pathInput, setPathInput] = useState("");
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
  };

  const handleLoadPipeline = async (id: string) => {
    if (isDirty) {
      const confirmed = window.confirm("Discard unsaved changes?");
      if (!confirmed) return;
    }
    await loadPipeline(id);
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
    <div className="flex items-center gap-4 px-4 py-3 glass-subtle border-b border-white/[0.08]">
      {/* Title and pipeline name */}
      <h1 className="text-lg font-semibold tracking-tight">
        MLOps Desktop
        {currentPipelineName && (
          <span className="font-normal text-slate-400 ml-2">
            — {currentPipelineName}{isDirty ? " *" : ""}
          </span>
        )}
        {!currentPipelineName && isDirty && (
          <span className="font-normal text-slate-400 ml-2">
            — Untitled *
          </span>
        )}
      </h1>

      {/* Pipeline buttons */}
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleNew}
          className="transition-button hover:-translate-y-px active:translate-y-0"
        >
          <Plus className="h-4 w-4 mr-1" />
          New
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleSave}
          className="transition-button hover:-translate-y-px active:translate-y-0"
        >
          <Save className="h-4 w-4 mr-1" />
          Save
        </Button>
        <DropdownMenu onOpenChange={(open) => open && handleLoadMenu()}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              className="transition-button hover:-translate-y-px active:translate-y-0"
            >
              <FolderOpen className="h-4 w-4 mr-1" />
              Load
              <ChevronDown className="h-3 w-3 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[200px]">
            {pipelines.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-400">No saved pipelines</div>
            ) : (
              pipelines.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  className="flex items-center justify-between"
                  onClick={() => handleLoadPipeline(p.id)}
                >
                  <span className="flex items-center gap-2">
                    <FileIcon className="h-4 w-4" />
                    {p.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-red-400 hover:text-red-300 hover:bg-red-900/30"
                    onClick={(e) => handleDeletePipeline(p.id, e)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Save Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Pipeline</DialogTitle>
          </DialogHeader>
          <Input
            value={saveNameInput}
            onChange={(e) => setSaveNameInput(e.target.value)}
            placeholder="Enter pipeline name..."
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleSaveConfirm()}
          />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveConfirm}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex-1" />

      {/* Python path display/edit */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400">Python:</span>
        {isEditingPath ? (
          <>
            <Input
              type="text"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              className="h-7 w-[300px] text-xs"
            />
            <Button size="sm" onClick={handleSavePythonPath}>
              Save
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setIsEditingPath(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <span className="text-xs font-mono text-slate-200">
              {pythonPath || "Not found"}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsEditingPath(true)}
              className="transition-button hover:-translate-y-px active:translate-y-0"
            >
              Change
            </Button>
          </>
        )}
      </div>

      <div className="w-px h-6 bg-white/[0.08]" />

      {/* Run/Cancel buttons */}
      {executionStatus === "running" ? (
        <Button
          variant="destructive"
          onClick={handleCancel}
          className="transition-button hover:-translate-y-px active:translate-y-0"
        >
          <Square className="h-4 w-4 mr-2" />
          Cancel
        </Button>
      ) : (
        <Button
          onClick={handleRun}
          disabled={!isRunnable}
          className={cn(
            "transition-button hover:-translate-y-px active:translate-y-0",
            isRunnable
              ? "bg-emerald-600 hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-500/25 text-white"
              : "bg-slate-700 text-slate-500"
          )}
        >
          <Play className="h-4 w-4 mr-2" />
          Run
        </Button>
      )}

      {/* Status indicator */}
      <div
        className={cn(
          "w-2.5 h-2.5 rounded-full transition-button",
          executionStatus === "running" && "bg-amber-500 shadow-lg shadow-amber-500/50",
          executionStatus === "success" && "bg-emerald-500 shadow-lg shadow-emerald-500/50",
          executionStatus === "error" && "bg-red-500 shadow-lg shadow-red-500/50",
          executionStatus === "idle" && "bg-slate-500"
        )}
      />
    </div>
  );
}
