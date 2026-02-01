import { useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Connection,
  NodeTypes,
} from "@xyflow/react";
import { useShallow } from "zustand/react/shallow";
import { usePipelineStore, VALID_CONNECTIONS } from "../stores/pipelineStore";
import { DataLoaderNode } from "./DataLoaderNode";
import { ScriptNode } from "./ScriptNode";
import { DataSplitNode } from "./DataSplitNode";
import { TrainerNode } from "./TrainerNode";
import { EvaluatorNode } from "./EvaluatorNode";
import { ModelExporterNode } from "./ModelExporterNode";
import { nodeConfig } from "@/lib/theme";

// Rule: rendering-hoist-jsx - Hoist static object outside component
const nodeTypes: NodeTypes = {
  dataLoader: DataLoaderNode,
  script: ScriptNode,
  dataSplit: DataSplitNode,
  trainer: TrainerNode,
  evaluator: EvaluatorNode,
  modelExporter: ModelExporterNode,
};

export function Canvas() {
  // Rule: rerender-derived-state - Single shallow selector
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    deleteNodes,
    selectedNodeId,
    setSelectedNodeId,
  } = usePipelineStore(
    useShallow((s) => ({
      nodes: s.nodes,
      edges: s.edges,
      onNodesChange: s.onNodesChange,
      onEdgesChange: s.onEdgesChange,
      onConnect: s.onConnect,
      deleteNodes: s.deleteNodes,
      selectedNodeId: s.selectedNodeId,
      setSelectedNodeId: s.setSelectedNodeId,
    }))
  );

  // Rule: rerender-functional-setstate - Stable callback reference
  const isValidConnection = useCallback(
    (connection: Connection | { source: string; target: string }) => {
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);
      return VALID_CONNECTIONS.some(
        ([src, tgt]) => sourceNode?.type === src && targetNode?.type === tgt
      );
    },
    [nodes]
  );

  // Rule: rerender-functional-setstate - Stable callback
  const handleNodesDelete = useCallback(
    (deleted: { id: string }[]) => deleteNodes(deleted.map((n) => n.id)),
    [deleteNodes]
  );

  // Rule: rerender-functional-setstate - Stable callback
  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes }: { nodes: { id: string }[] }) => {
      const newSelectedId = selectedNodes.length === 1 ? selectedNodes[0].id : null;
      if (newSelectedId !== selectedNodeId) {
        setSelectedNodeId(newSelectedId);
      }
    },
    [selectedNodeId, setSelectedNodeId]
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodesDelete={handleNodesDelete}
      onSelectionChange={handleSelectionChange}
      nodeTypes={nodeTypes}
      isValidConnection={isValidConnection}
      deleteKeyCode={["Backspace", "Delete"]}
      fitView
      className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950"
    >
      <Background color="rgba(148, 163, 184, 0.06)" gap={16} />
      <Controls className="[&>button]:glass-subtle [&>button]:border-white/[0.08] [&>button]:text-slate-300 [&>button]:transition-button [&>button:hover]:bg-white/[0.1]" />
      <MiniMap
        nodeColor={(node) => {
          const config = nodeConfig[node.type as keyof typeof nodeConfig];
          return config?.handleColor || "#64748b";
        }}
        maskColor="rgba(15, 23, 42, 0.7)"
        className="glass-subtle rounded-xl border-white/[0.08]"
      />
    </ReactFlow>
  );
}
