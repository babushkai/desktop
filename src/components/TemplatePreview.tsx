import { useMemo } from "react";
import { TemplateNode, TemplateEdge } from "@/lib/templates";

interface TemplatePreviewProps {
  nodes: TemplateNode[];
  edges: TemplateEdge[];
}

// Node colors by type
const NODE_COLORS: Record<string, string> = {
  dataLoader: "#34d399",
  dataSplit: "#22d3ee",
  trainer: "#a78bfa",
  evaluator: "#fbbf24",
  modelExporter: "#2dd4bf",
  script: "#38bdf8",
};

export function TemplatePreview({ nodes, edges }: TemplatePreviewProps) {
  // Calculate scaled positions for the preview
  const { scaledNodes, lines, viewBox } = useMemo(() => {
    if (nodes.length === 0) {
      return { scaledNodes: [], lines: [], viewBox: "0 0 100 100" };
    }

    // Find bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const nodeWidth = 70;
    const nodeHeight = 24;

    for (const node of nodes) {
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + nodeWidth);
      maxY = Math.max(maxY, node.position.y + nodeHeight);
    }

    // Add padding
    const padding = 10;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const width = maxX - minX;
    const height = maxY - minY;

    // Create node positions map for edge calculation
    const nodePositions = new Map<string, { x: number; y: number; width: number; height: number }>();

    const scaledNodes = nodes.map((node) => {
      const x = node.position.x - minX;
      const y = node.position.y - minY;
      nodePositions.set(node.id, {
        x,
        y,
        width: nodeWidth,
        height: nodeHeight,
      });

      return {
        id: node.id,
        type: node.type,
        label: node.data.label,
        x,
        y,
      };
    });

    // Create edge lines (from right edge of source to left edge of target)
    const lines = edges.map((edge) => {
      const source = nodePositions.get(edge.source);
      const target = nodePositions.get(edge.target);
      if (!source || !target) return null;

      return {
        id: edge.id,
        x1: source.x + source.width,
        y1: source.y + source.height / 2,
        x2: target.x,
        y2: target.y + target.height / 2,
      };
    }).filter(Boolean) as { id: string; x1: number; y1: number; x2: number; y2: number }[];

    return {
      scaledNodes,
      lines,
      viewBox: `0 0 ${width} ${height}`,
    };
  }, [nodes, edges]);

  if (nodes.length === 0) {
    return <div className="h-20 w-full" />;
  }

  return (
    <div className="h-20 w-full overflow-hidden rounded relative">
      <svg
        viewBox={viewBox}
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Edge lines */}
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

        {/* Nodes */}
        {scaledNodes.map((node) => {
          const color = NODE_COLORS[node.type] || NODE_COLORS.script;

          return (
            <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
              {/* Node background */}
              <rect
                x={0}
                y={0}
                width={70}
                height={24}
                rx={4}
                fill="rgba(0,0,0,0.3)"
                stroke={color}
                strokeWidth={1}
                strokeOpacity={0.5}
              />
              {/* Icon circle */}
              <circle
                cx={12}
                cy={12}
                r={6}
                fill={color}
                fillOpacity={0.3}
              />
              {/* Label */}
              <text
                x={24}
                y={15}
                fontSize={8}
                fill="rgba(255,255,255,0.7)"
                className="select-none"
              >
                {node.label.length > 8 ? node.label.slice(0, 8) + "…" : node.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
