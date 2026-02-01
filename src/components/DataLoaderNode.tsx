import { Handle, Position, NodeProps } from "@xyflow/react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
import { usePipelineStore, NodeData } from "../stores/pipelineStore";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { nodeConfig } from "@/lib/theme";

export function DataLoaderNode({ id, data }: NodeProps) {
  const nodeData = data as NodeData;
  // Single subscription - only needs updateNodeData
  const updateNodeData = usePipelineStore((state) => state.updateNodeData);

  const handleSelectFile = async () => {
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: "Data Files",
          extensions: ["csv", "json", "parquet", "txt"],
        },
      ],
    });

    if (selected && typeof selected === "string") {
      updateNodeData(id, { filePath: selected });
    }
  };

  const fileName = nodeData.filePath?.split("/").pop();
  const theme = nodeConfig.dataLoader;

  return (
    <div
      className={cn(
        // Structure
        "rounded-xl p-4 min-w-[220px]",
        // Glass effect
        "glass-subtle backdrop-blur-xl",
        // Theme colors
        theme.bgClass,
        theme.borderClass,
        // Interactions - translate instead of scale
        "transition-node",
        "hover:shadow-premium-md hover:-translate-y-0.5",
        "hover:border-emerald-500/50"
      )}
    >
      <div className="flex items-center gap-2.5 mb-4">
        <div className="p-1.5 rounded-lg bg-emerald-500/10">
          <FolderOpen className={cn("h-4 w-4", theme.accentClass)} />
        </div>
        <span className={cn("text-sm font-semibold tracking-tight", theme.accentClass)}>
          Data Loader
        </span>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={handleSelectFile}
        className="w-full justify-start text-xs glass-subtle glass-hover border-white/[0.08] nodrag transition-button"
      >
        {fileName || "Select file..."}
      </Button>

      {nodeData.filePath && (
        <div className="mt-2 text-[10px] text-slate-400 break-all">
          {nodeData.filePath}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !border-2 !border-slate-900/80"
        style={{ backgroundColor: theme.handleColor }}
      />
    </div>
  );
}
