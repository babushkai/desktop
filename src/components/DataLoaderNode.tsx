import { Handle, Position, NodeProps } from "@xyflow/react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
import { usePipelineStore, NodeData } from "../stores/pipelineStore";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { nodeConfig } from "@/lib/theme";

export function DataLoaderNode({ id, data }: NodeProps) {
  const nodeData = data as NodeData;
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
        "rounded-lg border-2 p-3 min-w-[200px] transition-all duration-200",
        theme.bgClass,
        theme.borderClass,
        "hover:shadow-lg hover:shadow-black/20"
      )}
    >
      <div className="flex items-center gap-2 mb-3">
        <FolderOpen className={cn("h-4 w-4", theme.accentClass)} />
        <span className={cn("text-sm font-medium", theme.accentClass)}>
          Data Loader
        </span>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={handleSelectFile}
        className="w-full justify-start text-xs bg-slate-900/50 border-slate-600 hover:bg-slate-800 hover:border-slate-500 nodrag"
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
