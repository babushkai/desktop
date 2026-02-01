import { Handle, Position, NodeProps } from "@xyflow/react";
import { BarChart3, Loader2 } from "lucide-react";
import { usePipelineStore } from "../stores/pipelineStore";
import { cn } from "@/lib/utils";
import { nodeConfig, statusColors } from "@/lib/theme";

export function EvaluatorNode(_props: NodeProps) {
  // Single subscription - only needs executionStatus
  const executionStatus = usePipelineStore((s) => s.executionStatus);

  const theme = nodeConfig.evaluator;

  return (
    <div
      className={cn(
        // Structure
        "rounded-xl p-4 min-w-[200px]",
        // Glass effect
        "glass-subtle backdrop-blur-xl",
        // Theme colors
        theme.bgClass,
        // Status
        statusColors[executionStatus],
        // Interactions - translate instead of scale
        "transition-node",
        "hover:shadow-premium-md hover:-translate-y-0.5",
        "hover:border-amber-500/50"
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !border-2 !border-slate-900/80"
        style={{ backgroundColor: theme.handleColor }}
      />

      <div className="flex items-center gap-2.5 mb-3">
        <div className="p-1.5 rounded-lg bg-amber-500/10">
          <BarChart3 className={cn("h-4 w-4", theme.accentClass)} />
        </div>
        <span className={cn("text-sm font-semibold tracking-tight", theme.accentClass)}>
          Evaluator
        </span>
        {executionStatus === "running" && (
          <Loader2 className="h-3 w-3 text-amber-400 animate-spin" />
        )}
      </div>

      <div className="text-[10px] text-amber-200/70">
        Auto-detects model type and displays metrics
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !border-2 !border-slate-900/80"
        style={{ backgroundColor: theme.handleColor }}
      />
    </div>
  );
}
