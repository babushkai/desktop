import { Handle, Position, NodeProps } from "@xyflow/react";
import { FileCode2, Loader2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { usePipelineStore, NodeData } from "../stores/pipelineStore";
import { LazyMonacoEditor } from "./LazyMonacoEditor";
import { cn } from "@/lib/utils";
import { nodeConfig, statusColors } from "@/lib/theme";

export function ScriptNode({ id, data }: NodeProps) {
  const nodeData = data as NodeData;

  // Rule: rerender-derived-state - Single shallow selector instead of multiple subscriptions
  const { updateNodeData, executionStatus } = usePipelineStore(
    useShallow((s) => ({
      updateNodeData: s.updateNodeData,
      executionStatus: s.executionStatus,
    }))
  );

  const handleCodeChange = (value: string | undefined) => {
    updateNodeData(id, { code: value || "" });
  };

  const theme = nodeConfig.script;

  return (
    <div
      className={cn(
        // Structure
        "rounded-xl p-4 min-w-[300px]",
        // Glass effect
        "glass-subtle backdrop-blur-xl",
        // Theme colors
        theme.bgClass,
        // Status
        statusColors[executionStatus],
        // Interactions - using translate instead of scale for premium feel
        "transition-node",
        "hover:shadow-premium-md hover:-translate-y-0.5",
        "hover:border-sky-500/50"
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !border-2 !border-slate-900/80"
        style={{ backgroundColor: theme.handleColor }}
      />

      <div className="flex items-center gap-2.5 mb-4">
        <div className="p-1.5 rounded-lg bg-sky-500/10">
          <FileCode2 className={cn("h-4 w-4", theme.accentClass)} />
        </div>
        <span className={cn("text-sm font-semibold tracking-tight", theme.accentClass)}>
          Script
        </span>
        {executionStatus === "running" && (
          <Loader2 className="h-3 w-3 text-amber-400 animate-spin" />
        )}
      </div>

      <div className="nodrag rounded-xl border border-white/[0.06] overflow-hidden">
        <LazyMonacoEditor
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
