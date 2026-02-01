import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Connection,
  NodeTypes,
} from "@xyflow/react";
import { usePipelineStore, VALID_CONNECTIONS } from "../stores/pipelineStore";
import { DataLoaderNode } from "./DataLoaderNode";
import { ScriptNode } from "./ScriptNode";
import { DataSplitNode } from "./DataSplitNode";
import { TrainerNode } from "./TrainerNode";
import { EvaluatorNode } from "./EvaluatorNode";
import { ModelExporterNode } from "./ModelExporterNode";

const nodeTypes: NodeTypes = {
  dataLoader: DataLoaderNode,
  script: ScriptNode,
  dataSplit: DataSplitNode,
  trainer: TrainerNode,
  evaluator: EvaluatorNode,
  modelExporter: ModelExporterNode,
};

export function Canvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, deleteNodes, selectedNodeId, setSelectedNodeId } =
    usePipelineStore();

  const isValidConnection = (connection: Connection | { source: string; target: string }) => {
    const sourceNode = nodes.find((n) => n.id === connection.source);
    const targetNode = nodes.find((n) => n.id === connection.target);
    return VALID_CONNECTIONS.some(
      ([src, tgt]) => sourceNode?.type === src && targetNode?.type === tgt
    );
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodesDelete={(deleted) => deleteNodes(deleted.map((n) => n.id))}
      onSelectionChange={({ nodes: selectedNodes }) => {
        const newSelectedId = selectedNodes.length === 1 ? selectedNodes[0].id : null;
        if (newSelectedId !== selectedNodeId) {
          setSelectedNodeId(newSelectedId);
        }
      }}
      nodeTypes={nodeTypes}
      isValidConnection={isValidConnection}
      deleteKeyCode={["Backspace", "Delete"]}
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
            case "dataSplit":
              return "#f472b6";
            case "trainer":
              return "#a78bfa";
            case "evaluator":
              return "#fb923c";
            case "modelExporter":
              return "#5eead4";
            default:
              return "#888";
          }
        }}
        style={{ backgroundColor: "#1a1a2e" }}
      />
    </ReactFlow>
  );
}
