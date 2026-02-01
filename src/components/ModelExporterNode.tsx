import { useCallback } from "react";
import { NodeProps } from "@xyflow/react";
import { usePipelineStore, NodeData } from "../stores/pipelineStore";
import { BaseNode, NodeLabel, NodeInput, NodeSelect } from "./BaseNode";
import { RiBox3Line } from "@remixicon/react";

const formatOptions = [
  { value: "joblib", label: "joblib (.joblib)" },
  { value: "pickle", label: "pickle (.pkl)" },
  { value: "onnx", label: "ONNX (.onnx)" },
];

export function ModelExporterNode({ id, data, selected }: NodeProps) {
  const nodeData = data as NodeData;
  const updateNodeData = usePipelineStore((s) => s.updateNodeData);
  const executionStatus = usePipelineStore((s) => s.executionStatus);

  const handleFormatChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateNodeData(id, { exportFormat: e.target.value });
    },
    [id, updateNodeData]
  );

  const handleOutputNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, { outputFileName: e.target.value });
    },
    [id, updateNodeData]
  );

  return (
    <BaseNode
      variant="exporter"
      title="Model Exporter"
      icon={RiBox3Line}
      isRunning={executionStatus === "running"}
      isSelected={selected}
      hasInput
      minWidth={200}
    >
      <div>
        <NodeLabel>Format</NodeLabel>
        <NodeSelect
          options={formatOptions}
          value={nodeData.exportFormat || "joblib"}
          onChange={handleFormatChange}
        />
      </div>

      <div>
        <NodeLabel>Output Name</NodeLabel>
        <NodeInput
          type="text"
          placeholder="model_export"
          value={nodeData.outputFileName || ""}
          onChange={handleOutputNameChange}
        />
      </div>
    </BaseNode>
  );
}
