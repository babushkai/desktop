import { Handle, Position, NodeProps } from "@xyflow/react";
import Editor from "@monaco-editor/react";
import { usePipelineStore, NodeData } from "../stores/pipelineStore";

export function ScriptNode({ id, data }: NodeProps) {
  const nodeData = data as NodeData;
  const updateNodeData = usePipelineStore((state) => state.updateNodeData);
  const executionStatus = usePipelineStore((state) => state.executionStatus);

  const handleCodeChange = (value: string | undefined) => {
    updateNodeData(id, { code: value || "" });
  };

  const borderColor =
    executionStatus === "running"
      ? "#fbbf24"
      : executionStatus === "success"
      ? "#4ade80"
      : executionStatus === "error"
      ? "#ef4444"
      : "#60a5fa";

  return (
    <div
      style={{
        backgroundColor: "#1e3a5f",
        border: `2px solid ${borderColor}`,
        borderRadius: 8,
        padding: 12,
        minWidth: 300,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          width: 12,
          height: 12,
          backgroundColor: "#60a5fa",
          border: "2px solid #1e3a5f",
        }}
      />

      <div
        style={{
          fontSize: 12,
          color: "#60a5fa",
          marginBottom: 8,
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        📜 Script
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

      <div className="nodrag" style={{ border: "1px solid #394867", borderRadius: 4 }}>
        <Editor
          height="150px"
          language="python"
          theme="vs-dark"
          value={nodeData.code || ""}
          onChange={handleCodeChange}
          options={{
            minimap: { enabled: false },
            fontSize: 12,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 8 },
          }}
        />
      </div>

      <div
        style={{
          marginTop: 8,
          fontSize: 10,
          color: "#9ca3af",
        }}
      >
        Input: sys.argv[1] = data file path
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
