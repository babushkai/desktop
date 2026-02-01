import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Connection,
  NodeTypes,
} from "@xyflow/react";
import { usePipelineStore } from "../stores/pipelineStore";
import { DataLoaderNode } from "./DataLoaderNode";
import { ScriptNode } from "./ScriptNode";

const nodeTypes: NodeTypes = {
  dataLoader: DataLoaderNode,
  script: ScriptNode,
};

export function Canvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect } =
    usePipelineStore();

  const isValidConnection = (connection: Connection | { source: string; target: string }) => {
    const sourceNode = nodes.find((n) => n.id === connection.source);
    const targetNode = nodes.find((n) => n.id === connection.target);
    return sourceNode?.type === "dataLoader" && targetNode?.type === "script";
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      nodeTypes={nodeTypes}
      isValidConnection={isValidConnection}
      fitView
      style={{ backgroundColor: "#16213e" }}
    >
      <Background color="#394867" gap={16} />
      <Controls />
      <MiniMap
        nodeColor={(node) => {
          switch (node.type) {
            case "dataLoader":
              return "#4ade80";
            case "script":
              return "#60a5fa";
            default:
              return "#888";
          }
        }}
        style={{ backgroundColor: "#1a1a2e" }}
      />
    </ReactFlow>
  );
}
