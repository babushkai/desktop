import { useMemo, useCallback, useState, useEffect } from "react";
import {
  ReactFlow,
  Background,
  MiniMap,
  Connection,
  NodeTypes,
  BackgroundVariant,
  Node,
  useReactFlow,
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
import { AlignmentGuides } from "./AlignmentGuides";
import { EmptyCanvasPrompt } from "./EmptyCanvasPrompt";
import { TemplateGallery } from "./TemplateGallery";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useAlignmentGuides } from "@/hooks/useAlignmentGuides";
import { AlignType } from "@/lib/alignment";

const nodeTypes: NodeTypes = {
  dataLoader: DataLoaderNode,
  script: ScriptNode,
  dataSplit: DataSplitNode,
  trainer: TrainerNode,
  evaluator: EvaluatorNode,
  modelExporter: ModelExporterNode,
};

// GitHub-inspired node colors for minimap
const nodeColorMap: Record<string, string> = {
  dataLoader: "#3fb950",   // GitHub green
  script: "#58a6ff",       // GitHub blue
  dataSplit: "#a371f7",    // GitHub purple
  trainer: "#db61a2",      // GitHub pink
  evaluator: "#f0883e",    // GitHub orange
  modelExporter: "#79c0ff", // GitHub light blue
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
  const fitViewTrigger = usePipelineStore((s) => s.fitViewTrigger);

  const { fitView } = useReactFlow();

  // Fit view when triggered (e.g., after template load)
  useEffect(() => {
    if (fitViewTrigger > 0) {
      // Small delay to ensure nodes are rendered
      const timer = setTimeout(() => {
        fitView({ padding: 0.2, duration: 300 });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [fitViewTrigger, fitView]);

  const [canvasMode, setCanvasMode] = useState<CanvasMode>("pointer");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [showTemplateGallery, setShowTemplateGallery] = useState(false);

  // Alignment guides for drag snapping
  const { guides, checkAlignment, clearGuides } = useAlignmentGuides();

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

  // Node drag handlers for alignment guides
  const handleNodeDrag = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      checkAlignment(node, nodes);
    },
    [checkAlignment, nodes]
  );

  const handleNodeDragStop = useCallback(() => {
    clearGuides();
  }, [clearGuides]);

  const proOptions = useMemo(() => ({ hideAttribution: true }), []);

  // Get selected nodes for context menu
  const selectedNodes = getSelectedNodes();

  // Show empty canvas prompt when there are no nodes
  const showEmptyPrompt = nodes.length === 0;

  return (
    <>
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodesDelete={handleNodesDelete}
      onSelectionChange={handleSelectionChange}
      onSelectionContextMenu={handleSelectionContextMenu}
      onNodeDrag={handleNodeDrag}
      onNodeDragStop={handleNodeDragStop}
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
      <AlignmentGuides guides={guides} />
      {!showEmptyPrompt && (
        <MiniMap
          nodeColor={getNodeColor}
          maskColor="rgba(13, 17, 23, 0.85)"
          style={{
            backgroundColor: "#161b22",
            border: "1px solid #30363d",
          }}
        />
      )}
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

    {showEmptyPrompt && (
      <EmptyCanvasPrompt
        onBrowseTemplates={() => setShowTemplateGallery(true)}
      />
    )}

    <TemplateGallery
      isOpen={showTemplateGallery}
      onClose={() => setShowTemplateGallery(false)}
    />
    </>
  );
}
