import { Handle, Position, NodeProps } from "@xyflow/react";
import { open } from "@tauri-apps/plugin-dialog";
import { usePipelineStore, NodeData } from "../stores/pipelineStore";

export function DataLoaderNode({ id, data }: NodeProps<NodeData>) {
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

  const fileName = data.filePath?.split("/").pop();

  return (
    <div
      style={{
        backgroundColor: "#065f46",
        border: "2px solid #4ade80",
        borderRadius: 8,
        padding: 12,
        minWidth: 180,
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: "#4ade80",
          marginBottom: 8,
          fontWeight: 500,
        }}
      >
        📁 Data Loader
      </div>

      <button
        onClick={handleSelectFile}
        style={{
          width: "100%",
          padding: "8px 12px",
          backgroundColor: "#1a1a2e",
          color: "#eee",
          border: "1px solid #4ade80",
          borderRadius: 4,
          cursor: "pointer",
          fontSize: 12,
          textAlign: "left",
        }}
      >
        {fileName || "Select file..."}
      </button>

      {data.filePath && (
        <div
          style={{
            marginTop: 8,
            fontSize: 10,
            color: "#9ca3af",
            wordBreak: "break-all",
          }}
        >
          {data.filePath}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: 12,
          height: 12,
          backgroundColor: "#4ade80",
          border: "2px solid #065f46",
        }}
      />
    </div>
  );
}
