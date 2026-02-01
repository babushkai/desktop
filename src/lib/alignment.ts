import { Node } from "@xyflow/react";

export type AlignType =
  | "left"
  | "center"
  | "right"
  | "top"
  | "middle"
  | "bottom"
  | "distributeHorizontal"
  | "distributeVertical";

// Default node dimensions if not available
const DEFAULT_NODE_WIDTH = 200;
const DEFAULT_NODE_HEIGHT = 100;

// Get node dimensions with fallback to defaults
function getNodeDimensions(node: Node): { width: number; height: number } {
  return {
    width: node.measured?.width ?? node.width ?? DEFAULT_NODE_WIDTH,
    height: node.measured?.height ?? node.height ?? DEFAULT_NODE_HEIGHT,
  };
}

// Get bounds of selected nodes
export function getSelectionBounds(nodes: Node[]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  if (nodes.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    const { width, height } = getNodeDimensions(node);
    const x = node.position.x;
    const y = node.position.y;

    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x + width);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y + height);
  }

  return { minX, maxX, minY, maxY };
}

// Align nodes - returns updated nodes array
export function alignNodes(nodes: Node[], alignType: AlignType): Node[] {
  if (nodes.length < 2) {
    return nodes;
  }

  // Handle distribute types
  if (alignType === "distributeHorizontal") {
    return distributeNodes(nodes, "horizontal");
  }
  if (alignType === "distributeVertical") {
    return distributeNodes(nodes, "vertical");
  }

  const bounds = getSelectionBounds(nodes);

  return nodes.map((node) => {
    const { width, height } = getNodeDimensions(node);
    let newX = node.position.x;
    let newY = node.position.y;

    switch (alignType) {
      case "left":
        newX = bounds.minX;
        break;
      case "center":
        newX = (bounds.minX + bounds.maxX) / 2 - width / 2;
        break;
      case "right":
        newX = bounds.maxX - width;
        break;
      case "top":
        newY = bounds.minY;
        break;
      case "middle":
        newY = (bounds.minY + bounds.maxY) / 2 - height / 2;
        break;
      case "bottom":
        newY = bounds.maxY - height;
        break;
    }

    return {
      ...node,
      position: { x: newX, y: newY },
    };
  });
}

// Distribute nodes evenly - returns updated nodes
export function distributeNodes(
  nodes: Node[],
  direction: "horizontal" | "vertical"
): Node[] {
  if (nodes.length < 3) {
    return nodes;
  }

  const isHorizontal = direction === "horizontal";

  // Sort nodes by position
  const sortedNodes = [...nodes].sort((a, b) => {
    return isHorizontal
      ? a.position.x - b.position.x
      : a.position.y - b.position.y;
  });

  // Get first and last node positions
  const firstNode = sortedNodes[0];
  const lastNode = sortedNodes[sortedNodes.length - 1];

  const firstDimensions = getNodeDimensions(firstNode);

  // Calculate total space and node sizes for middle nodes
  const middleNodes = sortedNodes.slice(1, -1);
  const totalMiddleSize = middleNodes.reduce((sum, node) => {
    const { width, height } = getNodeDimensions(node);
    return sum + (isHorizontal ? width : height);
  }, 0);

  // Calculate available space between first and last nodes
  const startPos = isHorizontal
    ? firstNode.position.x + firstDimensions.width
    : firstNode.position.y + firstDimensions.height;

  const endPos = isHorizontal ? lastNode.position.x : lastNode.position.y;

  const availableSpace = endPos - startPos;
  const totalGaps = middleNodes.length + 1;
  const gapSize = (availableSpace - totalMiddleSize) / totalGaps;

  // Create a map of node id to new position
  const positionMap = new Map<string, { x: number; y: number }>();

  // Keep first and last nodes in place
  positionMap.set(firstNode.id, firstNode.position);
  positionMap.set(lastNode.id, lastNode.position);

  // Position middle nodes
  let currentPos = startPos + gapSize;

  for (const node of middleNodes) {
    const { width, height } = getNodeDimensions(node);

    if (isHorizontal) {
      positionMap.set(node.id, { x: currentPos, y: node.position.y });
      currentPos += width + gapSize;
    } else {
      positionMap.set(node.id, { x: node.position.x, y: currentPos });
      currentPos += height + gapSize;
    }
  }

  // Return nodes with updated positions
  return nodes.map((node) => {
    const newPosition = positionMap.get(node.id);
    if (newPosition) {
      return {
        ...node,
        position: newPosition,
      };
    }
    return node;
  });
}
