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
        <Brain className={cn("h-4 w-4", theme.accentClass)} />
        <span className={cn("text-sm font-medium", theme.accentClass)}>
          Trainer
        </span>
        {executionStatus === "running" && (
          <Loader2 className="h-3 w-3 text-yellow-400 animate-spin" />
        )}
      </div>

      {/* Model Type Dropdown */}
      <div className="mb-2 nodrag">
        <Label className="text-[10px] text-slate-400 mb-1 block">Model</Label>
        <Select
          value={nodeData.modelType || "linear_regression"}
          onValueChange={(value) => updateNodeData(id, { modelType: value })}
        >
          <SelectTrigger className="h-8 text-xs bg-slate-900/50 border-slate-600">
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
      <div className="mb-2 nodrag">
        <Label className="text-[10px] text-slate-400 mb-1 block">
          Target Column
        </Label>
        <Input
          type="text"
          placeholder="e.g. price"
          value={nodeData.targetColumn || ""}
          onChange={(e) => updateNodeData(id, { targetColumn: e.target.value })}
          className="h-8 text-xs bg-slate-900/50 border-slate-600"
        />
      </div>

      {/* Test Split Slider */}
      <div className="nodrag">
        <Label className="text-[10px] text-slate-400 mb-1 block">
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
