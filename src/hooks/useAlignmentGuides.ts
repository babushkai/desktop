import { useState, useCallback, useMemo } from "react";
import { Node } from "@xyflow/react";

/**
 * Represents a visual alignment guide line
 */
export interface AlignmentGuide {
  type: "horizontal" | "vertical";
  position: number; // x for vertical, y for horizontal
  start: number; // start coordinate (y for vertical, x for horizontal)
  end: number; // end coordinate (y for vertical, x for horizontal)
}

/**
 * Snap position result when a node is within alignment threshold
 */
export interface SnapPosition {
  x?: number;
  y?: number;
}

export interface UseAlignmentGuidesReturn {
  guides: AlignmentGuide[];
  checkAlignment: (draggingNode: Node, allNodes: Node[]) => SnapPosition | null;
  clearGuides: () => void;
}

// Pixel threshold for alignment detection
const THRESHOLD = 5;

// Default node dimensions if not available
const DEFAULT_NODE_WIDTH = 200;
const DEFAULT_NODE_HEIGHT = 100;

/**
 * Get node dimensions with fallback to defaults
 */
function getNodeDimensions(node: Node): { width: number; height: number } {
  return {
    width: node.measured?.width ?? node.width ?? DEFAULT_NODE_WIDTH,
    height: node.measured?.height ?? node.height ?? DEFAULT_NODE_HEIGHT,
  };
}

/**
 * Get edge positions for a node
 */
function getNodeEdges(node: Node): {
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;
} {
  const { width, height } = getNodeDimensions(node);
  const left = node.position.x;
  const top = node.position.y;
  const right = left + width;
  const bottom = top + height;
  const centerX = left + width / 2;
  const centerY = top + height / 2;

  return { left, right, top, bottom, centerX, centerY };
}

/**
 * Custom hook for visual alignment guides while dragging nodes.
 *
 * Detects alignment between the dragging node and all other nodes:
 * - Left edge to left edge
 * - Right edge to right edge
 * - Center to center (horizontal)
 * - Top edge to top edge
 * - Bottom edge to bottom edge
 * - Center to center (vertical)
 *
 * Returns guide lines to display and snap positions when within threshold.
 */
export function useAlignmentGuides(): UseAlignmentGuidesReturn {
  const [guides, setGuides] = useState<AlignmentGuide[]>([]);

  const checkAlignment = useCallback(
    (draggingNode: Node, allNodes: Node[]): SnapPosition | null => {
      // Filter out the dragging node from comparison
      const otherNodes = allNodes.filter((n) => n.id !== draggingNode.id);

      if (otherNodes.length === 0) {
        setGuides([]);
        return null;
      }

      const draggingEdges = getNodeEdges(draggingNode);
      const { width: draggingWidth, height: draggingHeight } =
        getNodeDimensions(draggingNode);

      const newGuides: AlignmentGuide[] = [];
      let snapX: number | undefined;
      let snapY: number | undefined;

      for (const otherNode of otherNodes) {
        const otherEdges = getNodeEdges(otherNode);

        // --- Vertical alignment checks (x-axis) ---

        // Left edge to left edge
        if (Math.abs(draggingEdges.left - otherEdges.left) <= THRESHOLD) {
          const minY = Math.min(draggingEdges.top, otherEdges.top);
          const maxY = Math.max(draggingEdges.bottom, otherEdges.bottom);
          newGuides.push({
            type: "vertical",
            position: otherEdges.left,
            start: minY,
            end: maxY,
          });
          if (snapX === undefined) {
            snapX = otherEdges.left;
          }
        }

        // Right edge to right edge
        if (Math.abs(draggingEdges.right - otherEdges.right) <= THRESHOLD) {
          const minY = Math.min(draggingEdges.top, otherEdges.top);
          const maxY = Math.max(draggingEdges.bottom, otherEdges.bottom);
          newGuides.push({
            type: "vertical",
            position: otherEdges.right,
            start: minY,
            end: maxY,
          });
          if (snapX === undefined) {
            snapX = otherEdges.right - draggingWidth;
          }
        }

        // Center to center (horizontal alignment - vertical line)
        if (Math.abs(draggingEdges.centerX - otherEdges.centerX) <= THRESHOLD) {
          const minY = Math.min(draggingEdges.top, otherEdges.top);
          const maxY = Math.max(draggingEdges.bottom, otherEdges.bottom);
          newGuides.push({
            type: "vertical",
            position: otherEdges.centerX,
            start: minY,
            end: maxY,
          });
          if (snapX === undefined) {
            snapX = otherEdges.centerX - draggingWidth / 2;
          }
        }

        // --- Horizontal alignment checks (y-axis) ---

        // Top edge to top edge
        if (Math.abs(draggingEdges.top - otherEdges.top) <= THRESHOLD) {
          const minX = Math.min(draggingEdges.left, otherEdges.left);
          const maxX = Math.max(draggingEdges.right, otherEdges.right);
          newGuides.push({
            type: "horizontal",
            position: otherEdges.top,
            start: minX,
            end: maxX,
          });
          if (snapY === undefined) {
            snapY = otherEdges.top;
          }
        }

        // Bottom edge to bottom edge
        if (Math.abs(draggingEdges.bottom - otherEdges.bottom) <= THRESHOLD) {
          const minX = Math.min(draggingEdges.left, otherEdges.left);
          const maxX = Math.max(draggingEdges.right, otherEdges.right);
          newGuides.push({
            type: "horizontal",
            position: otherEdges.bottom,
            start: minX,
            end: maxX,
          });
          if (snapY === undefined) {
            snapY = otherEdges.bottom - draggingHeight;
          }
        }

        // Center to center (vertical alignment - horizontal line)
        if (Math.abs(draggingEdges.centerY - otherEdges.centerY) <= THRESHOLD) {
          const minX = Math.min(draggingEdges.left, otherEdges.left);
          const maxX = Math.max(draggingEdges.right, otherEdges.right);
          newGuides.push({
            type: "horizontal",
            position: otherEdges.centerY,
            start: minX,
            end: maxX,
          });
          if (snapY === undefined) {
            snapY = otherEdges.centerY - draggingHeight / 2;
          }
        }
      }

      // Deduplicate guides by combining guides with same type and position
      const uniqueGuides = deduplicateGuides(newGuides);
      setGuides(uniqueGuides);

      // Return snap position if any alignment was found
      if (snapX !== undefined || snapY !== undefined) {
        return { x: snapX, y: snapY };
      }

      return null;
    },
    []
  );

  const clearGuides = useCallback(() => {
    setGuides([]);
  }, []);

  return useMemo(
    () => ({
      guides,
      checkAlignment,
      clearGuides,
    }),
    [guides, checkAlignment, clearGuides]
  );
}

/**
 * Deduplicate guides by merging guides with the same type and position
 */
function deduplicateGuides(guides: AlignmentGuide[]): AlignmentGuide[] {
  const guideMap = new Map<string, AlignmentGuide>();

  for (const guide of guides) {
    const key = `${guide.type}-${guide.position}`;
    const existing = guideMap.get(key);

    if (existing) {
      // Merge by extending the start/end range
      existing.start = Math.min(existing.start, guide.start);
      existing.end = Math.max(existing.end, guide.end);
    } else {
      guideMap.set(key, { ...guide });
    }
  }

  return Array.from(guideMap.values());
}
