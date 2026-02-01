import { Handle, Position, NodeProps } from "@xyflow/react";
import { Scissors, Loader2 } from "lucide-react";
import { usePipelineStore, NodeData } from "../stores/pipelineStore";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { nodeConfig, statusColors } from "@/lib/theme";

export function DataSplitNode({ id, data }: NodeProps) {
  const nodeData = data as NodeData;
  const updateNodeData = usePipelineStore((s) => s.updateNodeData);
  const executionStatus = usePipelineStore((s) => s.executionStatus);

  const theme = nodeConfig.dataSplit;

  return (
    <div
      className={cn(
        // Structure
        "rounded-xl p-4 min-w-[220px]",
        // Glass effect
        "glass-subtle backdrop-blur-xl",
        // Theme colors
        theme.bgClass,
        // Status
        statusColors[executionStatus],
        // Interactions
        "transition-all duration-200 ease-out",
        "hover:shadow-premium-md hover:scale-[1.01]",
        "hover:border-fuchsia-500/50"
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !border-2 !border-slate-900/80 transition-all hover:!scale-125"
        style={{ backgroundColor: theme.handleColor }}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !border-2 !border-slate-900/80 transition-all hover:!scale-125"
        style={{ backgroundColor: theme.handleColor }}
      />

      <div className="flex items-center gap-2.5 mb-4">
        <div className="p-1.5 rounded-lg bg-fuchsia-500/10">
          <Scissors className={cn("h-4 w-4", theme.accentClass)} />
        </div>
        <span className={cn("text-sm font-semibold tracking-tight", theme.accentClass)}>
          Data Split
        </span>
        {executionStatus === "running" && (
          <Loader2 className="h-3 w-3 text-amber-400 animate-spin" />
        )}
      </div>

      {/* Test Split Slider */}
      <div className="mb-3 nodrag">
        <Label className="text-[10px] uppercase tracking-widest text-slate-500 font-medium mb-1.5 block">
          Test Split: {((nodeData.splitRatio || 0.2) * 100).toFixed(0)}%
        </Label>
        <Slider
          value={[(nodeData.splitRatio || 0.2) * 100]}
          onValueChange={([value]) => updateNodeData(id, { splitRatio: value / 100 })}
          min={10}
          max={50}
          step={5}
          className="w-full"
        />
      </div>

      {/* Random State Input */}
      <div className="mb-3 nodrag">
        <Label className="text-[10px] uppercase tracking-widest text-slate-500 font-medium mb-1.5 block">
          Random State
        </Label>
        <Input
          type="number"
          value={nodeData.randomState ?? 42}
          onChange={(e) =>
            updateNodeData(id, { randomState: parseInt(e.target.value) || 0 })
          }
          className="h-8 text-xs"
        />
      </div>

      {/* Stratify Checkbox */}
      <div className="mb-3 nodrag">
        <div className="flex items-center gap-2">
          <Checkbox
            id={`stratify-${id}`}
            checked={nodeData.stratify || false}
            onCheckedChange={(checked) =>
              updateNodeData(id, { stratify: checked === true })
            }
          />
          <Label
            htmlFor={`stratify-${id}`}
            className="text-[10px] uppercase tracking-widest text-slate-500 font-medium cursor-pointer"
          >
            Stratify Split
          </Label>
        </div>
      </div>

      {/* Target Column for Stratification */}
      {nodeData.stratify && (
        <div className="nodrag">
          <Label className="text-[10px] uppercase tracking-widest text-slate-500 font-medium mb-1.5 block">
            Stratify Column
          </Label>
          <Input
            type="text"
            placeholder="e.g. label"
            value={nodeData.splitTargetColumn || ""}
            onChange={(e) =>
              updateNodeData(id, { splitTargetColumn: e.target.value })
            }
            className="h-8 text-xs"
          />
        </div>
      )}
    </div>
  );
}
