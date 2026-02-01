# MLOps Desktop v1.3 - Resizable Script Node

## Scope
Add NodeResizer to ScriptNode so users can resize the Monaco Editor.

---

## Implementation

### 1. Add NodeResizer to ScriptNode

```typescript
import { Handle, Position, NodeProps, NodeResizer } from "@xyflow/react";

export function ScriptNode({ id, data, selected }: NodeProps) {
  // ...existing code...

  return (
    <>
      <NodeResizer
        minWidth={300}
        minHeight={200}
        isVisible={selected}
      />
      <div style={{ width: "100%", height: "100%", /* ...rest */ }}>
        {/* ...existing content... */}
      </div>
    </>
  );
}
```

### 2. Update container to use flexbox

```typescript
<div style={{
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  backgroundColor: "#1e3a5f",
  border: `2px solid ${borderColor}`,
  borderRadius: 8,
  padding: 12,
  boxSizing: "border-box",
  overflow: "hidden",
}}>
```

### 3. Make editor fill available space

```typescript
<div className="nodrag" style={{
  flex: 1,
  border: "1px solid #394867",
  borderRadius: 4,
  minHeight: 100,
}}>
  <Editor
    height="100%"  // Changed from "150px"
    // ...rest unchanged
  />
</div>
```

### 4. Set default node dimensions in addNode

```typescript
// pipelineStore.ts - addNode function
const newNode: Node<NodeData> = {
  id,
  type,
  position,
  data: { label: type === "dataLoader" ? "Data Loader" : "Script" },
  style: type === "script" ? { width: 320, height: 280 } : undefined,
};
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/ScriptNode.tsx` | Add NodeResizer, flexbox layout, height="100%" |
| `src/stores/pipelineStore.ts` | Set default dimensions for script nodes |

---

## Key Points

- `isVisible={selected}` - resize handles only show when node selected
- `automaticLayout: true` on Monaco auto-adapts to container size
- `nodrag` class preserved - editor still works without drag conflicts
- No need to persist dimensions manually - ReactFlow tracks node.style automatically
- Dimensions save with pipeline (already in JSON blob)

---

## Verification

1. `npm run build` - should pass
2. `npm run test:run` - should pass
3. `npm run tauri dev`
4. Add Script node → default size 320x280
5. Select node → resize handles appear
6. Drag corner → node and editor resize together
7. Monaco editor fills available space
8. Save pipeline → reload → dimensions preserved

---

# v1.2 - Monaco Editor - COMPLETED

Changes made:
- `@monaco-editor/react@4.7.0` added
- `src/components/ScriptNode.tsx` uses Monaco with Python syntax highlighting
