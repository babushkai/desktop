import { NodeProps } from "@xyflow/react";
import { usePipelineStore, NodeData } from "../stores/pipelineStore";
import { BaseNode, NodeButton, NodeText } from "./BaseNode";
import { RiCodeLine, RiEditLine } from "@remixicon/react";

export function ScriptNode({ id, data, selected }: NodeProps) {
  const nodeData = data as NodeData;
  const executionStatus = usePipelineStore((state) => state.executionStatus);
  const openProperties = usePipelineStore((state) => state.openProperties);

  const code = nodeData.code || "";
  const lineCount = code ? code.split("\n").filter((l) => l.trim()).length : 0;
  const firstLine = code.split("\n").find((l) => l.trim()) || "";
  const preview =
    firstLine.length > 30 ? firstLine.slice(0, 30) + "..." : firstLine;

  return (
    <BaseNode
      variant="script"
      title="Script"
      icon={RiCodeLine}
      isRunning={executionStatus === "running"}
      isSelected={selected}
      hasInput
      hasOutput
      minWidth={200}
    >
      {lineCount > 0 ? (
        <>
          <NodeText className="font-mono text-text-muted truncate">
            {preview || `${lineCount} lines`}
          </NodeText>
          <NodeButton
            onClick={() => openProperties(id)}
            className="flex items-center gap-2"
          >
            <RiEditLine className="w-3.5 h-3.5" />
            Edit Script ({lineCount} lines)
          </NodeButton>
        </>
      ) : (
        <NodeButton
          onClick={() => openProperties(id)}
          className="flex items-center gap-2"
        >
          <RiEditLine className="w-3.5 h-3.5" />
          Add Script...
        </NodeButton>
      )}

      <NodeText>Input: sys.argv[1] = data file path</NodeText>
    </BaseNode>
  );
}
