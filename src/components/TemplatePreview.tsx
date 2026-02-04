import { useMemo } from "react";
import { TemplateNode, TemplateEdge } from "@/lib/templates";
import { cn } from "@/lib/utils";

interface TemplatePreviewProps {
  nodes: TemplateNode[];
  edges: TemplateEdge[];
}

// Node colors by type
const NODE_COLORS: Record<string, string> = {
  dataLoader: "bg-emerald-500",
  dataSplit: "bg-cyan-500",
  trainer: "bg-violet-500",
  evaluator: "bg-amber-500",
  modelExporter: "bg-teal-500",
  script: "bg-sky-500",
};

// Node icon letters
const NODE_ICONS: Record<string, string> = {
  dataLoader: "D",
  dataSplit: "S",
  trainer: "T",
  evaluator: "E",
  modelExporter: "X",
  script: "P",
};

export function TemplatePreview({ nodes, edges }: TemplatePreviewProps) {
  // Calculate scaled positions for the preview
  const { scaledNodes, lines } = useMemo(() => {
    if (nodes.length === 0) {
      return { scaledNodes: [], lines: [] };
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

    // Preview container size (accounting for padding and node size)
    const containerWidth = 220;
    const containerHeight = 50;
    const nodeSize = 24;

    // Scale to fit
    const scaleX = (containerWidth - nodeSize) / (width || 1);
    const scaleY = (containerHeight - nodeSize) / (height || 1);
    const scale = Math.min(scaleX, scaleY, 0.15); // Cap scale

    // Create node positions map
    const nodePositions = new Map<string, { x: number; y: number }>();

    const scaledNodes = nodes.map((node) => {
      const x = (node.position.x - minX) * scale + 10;
      const y = (node.position.y - minY) * scale + 10;
      nodePositions.set(node.id, { x: x + nodeSize / 2, y: y + nodeSize / 2 });

      return {
        id: node.id,
        type: node.type,
        x,
        y,
      };
    });

    // Create edge lines
    const lines = edges.map((edge) => {
      const source = nodePositions.get(edge.source);
      const target = nodePositions.get(edge.target);
      if (!source || !target) return null;

      return {
        id: edge.id,
        x1: source.x,
        y1: source.y,
        x2: target.x,
        y2: target.y,
      };
    }).filter(Boolean) as { id: string; x1: number; y1: number; x2: number; y2: number }[];

    return { scaledNodes, lines };
  }, [nodes, edges]);

  return (
    <div className="h-20 w-full relative overflow-hidden">
      {/* Edge lines */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {lines.map((line) => (
          <line
            key={line.id}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke="rgba(255,255,255,0.2)"
            strokeWidth={1.5}
          />
        ))}
      </svg>

      {/* Nodes */}
      {scaledNodes.map((node) => (
        <div
          key={node.id}
          className={cn(
            "absolute w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold text-white/90 shadow-sm",
            NODE_COLORS[node.type] || "bg-gray-500"
          )}
          style={{
            left: node.x,
            top: node.y,
          }}
        >
          {NODE_ICONS[node.type] || "?"}
        </div>
      ))}
    </div>
  );
}
