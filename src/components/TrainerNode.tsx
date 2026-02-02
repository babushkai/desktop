import { useCallback, useState, useMemo, Fragment } from "react";
import { NodeProps } from "@xyflow/react";
import { Dialog, Transition } from "@headlessui/react";
import { open } from "@tauri-apps/plugin-dialog";
import { usePipelineStore, NodeData } from "../stores/pipelineStore";
import {
  BaseNode,
  NodeLabel,
  NodeInput,
  NodeSlider,
  NodeSelectGrouped,
  NodeSelect,
  NodeButton,
  NodeText,
} from "./BaseNode";
import { RiBrainLine, RiFileLine, RiAlertLine } from "@remixicon/react";

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

const modeOptions = [
  { value: "train", label: "Train New" },
  { value: "load", label: "Load Existing" },
];

export function TrainerNode({ id, data, selected }: NodeProps) {
  const nodeData = data as NodeData;
  const updateNodeData = usePipelineStore((s) => s.updateNodeData);
  const executionStatus = usePipelineStore((s) => s.executionStatus);

  const [showWarning, setShowWarning] = useState(false);
  const [pendingModelPath, setPendingModelPath] = useState<string | null>(null);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleModeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateNodeData(id, { trainerMode: e.target.value as "train" | "load" });
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

  const handleSelectModel = useCallback(async () => {
    const selectedFile = await open({
      multiple: false,
      filters: [{ name: "Model Files", extensions: ["joblib", "pkl", "pickle"] }],
    });
    if (selectedFile && typeof selectedFile === "string") {
      const dismissed = localStorage.getItem("modelUploadWarningDismissed") === "true";
      if (dismissed) {
        updateNodeData(id, { modelPath: selectedFile });
      } else {
        setPendingModelPath(selectedFile);
        setShowWarning(true);
      }
    }
  }, [id, updateNodeData]);

  const handleConfirmLoad = useCallback(() => {
    if (dontShowAgain) {
      localStorage.setItem("modelUploadWarningDismissed", "true");
    }
    if (pendingModelPath) {
      updateNodeData(id, { modelPath: pendingModelPath });
    }
    setShowWarning(false);
    setPendingModelPath(null);
  }, [id, updateNodeData, pendingModelPath, dontShowAgain]);

  const handleCancelLoad = useCallback(() => {
    setShowWarning(false);
    setPendingModelPath(null);
    setDontShowAgain(false);
  }, []);

  const fileName = useMemo(() => {
    if (!nodeData.modelPath) return null;
    return nodeData.modelPath.split(/[/\\]/).pop();
  }, [nodeData.modelPath]);

  const isLoadMode = nodeData.trainerMode === "load";

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
        <div>
          <NodeLabel>Mode</NodeLabel>
          <NodeSelect
            options={modeOptions}
            value={nodeData.trainerMode || "train"}
            onChange={handleModeChange}
          />
        </div>

        {isLoadMode ? (
          <div>
            <NodeLabel>Model File</NodeLabel>
            <NodeButton onClick={handleSelectModel} className="flex items-center gap-2">
              <RiFileLine className="w-3.5 h-3.5" />
              {fileName || "Select model..."}
            </NodeButton>
            {nodeData.modelPath && (
              <NodeText className="truncate mt-1" title={nodeData.modelPath}>
                {nodeData.modelPath}
              </NodeText>
            )}
          </div>
        ) : (
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
        )}
      </BaseNode>

      <Transition appear show={showWarning} as={Fragment}>
        <Dialog onClose={handleCancelLoad} className="relative z-50">
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
                  <Dialog.Title className="text-lg font-semibold text-state-warning flex items-center gap-2">
                    <RiAlertLine className="w-5 h-5" />
                    Loading external model files
                  </Dialog.Title>
                  <p className="mt-3 text-sm text-text-secondary">
                    Model files (.joblib, .pkl) can execute code when loaded.
                    Only load models from sources you trust.
                  </p>
                  <label className="mt-4 flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dontShowAgain}
                      onChange={(e) => setDontShowAgain(e.target.checked)}
                      className="w-4 h-4 rounded bg-background border border-white/10 checked:bg-accent checked:border-accent focus:ring-1 focus:ring-accent focus:ring-offset-0"
                    />
                    Don't show this again
                  </label>
                  <div className="mt-5 flex justify-end gap-2">
                    <button onClick={handleCancelLoad} className="btn-secondary">
                      Cancel
                    </button>
                    <button onClick={handleConfirmLoad} className="btn-primary">
                      Load Anyway
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
