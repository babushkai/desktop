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
        "rounded-lg border-2 p-3 min-w-[220px] transition-all duration-200",
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

      <div className="flex items-center gap-2 mb-3">
        <Scissors className={cn("h-4 w-4", theme.accentClass)} />
        <span className={cn("text-sm font-medium", theme.accentClass)}>
          Data Split
        </span>
        {executionStatus === "running" && (
          <Loader2 className="h-3 w-3 text-yellow-400 animate-spin" />
        )}
      </div>

      {/* Test Split Slider */}
      <div className="mb-2 nodrag">
        <Label className="text-[10px] text-slate-400 mb-1 block">
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
      <div className="mb-2 nodrag">
        <Label className="text-[10px] text-slate-400 mb-1 block">
          Random State
        </Label>
        <Input
          type="number"
          value={nodeData.randomState ?? 42}
          onChange={(e) =>
            updateNodeData(id, { randomState: parseInt(e.target.value) || 0 })
          }
          className="h-8 text-xs bg-slate-900/50 border-slate-600"
        />
      </div>

      {/* Stratify Checkbox */}
      <div className="mb-2 nodrag">
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
            className="text-[10px] text-slate-400 cursor-pointer"
          >
            Stratify Split
          </Label>
        </div>
      </div>

      {/* Target Column for Stratification */}
      {nodeData.stratify && (
        <div className="nodrag">
          <Label className="text-[10px] text-slate-400 mb-1 block">
            Stratify Column
          </Label>
          <Input
            type="text"
            placeholder="e.g. label"
            value={nodeData.splitTargetColumn || ""}
            onChange={(e) =>
              updateNodeData(id, { splitTargetColumn: e.target.value })
            }
            className="h-8 text-xs bg-slate-900/50 border-slate-600"
          />
        </div>
      )}
    </div>
  );
}
