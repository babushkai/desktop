import Editor from "@monaco-editor/react";
import { FileCode2 } from "lucide-react";
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
    <div className="w-[400px] bg-slate-800 border-l border-slate-700 flex flex-col">
      <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-2">
        <FileCode2 className="h-4 w-4 text-blue-400" />
        <span className="text-sm font-medium text-blue-400">Script Editor</span>
      </div>
      <div className="flex-1 min-h-0">
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
