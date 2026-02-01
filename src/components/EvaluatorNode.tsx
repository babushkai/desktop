import { NodeProps } from "@xyflow/react";
import { usePipelineStore } from "../stores/pipelineStore";
import { BaseNode, NodeText } from "./BaseNode";
import { RiBarChartBoxLine } from "@remixicon/react";

export function EvaluatorNode({ selected }: NodeProps) {
  const executionStatus = usePipelineStore((s) => s.executionStatus);

  return (
    <BaseNode
      variant="evaluator"
      title="Evaluator"
      icon={RiBarChartBoxLine}
      isRunning={executionStatus === "running"}
      isSelected={selected}
      hasInput
      hasOutput
      minWidth={180}
    >
      <NodeText>Auto-detects model type and displays metrics</NodeText>
    </BaseNode>
  );
}
