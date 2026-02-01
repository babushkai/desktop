import { Handle, Position, NodeProps } from "@xyflow/react";
import { usePipelineStore, NodeData } from "../stores/pipelineStore";

export function ModelExporterNode({ id, data }: NodeProps) {
  const nodeData = data as NodeData;
  const updateNodeData = usePipelineStore((s) => s.updateNodeData);
  const executionStatus = usePipelineStore((s) => s.executionStatus);

  const borderColor =
    executionStatus === "running"
      ? "#fbbf24"
      : executionStatus === "success"
      ? "#4ade80"
      : executionStatus === "error"
      ? "#ef4444"
      : "#5eead4";

  return (
    <div
      style={{
        backgroundColor: "#0d9488",
        border: `2px solid ${borderColor}`,
        borderRadius: 8,
        padding: 12,
        minWidth: 200,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          width: 12,
          height: 12,
          backgroundColor: "#5eead4",
          border: "2px solid #0d9488",
        }}
      />

      <div
        style={{
          fontSize: 12,
          color: "#5eead4",
          marginBottom: 12,
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        Model Exporter
        {executionStatus === "running" && (
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: "#fbbf24",
              animation: "pulse 1s infinite",
            }}
          />
        )}
      </div>

      {/* Export Format Dropdown */}
      <div style={{ marginBottom: 8 }}>
        <label
          style={{
            fontSize: 10,
            color: "#9ca3af",
            display: "block",
            marginBottom: 4,
          }}
        >
          Format
        </label>
        <select
          value={nodeData.exportFormat || "joblib"}
          onChange={(e) => updateNodeData(id, { exportFormat: e.target.value })}
          className="nodrag"
          style={{
            width: "100%",
            padding: "6px 8px",
            backgroundColor: "#1a1a2e",
            border: "1px solid #6b7280",
            borderRadius: 4,
            color: "#eee",
            fontSize: 12,
          }}
        >
          <option value="joblib">joblib (.joblib)</option>
          <option value="pickle">pickle (.pkl)</option>
          <option value="onnx">ONNX (.onnx)</option>
        </select>
      </div>

      {/* Output Filename */}
      <div>
        <label
          style={{
            fontSize: 10,
            color: "#9ca3af",
            display: "block",
            marginBottom: 4,
          }}
        >
          Output Name
        </label>
        <input
          type="text"
          placeholder="model_export"
          value={nodeData.outputFileName || ""}
          onChange={(e) => updateNodeData(id, { outputFileName: e.target.value })}
          className="nodrag"
          style={{
            width: "100%",
            padding: "6px 8px",
            backgroundColor: "#1a1a2e",
            border: "1px solid #6b7280",
            borderRadius: 4,
            color: "#eee",
            fontSize: 12,
            boxSizing: "border-box",
          }}
        />
      </div>

      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}
      </style>
    </div>
  );
}
