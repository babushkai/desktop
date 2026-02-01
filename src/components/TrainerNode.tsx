import { Handle, Position, NodeProps } from "@xyflow/react";
import { usePipelineStore, NodeData } from "../stores/pipelineStore";

export function TrainerNode({ id, data }: NodeProps) {
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
      : "#a78bfa";

  return (
    <div
      style={{
        backgroundColor: "#4c1d95",
        border: `2px solid ${borderColor}`,
        borderRadius: 8,
        padding: 12,
        minWidth: 220,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          width: 12,
          height: 12,
          backgroundColor: "#a78bfa",
          border: "2px solid #4c1d95",
        }}
      />

      <div
        style={{
          fontSize: 12,
          color: "#a78bfa",
          marginBottom: 12,
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        Trainer
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

      {/* Model Type Dropdown */}
      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 10, color: "#9ca3af", display: "block", marginBottom: 4 }}>
          Model
        </label>
        <select
          value={nodeData.modelType || "linear_regression"}
          onChange={(e) => updateNodeData(id, { modelType: e.target.value })}
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
          <option value="linear_regression">Linear Regression</option>
          <option value="random_forest">Random Forest</option>
          <option value="gradient_boosting">Gradient Boosting</option>
        </select>
      </div>

      {/* Target Column Input */}
      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 10, color: "#9ca3af", display: "block", marginBottom: 4 }}>
          Target Column
        </label>
        <input
          type="text"
          placeholder="e.g. price"
          value={nodeData.targetColumn || ""}
          onChange={(e) => updateNodeData(id, { targetColumn: e.target.value })}
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

      {/* Test Split Slider */}
      <div>
        <label style={{ fontSize: 10, color: "#9ca3af", display: "block", marginBottom: 4 }}>
          Test Split: {((nodeData.testSplit || 0.2) * 100).toFixed(0)}%
        </label>
        <input
          type="range"
          min="0.1"
          max="0.5"
          step="0.05"
          value={nodeData.testSplit || 0.2}
          onChange={(e) => updateNodeData(id, { testSplit: parseFloat(e.target.value) })}
          className="nodrag"
          style={{ width: "100%" }}
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
