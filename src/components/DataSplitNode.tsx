import { useCallback } from "react";
import { NodeProps } from "@xyflow/react";
import { usePipelineStore, NodeData } from "../stores/pipelineStore";
import { BaseNode, NodeLabel, NodeInput, NodeSlider, NodeCheckbox } from "./BaseNode";
import { RiScissorsCutLine } from "@remixicon/react";

export function DataSplitNode({ id, data, selected }: NodeProps) {
  const nodeData = data as NodeData;
  const updateNodeData = usePipelineStore((s) => s.updateNodeData);
  const executionStatus = usePipelineStore((s) => s.executionStatus);

  const handleSplitRatioChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, { splitRatio: parseFloat(e.target.value) });
    },
    [id, updateNodeData]
  );

  const handleRandomStateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, { randomState: parseInt(e.target.value) || 0 });
    },
    [id, updateNodeData]
  );

  const handleStratifyChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, { stratify: e.target.checked });
    },
    [id, updateNodeData]
  );

  const handleStratifyColumnChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, { splitTargetColumn: e.target.value });
    },
    [id, updateNodeData]
  );

  return (
    <BaseNode
      variant="datasplit"
      title="Data Split"
      icon={RiScissorsCutLine}
      isRunning={executionStatus === "running"}
      isSelected={selected}
      hasInput
      hasOutput
      minWidth={220}
    >
      <div>
        <NodeLabel>
          Test Split: {((nodeData.splitRatio || 0.2) * 100).toFixed(0)}%
        </NodeLabel>
        <NodeSlider
          min={0.1}
          max={0.5}
          step={0.05}
          value={nodeData.splitRatio || 0.2}
          onChange={handleSplitRatioChange}
        />
      </div>

      <div>
        <NodeLabel>Random State</NodeLabel>
        <NodeInput
          type="number"
          value={nodeData.randomState ?? 42}
          onChange={handleRandomStateChange}
        />
      </div>

      <NodeCheckbox
        label="Stratify Split"
        checked={nodeData.stratify || false}
        onChange={handleStratifyChange}
      />

      {nodeData.stratify && (
        <div>
          <NodeLabel>Stratify Column</NodeLabel>
          <NodeInput
            type="text"
            placeholder="e.g. label"
            value={nodeData.splitTargetColumn || ""}
            onChange={handleStratifyColumnChange}
          />
        </div>
      )}
    </BaseNode>
  );
}
