import { Handle, Position, NodeProps } from "@xyflow/react";
import { Brain, Loader2 } from "lucide-react";
import { usePipelineStore, NodeData } from "../stores/pipelineStore";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { nodeConfig, statusColors } from "@/lib/theme";

export function TrainerNode({ id, data }: NodeProps) {
  const nodeData = data as NodeData;
  const updateNodeData = usePipelineStore((s) => s.updateNodeData);
  const executionStatus = usePipelineStore((s) => s.executionStatus);

  const theme = nodeConfig.trainer;

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
        "hover:border-purple-500/50"
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
        <div className="p-1.5 rounded-lg bg-purple-500/10">
          <Brain className={cn("h-4 w-4", theme.accentClass)} />
        </div>
        <span className={cn("text-sm font-semibold tracking-tight", theme.accentClass)}>
          Trainer
        </span>
        {executionStatus === "running" && (
          <Loader2 className="h-3 w-3 text-amber-400 animate-spin" />
        )}
      </div>

      {/* Model Type Dropdown */}
      <div className="mb-3 nodrag">
        <Label className="text-[10px] uppercase tracking-widest text-slate-500 font-medium mb-1.5 block">
          Model
        </Label>
        <Select
          value={nodeData.modelType || "linear_regression"}
          onValueChange={(value) => updateNodeData(id, { modelType: value })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Select model" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="linear_regression">Linear Regression</SelectItem>
            <SelectItem value="random_forest">Random Forest</SelectItem>
            <SelectItem value="gradient_boosting">Gradient Boosting</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Target Column Input */}
      <div className="mb-3 nodrag">
        <Label className="text-[10px] uppercase tracking-widest text-slate-500 font-medium mb-1.5 block">
          Target Column
        </Label>
        <Input
          type="text"
          placeholder="e.g. price"
          value={nodeData.targetColumn || ""}
          onChange={(e) => updateNodeData(id, { targetColumn: e.target.value })}
          className="h-8 text-xs"
        />
      </div>

      {/* Test Split Slider */}
      <div className="nodrag">
        <Label className="text-[10px] uppercase tracking-widest text-slate-500 font-medium mb-1.5 block">
          Test Split: {((nodeData.testSplit || 0.2) * 100).toFixed(0)}%
        </Label>
        <Slider
          value={[(nodeData.testSplit || 0.2) * 100]}
          onValueChange={([value]) => updateNodeData(id, { testSplit: value / 100 })}
          min={10}
          max={50}
          step={5}
          className="w-full"
        />
      </div>
    </div>
  );
}
