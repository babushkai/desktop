import { Handle, Position, NodeProps } from "@xyflow/react";
import { usePipelineStore } from "../stores/pipelineStore";

export function EvaluatorNode(_props: NodeProps) {
  const executionStatus = usePipelineStore((s) => s.executionStatus);

  const borderColor =
    executionStatus === "running"
      ? "#fbbf24"
      : executionStatus === "success"
      ? "#4ade80"
      : executionStatus === "error"
      ? "#ef4444"
      : "#fb923c";

  return (
    <div
      style={{
        backgroundColor: "#c2410c",
        border: `2px solid ${borderColor}`,
        borderRadius: 8,
        padding: 12,
        minWidth: 180,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          width: 12,
          height: 12,
          backgroundColor: "#fb923c",
          border: "2px solid #c2410c",
        }}
      />

      <div
        style={{
          fontSize: 12,
          color: "#fb923c",
          marginBottom: 8,
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        Evaluator
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

      <div
        style={{
          fontSize: 10,
          color: "#fed7aa",
        }}
      >
        Auto-detects model type and displays metrics
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
