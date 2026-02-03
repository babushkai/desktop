import { useCallback, useState, Fragment } from "react";
import { NodeProps } from "@xyflow/react";
import { Dialog, Transition } from "@headlessui/react";
import { open } from "@tauri-apps/plugin-dialog";
import { usePipelineStore, NodeData, TrainerMode } from "../stores/pipelineStore";
import { BaseNode, NodeLabel, NodeInput, NodeSlider, NodeSelectGrouped, NodeButton, NodeText } from "./BaseNode";
import { RiBrainLine, RiFileLine, RiAlertLine, RiSettings3Line, RiLoader4Line, RiRefreshLine } from "@remixicon/react";
import { checkPythonPackage } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { canTune } from "@/lib/tuningValidation";

const modelGroups = [
  {
    label: "Regression",
    options: [
      { value: "linear_regression", label: "Linear Regression" },
      { value: "random_forest", label: "Random Forest" },
      { value: "gradient_boosting", label: "Gradient Boosting" },
      { value: "svr", label: "SVM (SVR)" },
      { value: "knn_regressor", label: "KNN" },
      { value: "mlp_regressor", label: "Neural Network (MLP)" },
    ],
  },
  {
    label: "Classification",
    options: [
      { value: "logistic_regression", label: "Logistic Regression" },
      { value: "random_forest_classifier", label: "Random Forest" },
      { value: "gradient_boosting_classifier", label: "Gradient Boosting" },
      { value: "svc", label: "SVM (SVC)" },
      { value: "knn_classifier", label: "KNN" },
      { value: "mlp_classifier", label: "Neural Network (MLP)" },
    ],
  },
];

