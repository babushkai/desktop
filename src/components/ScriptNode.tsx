import { Handle, Position, NodeProps } from "@xyflow/react";
import Editor from "@monaco-editor/react";
import { FileCode2, Loader2 } from "lucide-react";
import { usePipelineStore, NodeData } from "../stores/pipelineStore";
import { cn } from "@/lib/utils";
import { nodeConfig, statusColors } from "@/lib/theme";

export function ScriptNode({ id, data }: NodeProps) {
  const nodeData = data as NodeData;
  const updateNodeData = usePipelineStore((state) => state.updateNodeData);
  const executionStatus = usePipelineStore((state) => state.executionStatus);

  const handleCodeChange = (value: string | undefined) => {
    updateNodeData(id, { code: value || "" });
  };

  const theme = nodeConfig.script;

  return (
    <div
      className={cn(
        "rounded-lg border-2 p-3 min-w-[300px] transition-all duration-200",
        theme.bgClass,
        statusColors[executionStatus],
        "hover:shadow-lg hover:shadow-black/20"
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          width: 12,
          height: 12,
          backgroundColor: theme.handleColor,
          border: "2px solid #0f172a",
        }}
      />

      <div className="flex items-center gap-2 mb-3">
        <FileCode2 className={cn("h-4 w-4", theme.accentClass)} />
        <span className={cn("text-sm font-medium", theme.accentClass)}>
          Script
        </span>
        {executionStatus === "running" && (
          <Loader2 className="h-3 w-3 text-yellow-400 animate-spin" />
        )}
      </div>

      <div className="nodrag rounded border border-slate-600 overflow-hidden">
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

      <div className="mt-2 text-[10px] text-slate-400">
        Input: sys.argv[1] = data file path
      </div>
    </div>
  );
}
