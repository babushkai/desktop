import { Handle, Position, NodeProps } from "@xyflow/react";
import { Package, Loader2 } from "lucide-react";
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
  const updateNodeData = usePipelineStore((s) => s.updateNodeData);
  const executionStatus = usePipelineStore((s) => s.executionStatus);

  const theme = nodeConfig.modelExporter;

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

      <div className="flex items-center gap-2 mb-3">
        <Package className={cn("h-4 w-4", theme.accentClass)} />
        <span className={cn("text-sm font-medium", theme.accentClass)}>
          Model Exporter
        </span>
        {executionStatus === "running" && (
          <Loader2 className="h-3 w-3 text-yellow-400 animate-spin" />
        )}
      </div>

      {/* Export Format Dropdown */}
      <div className="mb-2 nodrag">
        <Label className="text-[10px] text-slate-400 mb-1 block">Format</Label>
        <Select
          value={nodeData.exportFormat || "joblib"}
          onValueChange={(value) => updateNodeData(id, { exportFormat: value })}
        >
          <SelectTrigger className="h-8 text-xs bg-slate-900/50 border-slate-600">
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
        <Label className="text-[10px] text-slate-400 mb-1 block">
          Output Name
        </Label>
        <Input
          type="text"
          placeholder="model_export"
          value={nodeData.outputFileName || ""}
          onChange={(e) => updateNodeData(id, { outputFileName: e.target.value })}
          className="h-8 text-xs bg-slate-900/50 border-slate-600"
        />
      </div>
    </div>
  );
}
