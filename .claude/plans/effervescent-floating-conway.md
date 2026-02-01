# MLOps Desktop v1.2 - Monaco Editor

## Scope
Replace textarea with Monaco Editor in ScriptNode for Python syntax highlighting.

## Why Monaco?
- Python syntax highlighting out of the box
- Line numbers, auto-indent
- Dark theme matches app design
- Professional code editing experience

---

## Implementation

### 1. Install dependency
```bash
npm install @monaco-editor/react
```

### 2. Update ScriptNode.tsx

**Before (textarea):**
```typescript
<textarea
  value={nodeData.code || ""}
  onChange={handleCodeChange}
  placeholder="# Write your Python code here..."
  style={{ ... }}
/>
```

**After (Monaco):**
```typescript
import Editor from "@monaco-editor/react";

<div className="nodrag" style={{ border: "1px solid #394867", borderRadius: 4 }}>
  <Editor
    height="150px"
    language="python"
    theme="vs-dark"
    value={nodeData.code || ""}
    onChange={(value) => updateNodeData(id, { code: value || "" })}
    options={{
      minimap: { enabled: false },
      fontSize: 12,
      lineNumbers: "on",
      scrollBeyondLastLine: false,
      automaticLayout: true,
      padding: { top: 8 },
    }}
  />
</div>
```

### 3. Key considerations

**ReactFlow drag conflict:**
- Monaco captures mouse events for text selection
- Wrap in `<div className="nodrag">` to prevent node dragging when editing

**onChange signature:**
- Textarea: `onChange={(e) => updateNodeData(id, { code: e.target.value })}`
- Monaco: `onChange={(value) => updateNodeData(id, { code: value || "" })}`

---

## Files to Modify

| File | Change |
|------|--------|
| `package.json` | Add `@monaco-editor/react` dependency |
| `src/components/ScriptNode.tsx` | Replace textarea with Monaco Editor |

---

## Verification

1. `npm install @monaco-editor/react`
2. `npm run build` - should pass
3. `npm run test:run` - should pass (23 tests)
4. `npm run tauri dev`
5. Add Script node
6. Type Python code - syntax highlighting works
7. Click and drag node - editor doesn't interfere
8. Edit code, run pipeline - code executes correctly

---

## Status: IMPLEMENTED

This plan was created retroactively. The implementation is already complete.

Changes made:
- `@monaco-editor/react@4.7.0` added to dependencies
- `src/components/ScriptNode.tsx` updated with Monaco Editor
- Build passes, 23 tests pass
