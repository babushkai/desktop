import { useMemo, useCallback, useState } from "react";
import {
  ReactFlow,
  Background,
  MiniMap,
  Connection,
  NodeTypes,
  BackgroundVariant,
  Node,
} from "@xyflow/react";
import { usePipelineStore, VALID_CONNECTIONS } from "../stores/pipelineStore";
import { DataLoaderNode } from "./DataLoaderNode";
import { ScriptNode } from "./ScriptNode";
import { DataSplitNode } from "./DataSplitNode";
import { TrainerNode } from "./TrainerNode";
import { EvaluatorNode } from "./EvaluatorNode";
import { ModelExporterNode } from "./ModelExporterNode";
import { CanvasControls, CanvasMode } from "./CanvasControls";
import { ZoomControls } from "./ZoomControls";
import { SelectionContextMenu } from "./SelectionContextMenu";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { AlignType } from "@/lib/alignment";

const nodeTypes: NodeTypes = {
  dataLoader: DataLoaderNode,
  script: ScriptNode,
  dataSplit: DataSplitNode,
  trainer: TrainerNode,
  evaluator: EvaluatorNode,
  modelExporter: ModelExporterNode,
};

const nodeColorMap: Record<string, string> = {
  dataLoader: "#34d399",
  script: "#38bdf8",
  dataSplit: "#e879f9",
  trainer: "#a78bfa",
  evaluator: "#fb923c",
  modelExporter: "#2dd4bf",
};

export function Canvas() {
  const nodes = usePipelineStore((s) => s.nodes);
  const edges = usePipelineStore((s) => s.edges);
  const onNodesChange = usePipelineStore((s) => s.onNodesChange);
  const onEdgesChange = usePipelineStore((s) => s.onEdgesChange);
  const onConnect = usePipelineStore((s) => s.onConnect);
  const deleteNodes = usePipelineStore((s) => s.deleteNodes);
  const selectedNodeId = usePipelineStore((s) => s.selectedNodeId);
  const setSelectedNodeId = usePipelineStore((s) => s.setSelectedNodeId);
  const selectAllNodes = usePipelineStore((s) => s.selectAllNodes);
  const deselectAllNodes = usePipelineStore((s) => s.deselectAllNodes);
  const duplicateSelectedNodes = usePipelineStore((s) => s.duplicateSelectedNodes);
  const alignSelectedNodes = usePipelineStore((s) => s.alignSelectedNodes);
  const distributeSelectedNodes = usePipelineStore((s) => s.distributeSelectedNodes);
  const getSelectedNodes = usePipelineStore((s) => s.getSelectedNodes);

  const [canvasMode, setCanvasMode] = useState<CanvasMode>("pointer");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Close context menu helper
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onSelectAll: selectAllNodes,
    onDuplicate: duplicateSelectedNodes,
    onDeselect: deselectAllNodes,
    onAlignLeft: () => alignSelectedNodes("left"),
    onAlignRight: () => alignSelectedNodes("right"),
    onAlignCenter: () => alignSelectedNodes("center"),
  });

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

  const handleNodesDelete = useCallback(
    (deleted: Node[]) => {
      deleteNodes(deleted.map((n) => n.id));
    },
    [deleteNodes]
  );

  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes }: { nodes: Node[] }) => {
      const newSelectedId = selectedNodes.length === 1 ? selectedNodes[0].id : null;
      if (newSelectedId !== selectedNodeId) {
        setSelectedNodeId(newSelectedId);
      }
    },
    [selectedNodeId, setSelectedNodeId]
  );

  const getNodeColor = useCallback((node: Node) => {
    return nodeColorMap[node.type || ""] || "#64748b";
  }, []);

  // Handle right-click on selection
  const handleSelectionContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      const selectedNodes = getSelectedNodes();
      if (selectedNodes.length >= 2) {
        setContextMenu({ x: event.clientX, y: event.clientY });
      }
    },
    [getSelectedNodes]
  );

  // Context menu action handlers
  const handleAlign = useCallback(
    (alignType: AlignType) => {
      alignSelectedNodes(alignType);
      closeContextMenu();
    },
    [alignSelectedNodes, closeContextMenu]
  );

  const handleDistribute = useCallback(
    (direction: "horizontal" | "vertical") => {
      distributeSelectedNodes(direction);
      closeContextMenu();
    },
    [distributeSelectedNodes, closeContextMenu]
  );

  const handleDeleteSelected = useCallback(() => {
    const selectedNodes = getSelectedNodes();
    deleteNodes(selectedNodes.map((n) => n.id));
    closeContextMenu();
  }, [getSelectedNodes, deleteNodes, closeContextMenu]);

  const proOptions = useMemo(() => ({ hideAttribution: true }), []);

  // Get selected nodes for context menu
  const selectedNodes = getSelectedNodes();

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodesDelete={handleNodesDelete}
      onSelectionChange={handleSelectionChange}
      onSelectionContextMenu={handleSelectionContextMenu}
      nodeTypes={nodeTypes}
      isValidConnection={isValidConnection}
      deleteKeyCode={["Backspace", "Delete"]}
      panOnDrag={canvasMode === "hand"}
      selectionOnDrag={canvasMode === "pointer"}
      fitView
      proOptions={proOptions}
      className="bg-background"
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1}
        color="rgba(148, 163, 184, 0.15)"
      />
      <CanvasControls onModeChange={setCanvasMode} />
      <ZoomControls />
      <MiniMap nodeColor={getNodeColor} maskColor="rgba(10, 10, 15, 0.8)" />
      {contextMenu && selectedNodes.length >= 2 && (
        <SelectionContextMenu
          position={contextMenu}
          selectedNodes={selectedNodes}
          onAlign={handleAlign}
          onDistribute={handleDistribute}
          onDelete={handleDeleteSelected}
          onClose={closeContextMenu}
        />
      )}
    </ReactFlow>
  );
}
