import { Handle, Position, NodeProps } from "@xyflow/react";
import { Package, Loader2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
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
import { cn } from "@/lib/utils";
import { nodeConfig, statusColors } from "@/lib/theme";

export function ModelExporterNode({ id, data }: NodeProps) {
  const nodeData = data as NodeData;

  // Rule: rerender-derived-state - Single shallow selector
  const { updateNodeData, executionStatus } = usePipelineStore(
    useShallow((s) => ({
      updateNodeData: s.updateNodeData,
      executionStatus: s.executionStatus,
    }))
  );

  const theme = nodeConfig.modelExporter;

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
        "hover:border-cyan-500/50"
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !border-2 !border-slate-900/80"
        style={{ backgroundColor: theme.handleColor }}
      />

      <div className="flex items-center gap-2.5 mb-4">
        <div className="p-1.5 rounded-lg bg-cyan-500/10">
          <Package className={cn("h-4 w-4", theme.accentClass)} />
        </div>
        <span className={cn("text-sm font-semibold tracking-tight", theme.accentClass)}>
          Model Exporter
        </span>
        {executionStatus === "running" && (
          <Loader2 className="h-3 w-3 text-amber-400 animate-spin" />
        )}
      </div>

      {/* Export Format Dropdown */}
      <div className="mb-3 nodrag">
        <Label className="text-[10px] uppercase tracking-widest text-slate-500 font-medium mb-1.5 block">
          Format
        </Label>
        <Select
          value={nodeData.exportFormat || "joblib"}
          onValueChange={(value) => updateNodeData(id, { exportFormat: value })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Select format" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="joblib">joblib (.joblib)</SelectItem>
            <SelectItem value="pickle">pickle (.pkl)</SelectItem>
            <SelectItem value="onnx">ONNX (.onnx)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Output Filename */}
      <div className="nodrag">
        <Label className="text-[10px] uppercase tracking-widest text-slate-500 font-medium mb-1.5 block">
          Output Name
        </Label>
        <Input
          type="text"
          placeholder="model_export"
          value={nodeData.outputFileName || ""}
          onChange={(e) => updateNodeData(id, { outputFileName: e.target.value })}
          className="h-8 text-xs"
        />
      </div>
    </div>
  );
}