export function TrainerNode({ id, data, selected }: NodeProps) {
  const nodeData = data as NodeData;
  const updateNodeData = usePipelineStore((s) => s.updateNodeData);
  const executionStatus = usePipelineStore((s) => s.executionStatus);
  const tuningNodeId = usePipelineStore((s) => s.tuningNodeId);
  const tuningStatus = usePipelineStore((s) => s.tuningStatus);
  const optunaInstalled = usePipelineStore((s) => s.optunaInstalled);
  const setOptunaInstalled = usePipelineStore((s) => s.setOptunaInstalled);
  const openProperties = usePipelineStore((s) => s.openProperties);
  const [showSecurityWarning, setShowSecurityWarning] = useState(false);
  const [checkingOptuna, setCheckingOptuna] = useState(false);

  const trainerMode = nodeData.trainerMode || "train";
  const isTuning = tuningNodeId === id;
  const { valid: canTuneValid, reason: cannotTuneReason } = canTune(nodeData);

  const handleModeChange = useCallback(
    (mode: TrainerMode) => {
      updateNodeData(id, { trainerMode: mode });
    },
    [id, updateNodeData]
  );

  const handleModelTypeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateNodeData(id, { modelType: e.target.value });
    },
    [id, updateNodeData]
  );

  const handleTargetColumnChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, { targetColumn: e.target.value });
    },
    [id, updateNodeData]
  );

  const handleTestSplitChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, { testSplit: parseFloat(e.target.value) });
    },
    [id, updateNodeData]
  );

  const handleSelectModelFile = useCallback(() => {
    setShowSecurityWarning(true);
  }, []);

  const handleConfirmFileSelect = useCallback(async () => {
    setShowSecurityWarning(false);
    const selectedFile = await open({
      multiple: false,
      filters: [
        {
          name: "Model Files",
          extensions: ["joblib", "pkl", "pickle"],
        },
      ],
    });

    if (selectedFile && typeof selectedFile === "string") {
      updateNodeData(id, { modelFilePath: selectedFile });
    }
  }, [id, updateNodeData]);

  const modelFileName = nodeData.modelFilePath?.split("/").pop();

  const handleCheckOptuna = useCallback(async () => {
    setCheckingOptuna(true);
    try {
      const installed = await checkPythonPackage("optuna");
      setOptunaInstalled(installed);
    } finally {
      setCheckingOptuna(false);
    }
  }, [setOptunaInstalled]);

  return (
    <>
      <BaseNode
        variant="trainer"
        title="Trainer"
        icon={RiBrainLine}
        isRunning={executionStatus === "running"}
        isSelected={selected}
        hasInput
        hasOutput
        minWidth={220}
      >
        {/* Mode Toggle */}
        <div className="flex gap-1 p-0.5 bg-background rounded-md">
          <button
            onClick={() => handleModeChange("train")}
            className={cn(
              "nodrag flex-1 px-2 py-1 text-xs rounded transition-colors",
              trainerMode === "train"
                ? "bg-violet-500/20 text-violet-300"
                : "text-text-muted hover:text-text-secondary"
            )}
          >
            Train
          </button>
          <button
            onClick={() => handleModeChange("load")}
            className={cn(
              "nodrag flex-1 px-2 py-1 text-xs rounded transition-colors",
              trainerMode === "load"
                ? "bg-violet-500/20 text-violet-300"
                : "text-text-muted hover:text-text-secondary"
            )}
          >
            Load
          </button>
          <button
            onClick={() => handleModeChange("tune")}
            disabled={!canTuneValid}
            title={cannotTuneReason || "Hyperparameter Tuning"}
            className={cn(
              "nodrag flex-1 px-2 py-1 text-xs rounded transition-colors",
              trainerMode === "tune"
                ? "bg-accent/20 text-accent"
                : "text-text-muted hover:text-text-secondary",
              !canTuneValid && "opacity-50 cursor-not-allowed"
            )}
          >
            Tune
          </button>
        </div>

        {trainerMode === "train" ? (
          <>
            <div>
              <NodeLabel>Model</NodeLabel>
              <NodeSelectGrouped
                groups={modelGroups}
                value={nodeData.modelType || "linear_regression"}
                onChange={handleModelTypeChange}
              />
            </div>

            <div>
              <NodeLabel>Target Column</NodeLabel>
              <NodeInput
                type="text"
                placeholder="e.g. price"
                value={nodeData.targetColumn || ""}
                onChange={handleTargetColumnChange}
              />
            </div>

            <div>
              <NodeLabel>
                Test Split: {((nodeData.testSplit || 0.2) * 100).toFixed(0)}%
              </NodeLabel>
              <NodeSlider
                min={0.1}
                max={0.5}
                step={0.05}
                value={nodeData.testSplit || 0.2}
                onChange={handleTestSplitChange}
              />
            </div>
          </>
        ) : (
          <>
            <NodeButton onClick={handleSelectModelFile} className="flex items-center gap-2">
              <RiFileLine className="w-3.5 h-3.5" />
              {modelFileName || "Select model file..."}
            </NodeButton>

            {nodeData.modelFilePath && (
              <NodeText className="truncate max-w-[180px]" title={nodeData.modelFilePath}>
                {nodeData.modelFilePath}
              </NodeText>
            )}

            <NodeText className="text-amber-400/80 text-[10px]">
              Supports .joblib, .pkl files
            </NodeText>
          </>
        )}

        {trainerMode === "tune" && (
          <>
            <div>
              <NodeLabel>Model</NodeLabel>
              <NodeSelectGrouped
                groups={modelGroups}
                value={nodeData.modelType || "random_forest"}
                onChange={handleModelTypeChange}
              />
            </div>

            <div>
              <NodeLabel>Target Column</NodeLabel>
              <NodeInput
                type="text"
                placeholder="e.g. price"
                value={nodeData.targetColumn || ""}
                onChange={handleTargetColumnChange}
              />
            </div>

            {isTuning ? (
              <div className="flex items-center gap-2 p-2 bg-accent/10 rounded-lg">
                <RiLoader4Line className="w-4 h-4 text-accent animate-spin" />
                <span className="text-xs text-accent">
                  {tuningStatus === "running" ? "Tuning in progress..." : "Preparing..."}
                </span>
              </div>
            ) : (
              <NodeButton
                onClick={() => openProperties(id)}
                className="flex items-center gap-2"
                disabled={!optunaInstalled && false}
              >
                <RiSettings3Line className="w-3.5 h-3.5" />
                Configure Tuning
              </NodeButton>
            )}

            {!optunaInstalled && (
              <div className="flex items-center gap-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <RiAlertLine className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <div className="flex-1">
                  <p className="text-[10px] text-amber-400">
                    Optuna required. Run: pip install optuna
                  </p>
                </div>
                <button
                  onClick={handleCheckOptuna}
                  disabled={checkingOptuna}
                  className="nodrag p-1 rounded hover:bg-amber-500/20 text-amber-400 transition-colors disabled:opacity-50"
                  title="Check again"
                >
                  {checkingOptuna ? (
                    <RiLoader4Line className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RiRefreshLine className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </BaseNode>

      {/* Security Warning Dialog */}
      <Transition appear show={showSecurityWarning} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setShowSecurityWarning(false)}>
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
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                      <RiAlertLine className="w-5 h-5 text-amber-400" />
                    </div>
                    <Dialog.Title className="text-lg font-semibold text-text-primary">
                      Security Warning
                    </Dialog.Title>
                  </div>

                  <div className="text-sm text-text-secondary mb-6 space-y-3">
                    <p>
                      <strong className="text-text-primary">Pickle files can execute arbitrary code.</strong>
                    </p>
                    <p>
                      Only load model files from sources you trust. Malicious pickle files
                      can compromise your system when loaded.
                    </p>
                    <p className="text-amber-400/80">
                      If you downloaded this model from an untrusted source, do not proceed.
                    </p>
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setShowSecurityWarning(false)}
                      className="btn-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirmFileSelect}
                      className="btn-primary bg-amber-600 hover:bg-amber-500"
                    >
                      I Trust This File
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </>
  );
}
