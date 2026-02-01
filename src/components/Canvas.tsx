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
import { nodeConfig } from "@/lib/theme";

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
      className="bg-slate-900"
    >
      <Background color="#334155" gap={16} />
      <Controls className="[&>button]:bg-slate-800 [&>button]:border-slate-600 [&>button]:text-slate-300 [&>button:hover]:bg-slate-700" />
      <MiniMap
        nodeColor={(node) => {
          const config = nodeConfig[node.type as keyof typeof nodeConfig];
          return config?.handleColor || "#64748b";
        }}
        maskColor="rgba(15, 23, 42, 0.7)"
        className="bg-slate-800 border border-slate-700 rounded"
      />
    </ReactFlow>
  );
}
