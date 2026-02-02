import { lazy, Suspense, useCallback } from "react";
import { usePipelineStore, NodeData } from "../stores/pipelineStore";
import { RiCodeLine } from "@remixicon/react";
import { defineGithubDarkTheme } from "@/lib/monacoTheme";

const Editor = lazy(() => import("@monaco-editor/react"));

function EditorSkeleton() {
  return (
    <div className="flex-1 flex items-center justify-center bg-background">
      <div className="flex items-center gap-2 text-text-muted">
        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Loading editor...</span>
      </div>
    </div>
  );
}

export function PropertiesPanel() {
  const nodes = usePipelineStore((s) => s.nodes);
  const selectedNodeId = usePipelineStore((s) => s.selectedNodeId);
  const updateNodeData = usePipelineStore((s) => s.updateNodeData);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const nodeData = selectedNode?.data as NodeData | undefined;

  const handleCodeChange = useCallback(
    (value: string | undefined) => {
      if (selectedNodeId) {
        updateNodeData(selectedNodeId, { code: value || "" });
      }
    },
    [selectedNodeId, updateNodeData]
  );

  if (!selectedNode || selectedNode.type !== "script") {
    return null;
  }

  return (
    <div className="w-96 flex flex-col panel-sidebar-right border-l border-white/5 animate-slide-in-right">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
        <RiCodeLine className="w-4 h-4 text-node-script" />
        <span className="text-sm font-medium text-node-script">Script Editor</span>
      </div>
      <div className="flex-1 min-h-0">
        <Suspense fallback={<EditorSkeleton />}>
          <Editor
            height="100%"
            language="python"
            theme="github-dark"
            value={nodeData?.code || ""}
            onChange={handleCodeChange}
            beforeMount={defineGithubDarkTheme}
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
        </Suspense>
      </div>
    </div>
  );
}
