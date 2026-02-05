import { lazy, Suspense, useCallback } from "react";
import { NodeProps } from "@xyflow/react";
import { usePipelineStore, NodeData } from "../stores/pipelineStore";
import { BaseNode, NodeText } from "./BaseNode";
import { RiCodeLine } from "@remixicon/react";
import { defineGithubDarkTheme } from "@/lib/monacoTheme";

const Editor = lazy(() => import("@monaco-editor/react"));

function EditorSkeleton() {
  return (
    <div className="h-[150px] flex items-center justify-center bg-background rounded-md border border-white/5">
      <div className="flex items-center gap-2 text-text-muted">
        <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
        <span className="text-xs">Loading...</span>
      </div>
    </div>
  );
}

export function ScriptNode({ id, data, selected }: NodeProps) {
  const nodeData = data as NodeData;
  const updateNodeData = usePipelineStore((state) => state.updateNodeData);
  const executionStatus = usePipelineStore((state) => state.executionStatus);

  const handleCodeChange = useCallback(
    (value: string | undefined) => {
      updateNodeData(id, { code: value || "" });
    },
    [id, updateNodeData]
  );

  return (
    <BaseNode
      variant="script"
      title="Script"
      icon={RiCodeLine}
      isRunning={executionStatus === "running"}
      isSelected={selected}
      hasInput
      hasOutput
      minWidth={300}
    >
      <div className="nodrag rounded-md border border-white/5 overflow-hidden">
        <Suspense fallback={<EditorSkeleton />}>
          <Editor
            height="150px"
            language="python"
            theme="github-dark"
            value={nodeData.code || ""}
            onChange={handleCodeChange}
            beforeMount={defineGithubDarkTheme}
            options={{
              minimap: { enabled: false },
              fontSize: 12,
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              padding: { top: 8 },
            }}
          />
        </Suspense>
      </div>

      <NodeText>Input: sys.argv[1] = data file path</NodeText>
    </BaseNode>
  );
}
