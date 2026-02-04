import { useMemo, memo } from "react";
import {
  ReactFlow,
  Node,
  Edge,
  NodeProps,
  Handle,
  Position,
  NodeTypes,
} from "@xyflow/react";
import { TemplateNode, TemplateEdge } from "@/lib/templates";
import { cn } from "@/lib/utils";
import {
  RiDatabase2Line,
  RiGitBranchLine,
  RiRobot2Line,
  RiBarChartBoxLine,
  RiDownload2Line,
  RiCodeLine,
} from "@remixicon/react";

interface TemplatePreviewProps {
  nodes: TemplateNode[];
  edges: TemplateEdge[];
}

// Node styling by type
const NODE_STYLES: Record<string, { bg: string; border: string; icon: React.ElementType }> = {
  dataLoader: { bg: "bg-emerald-500/20", border: "border-emerald-500/50", icon: RiDatabase2Line },
  dataSplit: { bg: "bg-cyan-500/20", border: "border-cyan-500/50", icon: RiGitBranchLine },
  trainer: { bg: "bg-violet-500/20", border: "border-violet-500/50", icon: RiRobot2Line },
  evaluator: { bg: "bg-amber-500/20", border: "border-amber-500/50", icon: RiBarChartBoxLine },
  modelExporter: { bg: "bg-teal-500/20", border: "border-teal-500/50", icon: RiDownload2Line },
  script: { bg: "bg-sky-500/20", border: "border-sky-500/50", icon: RiCodeLine },
};

// Preview node component - simplified version of actual nodes
const PreviewNode = memo(function PreviewNode({ data }: NodeProps) {
  const nodeData = data as { type: string; label: string };
  const style = NODE_STYLES[nodeData.type] || { bg: "bg-gray-500/20", border: "border-gray-500/50", icon: RiCodeLine };
  const Icon = style.icon;

  return (
    <div
      className={cn(
        "px-2 py-1.5 rounded-md border backdrop-blur-sm",
        "flex items-center gap-1.5 min-w-[60px]",
        style.bg,
        style.border
      )}
    >
      <Handle type="target" position={Position.Left} className="!w-1 !h-1 !bg-white/30 !border-0 !-left-0.5" />
      <Icon className="w-3 h-3 text-white/70 flex-shrink-0" />
      <span className="text-[8px] text-white/80 font-medium truncate max-w-[50px]">
        {nodeData.label}
      </span>
      <Handle type="source" position={Position.Right} className="!w-1 !h-1 !bg-white/30 !border-0 !-right-0.5" />
    </div>
  );
});

// Node types for ReactFlow
const previewNodeTypes: NodeTypes = {
  preview: PreviewNode,
};

export function TemplatePreview({ nodes, edges }: TemplatePreviewProps) {
  // Transform template nodes to ReactFlow nodes with preview type
  const { flowNodes, flowEdges, viewportConfig } = useMemo(() => {
    if (nodes.length === 0) {
      return { flowNodes: [], flowEdges: [], viewportConfig: { x: 0, y: 0, zoom: 1 } };
    }

    // Find bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of nodes) {
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + 80); // Approximate node width
      maxY = Math.max(maxY, node.position.y + 30); // Approximate node height
    }

    const width = maxX - minX;
    const height = maxY - minY;

    // Calculate zoom to fit in preview area (220x70 with padding)
    const containerWidth = 200;
    const containerHeight = 60;
    const zoom = Math.min(
      containerWidth / width,
      containerHeight / height,
      0.5 // Max zoom
    ) * 0.85; // Scale down a bit for padding

    // Calculate center offset
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const flowNodes: Node[] = nodes.map((node) => ({
      id: node.id,
      type: "preview",
      position: node.position,
      data: { type: node.type, label: node.data.label },
      draggable: false,
      selectable: false,
      connectable: false,
    }));

    const flowEdges: Edge[] = edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "default",
      style: { stroke: "rgba(255,255,255,0.25)", strokeWidth: 1.5 },
      animated: false,
    }));

    return {
      flowNodes,
      flowEdges,
      viewportConfig: {
        x: containerWidth / 2 - centerX * zoom,
        y: containerHeight / 2 - centerY * zoom,
        zoom,
      },
    };
  }, [nodes, edges]);

  if (nodes.length === 0) {
    return <div className="h-20 w-full" />;
  }

  return (
    <div className="h-20 w-full overflow-hidden rounded">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={previewNodeTypes}
        defaultViewport={viewportConfig}
        proOptions={{ hideAttribution: true }}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        preventScrolling={false}
        className="pointer-events-none"
      />
    </div>
  );
}
