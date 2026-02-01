import { Handle, Position, NodeProps } from "@xyflow/react";
import { usePipelineStore, NodeData } from "../stores/pipelineStore";

export function DataSplitNode({ id, data }: NodeProps) {
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
      : "#f472b6";

  return (
    <div
      style={{
        backgroundColor: "#831843",
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
          backgroundColor: "#f472b6",
          border: "2px solid #831843",
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: 12,
          height: 12,
          backgroundColor: "#f472b6",
          border: "2px solid #831843",
        }}
      />

      <div
        style={{
          fontSize: 12,
          color: "#f472b6",
          marginBottom: 12,
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        Data Split
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

      {/* Test Split Slider */}
      <div style={{ marginBottom: 8 }}>
        <label
          style={{
            fontSize: 10,
            color: "#9ca3af",
            display: "block",
            marginBottom: 4,
          }}
        >
          Test Split: {((nodeData.splitRatio || 0.2) * 100).toFixed(0)}%
        </label>
        <input
          type="range"
          min="0.1"
          max="0.5"
          step="0.05"
          value={nodeData.splitRatio || 0.2}
          onChange={(e) =>
            updateNodeData(id, { splitRatio: parseFloat(e.target.value) })
          }
          className="nodrag"
          style={{ width: "100%" }}
        />
      </div>

      {/* Random State Input */}
      <div style={{ marginBottom: 8 }}>
        <label
          style={{
            fontSize: 10,
            color: "#9ca3af",
            display: "block",
            marginBottom: 4,
          }}
        >
          Random State
        </label>
        <input
          type="number"
          value={nodeData.randomState ?? 42}
          onChange={(e) =>
            updateNodeData(id, { randomState: parseInt(e.target.value) || 0 })
          }
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

      {/* Stratify Checkbox */}
      <div style={{ marginBottom: 8 }}>
        <label
          style={{
            fontSize: 10,
            color: "#9ca3af",
            display: "flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={nodeData.stratify || false}
            onChange={(e) => updateNodeData(id, { stratify: e.target.checked })}
            className="nodrag"
          />
          Stratify Split
        </label>
      </div>

      {/* Target Column for Stratification */}
      {nodeData.stratify && (
        <div>
          <label
            style={{
              fontSize: 10,
              color: "#9ca3af",
              display: "block",
              marginBottom: 4,
            }}
          >
            Stratify Column
          </label>
          <input
            type="text"
            placeholder="e.g. label"
            value={nodeData.splitTargetColumn || ""}
            onChange={(e) =>
              updateNodeData(id, { splitTargetColumn: e.target.value })
            }
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
      )}

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
