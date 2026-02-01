import { Handle, Position, NodeProps } from "@xyflow/react";
import { BarChart3, Loader2 } from "lucide-react";
import { usePipelineStore } from "../stores/pipelineStore";
import { cn } from "@/lib/utils";
import { nodeConfig, statusColors } from "@/lib/theme";

export function EvaluatorNode(_props: NodeProps) {
  const executionStatus = usePipelineStore((s) => s.executionStatus);

  const theme = nodeConfig.evaluator;

  return (
    <div
      className={cn(
        "rounded-lg border-2 p-3 min-w-[200px] transition-all duration-200",
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

      <div className="flex items-center gap-2 mb-2">
        <BarChart3 className={cn("h-4 w-4", theme.accentClass)} />
        <span className={cn("text-sm font-medium", theme.accentClass)}>
          Evaluator
        </span>
        {executionStatus === "running" && (
          <Loader2 className="h-3 w-3 text-yellow-400 animate-spin" />
        )}
      </div>

      <div className="text-[10px] text-orange-200/70">
        Auto-detects model type and displays metrics
      </div>

      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: 12,
          height: 12,
          backgroundColor: theme.handleColor,
          border: "2px solid #0f172a",
        }}
      />
    </div>
  );
}
