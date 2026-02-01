import { FileCode2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { usePipelineStore, NodeData } from "../stores/pipelineStore";
import { LazyMonacoEditor } from "./LazyMonacoEditor";

export function PropertiesPanel() {
  // Rule: rerender-derived-state - Single shallow selector
  const { nodes, selectedNodeId, updateNodeData } = usePipelineStore(
    useShallow((s) => ({
      nodes: s.nodes,
      selectedNodeId: s.selectedNodeId,
      updateNodeData: s.updateNodeData,
    }))
  );

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const nodeData = selectedNode?.data as NodeData | undefined;

  // Only show panel for Script nodes
  if (!selectedNode || selectedNode.type !== "script") {
    return null;
  }

  return (
    <div className="w-[400px] glass-subtle border-l border-white/[0.08] flex flex-col">
      <div className="px-4 py-3 border-b border-white/[0.08] flex items-center gap-2.5">
        <div className="p-1.5 rounded-lg bg-sky-950/50">
          <FileCode2 className="h-4 w-4 text-sky-400" />
        </div>
        <span className="text-sm font-semibold tracking-tight text-sky-400">
          Script Editor
        </span>
      </div>
      <div className="flex-1 min-h-0">
        <div className="h-full rounded-xl overflow-hidden border border-white/[0.06] m-2">
          <LazyMonacoEditor
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
    </div>
  );
}
