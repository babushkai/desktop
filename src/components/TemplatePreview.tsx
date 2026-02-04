import { useMemo } from "react";
import { ReactFlow, NodeTypes, Node, Edge } from "@xyflow/react";
import { TemplateNode, TemplateEdge } from "@/lib/templates";
import { cn } from "@/lib/utils";

interface TemplatePreviewProps {
  nodes: TemplateNode[];
  edges: TemplateEdge[];
}

// Simplified preview node component
function PreviewNode({ data }: { data: { label: string; type: string } }) {
  const bgColor = useMemo(() => {
    switch (data.type) {
      case "dataLoader":
        return "bg-blue-500/30";
      case "dataSplit":
        return "bg-cyan-500/30";
      case "trainer":
        return "bg-green-500/30";
      case "evaluator":
        return "bg-amber-500/30";
      case "modelExporter":
        return "bg-purple-500/30";
      case "script":
        return "bg-pink-500/30";
      default:
        return "bg-gray-500/30";
    }
  }, [data.type]);

  const iconLetter = useMemo(() => {
    switch (data.type) {
      case "dataLoader":
        return "D";
      case "dataSplit":
        return "S";
      case "trainer":
        return "T";
      case "evaluator":
        return "E";
      case "modelExporter":
        return "X";
      case "script":
        return "P";
      default:
        return "?";
    }
  }, [data.type]);

  return (
    <div
      className={cn(
        "w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold text-white/80",
        bgColor
      )}
    >
      {iconLetter}
    </div>
  );
}

const previewNodeTypes: NodeTypes = {
  previewNode: PreviewNode,
};

export function TemplatePreview({ nodes, edges }: TemplatePreviewProps) {
  // Calculate bounds and scale nodes to fit preview container
  const { scaledNodes, scaledEdges } = useMemo(() => {
    if (nodes.length === 0) {
      return { scaledNodes: [], scaledEdges: [] };
    }

    // Find bounding box
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    for (const node of nodes) {
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x);
      maxY = Math.max(maxY, node.position.y);
    }

    const width = maxX - minX || 1;
    const height = maxY - minY || 1;

    // Preview container is roughly 280x80 (minus padding)
    const containerWidth = 250;
    const containerHeight = 60;

    // Scale to fit with some padding
    const scale = Math.min(
      containerWidth / (width + 100),
      containerHeight / (height + 50)
    );

    // Center offset
    const offsetX = (containerWidth - width * scale) / 2;
    const offsetY = (containerHeight - height * scale) / 2;

    const scaledNodes: Node[] = nodes.map((node) => ({
      id: node.id,
      type: "previewNode",
      position: {
        x: (node.position.x - minX) * scale + offsetX,
        y: (node.position.y - minY) * scale + offsetY,
      },
      data: { label: node.data.label, type: node.type },
      draggable: false,
      selectable: false,
    }));

    const scaledEdges: Edge[] = edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "smoothstep",
      style: { stroke: "rgba(255,255,255,0.2)", strokeWidth: 1 },
    }));

    return { scaledNodes, scaledEdges };
  }, [nodes, edges]);

  return (
    <div className="h-20 w-full pointer-events-none">
      <ReactFlow
        nodes={scaledNodes}
        edges={scaledEdges}
        nodeTypes={previewNodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
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
        minZoom={0.1}
        maxZoom={2}
      />
    </div>
  );
}
