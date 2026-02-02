import { useCallback } from "react";
import { NodeProps } from "@xyflow/react";
import { open } from "@tauri-apps/plugin-dialog";
import { usePipelineStore, NodeData } from "../stores/pipelineStore";
import { BaseNode, NodeButton, NodeText } from "./BaseNode";
import { RiDatabase2Line, RiFileLine } from "@remixicon/react";

export function DataLoaderNode({ id, data, selected: isSelected }: NodeProps) {
  const nodeData = data as NodeData;
  const updateNodeData = usePipelineStore((state) => state.updateNodeData);

  const handleSelectFile = useCallback(async () => {
    const selectedFile = await open({
      multiple: false,
      filters: [
        {
          name: "Data Files",
          extensions: ["csv", "json", "parquet", "txt"],
        },
      ],
    });

    if (selectedFile && typeof selectedFile === "string") {
      updateNodeData(id, { filePath: selectedFile });
    }
  }, [id, updateNodeData]);

  const fileName = nodeData.filePath?.split("/").pop();

  return (
    <BaseNode
      variant="dataloader"
      title="Data Loader"
      icon={RiDatabase2Line}
      isSelected={isSelected}
      hasOutput
      minWidth={180}
    >
      <NodeButton onClick={handleSelectFile} className="flex items-center gap-2">
        <RiFileLine className="w-3.5 h-3.5" />
        {fileName || "Select file..."}
      </NodeButton>

      {nodeData.filePath && (
        <NodeText className="truncate max-w-[200px]" title={nodeData.filePath}>
          {nodeData.filePath}
        </NodeText>
      )}
    </BaseNode>
  );
}
