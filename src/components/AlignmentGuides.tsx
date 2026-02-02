import { memo } from "react";
import { useViewport } from "@xyflow/react";
import { AlignmentGuide } from "@/hooks/useAlignmentGuides";

interface AlignmentGuidesProps {
  guides: AlignmentGuide[];
}

/**
 * SVG component that renders alignment guide lines over the ReactFlow canvas.
 *
 * - Horizontal guides render as horizontal lines at a fixed y position
 * - Vertical guides render as vertical lines at a fixed x position
 * - Uses cyan color (#22d3ee) with transparency
 * - Dashed stroke style for visual distinction
 */
function AlignmentGuidesComponent({ guides }: AlignmentGuidesProps) {
  const { x: viewportX, y: viewportY, zoom } = useViewport();

  if (guides.length === 0) {
    return null;
  }

  // Transform flow coordinates to screen coordinates
  const toScreenX = (flowX: number) => flowX * zoom + viewportX;
  const toScreenY = (flowY: number) => flowY * zoom + viewportY;

  return (
    <svg
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 1000,
      }}
    >
      {guides.map((guide, index) => {
        if (guide.type === "horizontal") {
          // Horizontal line at a fixed y position
          const screenY = toScreenY(guide.position);
          const screenStartX = toScreenX(guide.start);
          const screenEndX = toScreenX(guide.end);

          return (
            <line
              key={`h-${index}-${guide.position}`}
              x1={screenStartX}
              y1={screenY}
              x2={screenEndX}
              y2={screenY}
              stroke="#22d3ee"
              strokeWidth={1}
              strokeDasharray="4 2"
              strokeOpacity={0.8}
            />
          );
        } else {
          // Vertical line at a fixed x position
          const screenX = toScreenX(guide.position);
          const screenStartY = toScreenY(guide.start);
          const screenEndY = toScreenY(guide.end);

          return (
            <line
              key={`v-${index}-${guide.position}`}
              x1={screenX}
              y1={screenStartY}
              x2={screenX}
              y2={screenEndY}
              stroke="#22d3ee"
              strokeWidth={1}
              strokeDasharray="4 2"
              strokeOpacity={0.8}
            />
          );
        }
      })}
    </svg>
  );
}

export const AlignmentGuides = memo(AlignmentGuidesComponent);
