# MLOps Desktop v1.3 - Script Editor Panel

## Scope
Add a right-side Properties Panel with a larger Monaco editor for comfortable code editing when a Script Node is selected.

**Note:** Resizable ScriptNode (NodeResizer) is already implemented and kept. This adds the panel ON TOP of that.

**Layout:**
```
┌──────────────────────────────────────────────────────────┐
│                       TOOLBAR                            │
├──────────┬─────────────────────────┬─────────────────────┤
│          │                         │                     │
│  Node    │        Canvas           │  Properties Panel   │
│  Palette │       (ReactFlow)       │     (350px)         │
│  (200px) │                         │                     │
│          │   [Script Node with     │  When Script node   │
│          │    small Monaco]        │  selected: Large    │
│          │                         │  Monaco editor      │
│          │                         │                     │
├──────────┴─────────────────────────┴─────────────────────┤
│                    OUTPUT PANEL                          │
└──────────────────────────────────────────────────────────┘
```

---

## Implementation

### 1. Add selection state to store

**File:** `src/stores/pipelineStore.ts`

```typescript
interface PipelineState {
  // ... existing
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
}

// In create():
selectedNodeId: null,
setSelectedNodeId: (id) => set({ selectedNodeId: id }),
```

### 2. Track selection in Canvas

**File:** `src/components/Canvas.tsx`

```typescript
const { setSelectedNodeId } = usePipelineStore();

<ReactFlow
  // ...existing props
  onSelectionChange={({ nodes }) => {
    setSelectedNodeId(nodes.length === 1 ? nodes[0].id : null);
  }}
/>
```

### 3. Create PropertiesPanel component

**File:** `src/components/PropertiesPanel.tsx` (NEW)

```typescript
export function PropertiesPanel() {
  const { nodes, selectedNodeId, updateNodeData } = usePipelineStore();
  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  if (!selectedNode) {
    return (
      <div style={{ /* empty state */ }}>
        Select a node to edit
      </div>
    );
  }

  if (selectedNode.type === "script") {
    return (
      <div style={{ /* panel styles */ }}>
        <div>Script Editor</div>
        <Editor
          height="calc(100% - 40px)"
          language="python"
          theme="vs-dark"
          value={selectedNode.data.code || ""}
          onChange={(value) => updateNodeData(selectedNodeId, { code: value || "" })}
          options={{ /* same as ScriptNode */ }}
        />
      </div>
    );
  }

  if (selectedNode.type === "dataLoader") {
    return (
      <div>
        <div>Data Loader</div>
        <div>File: {selectedNode.data.filePath || "None"}</div>
        <button onClick={/* file picker */}>Select File</button>
      </div>
    );
  }
}
```

### 4. Update App layout

**File:** `src/App.tsx`

```typescript
<div style={{ display: "flex", flex: 1 }}>
  <NodePalette />
  <Canvas />
  <PropertiesPanel />  {/* NEW */}
</div>
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/stores/pipelineStore.ts` | Add `selectedNodeId` state |
| `src/components/Canvas.tsx` | Add `onSelectionChange` handler |
| `src/components/PropertiesPanel.tsx` | NEW - Properties panel with Monaco |
| `src/App.tsx` | Add PropertiesPanel to layout |

---

## Key Points

- **Both editors sync**: Node Monaco and Panel Monaco edit same `node.data.code`
- **Panel shows contextually**: Script node → code editor, DataLoader → file picker
- **Empty state**: "Select a node to edit" when nothing selected
- **Width**: Fixed 350px, matches color scheme (#0f3460 or similar)

---

## Verification

1. `npm run build` - should pass
2. `npm run test:run` - should pass
3. `npm run tauri dev`
4. Click Script node → Properties Panel shows large Monaco editor
5. Edit code in panel → Node's Monaco updates (and vice versa)
6. Click DataLoader → Panel shows file path info
7. Click empty canvas → Panel shows "Select a node"

---

# v1.2 - Monaco Editor - COMPLETED

Changes made:
- `@monaco-editor/react@4.7.0` added
- `src/components/ScriptNode.tsx` uses Monaco with Python syntax highlighting
