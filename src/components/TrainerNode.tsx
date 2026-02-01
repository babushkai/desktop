import { useCallback } from "react";
import { NodeProps } from "@xyflow/react";
import { usePipelineStore, NodeData } from "../stores/pipelineStore";
import { BaseNode, NodeLabel, NodeInput, NodeSlider, NodeSelect } from "./BaseNode";
import { RiBrainLine } from "@remixicon/react";

const modelOptions = [
  { value: "linear_regression", label: "Linear Regression" },
  { value: "random_forest", label: "Random Forest" },
  { value: "gradient_boosting", label: "Gradient Boosting" },
];

export function TrainerNode({ id, data, selected }: NodeProps) {
  const nodeData = data as NodeData;
  const updateNodeData = usePipelineStore((s) => s.updateNodeData);
  const executionStatus = usePipelineStore((s) => s.executionStatus);

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

  return (
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
        <NodeLabel>Model</NodeLabel>
        <NodeSelect
          options={modelOptions}
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
    </BaseNode>
  );
}
