import Editor from "@monaco-editor/react";
import { usePipelineStore, NodeData } from "../stores/pipelineStore";

export function PropertiesPanel() {
  const { nodes, selectedNodeId, updateNodeData } = usePipelineStore();
  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const nodeData = selectedNode?.data as NodeData | undefined;

  // Only show panel for Script nodes
  if (!selectedNode || selectedNode.type !== "script") {
    return null;
  }

  return (
    <div
      style={{
        width: 400,
        backgroundColor: "#0f3460",
        borderLeft: "1px solid #394867",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #394867",
          fontSize: 14,
          fontWeight: 500,
          color: "#60a5fa",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        📜 Script Editor
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Editor
          height="100%"
          language="python"
          theme="vs-dark"
          value={nodeData?.code || ""}
          onChange={(value) =>
            selectedNodeId && updateNodeData(selectedNodeId, { code: value || "" })
          }
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 8, bottom: 8 },
            wordWrap: "on",
          }}
        />
      </div>
    </div>
  );
}
