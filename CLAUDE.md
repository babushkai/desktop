# MLOps Desktop

Tauri 2.0 desktop app for visual ML pipeline building, inspired by [Dify](https://github.com/langgenius/dify).

## Project Roadmap

### v1 - Visual Pipeline Builder (Current)
- Drag-and-drop ReactFlow canvas
- Node types: DataLoader, Script (more planned)
- System Python detection, subprocess execution
- Pipeline save/load to SQLite
- Real-time execution output

### v1.1 - COMPLETED
- Delete nodes (Backspace/Delete)
- Pre-run validation
- Save/Load pipelines with dirty state tracking

### v1.2 - COMPLETED
- Monaco Editor for Script nodes

### v1.3 - COMPLETED
- Script Editor side panel (PropertiesPanel)

### v1.4 - COMPLETED
- Trainer node with form-based ML configuration
- Model types: Linear Regression, Random Forest, Gradient Boosting
- Auto-generated training code with sklearn

### v1.5 - COMPLETED
- Evaluator node with auto-detect model type
- Sequential pipeline execution: DataLoader -> Trainer -> Evaluator
- Classification metrics: Accuracy, Precision, Recall, F1, Confusion Matrix
- Regression metrics: R2, MSE, RMSE, MAE

### Future Versions
- **v2 - Experiment Tracking:** Experiment/run management, metrics logging, artifact storage
- **v3 - Model Registry:** Model versioning, staging (None → Staging → Production), ONNX/CoreML export
- **v4 - Model Serving:** Local inference server, interactive playground

### Long-term Vision
- Bundled Python runtime (no user setup required)
- Full node types: DataLoader → DataSplit → Trainer → Evaluator → ModelExporter
- Metal GPU acceleration (macOS)
- Monaco Editor for Python scripts
- ECharts for metrics visualization
- TanStack Query for async data
- Tailwind CSS + shadcn/ui components

## Tech Stack
- Frontend: React 19, TypeScript, Vite, Zustand, @xyflow/react
- Backend: Rust, Tauri 2.0, SQLite (rusqlite)

## ReactFlow Node Handles

**IMPORTANT:** When adding a new node type that connects FROM an existing node, you must add BOTH handles to the source node:

```typescript
// Node that receives connections only (terminal node like Evaluator)
<Handle type="target" position={Position.Left} />

// Node that sends AND receives (middle node like Trainer)
<Handle type="target" position={Position.Left} />   // Input from DataLoader
<Handle type="source" position={Position.Right} />  // Output to Evaluator

// Node that sends only (source node like DataLoader)
<Handle type="source" position={Position.Right} />
```

**Checklist when adding new node connections:**
1. Add connection to `VALID_CONNECTIONS` in `pipelineStore.ts`
2. Add `source` Handle to the upstream node if it doesn't have one
3. Add `target` Handle to the downstream node

## XYFlow TypeScript Patterns

**Problem:** @xyflow/react v12+ has strict generic constraints that conflict with custom node data types.

**Solution:** Use type assertions instead of fighting the generics:

```typescript
// Node components - use NodeProps without generic, cast data
export function MyNode({ id, data }: NodeProps) {
  const nodeData = data as MyNodeData;
  // use nodeData.myField
}

// Store - cast applyNodeChanges/applyEdgeChanges returns
nodes: applyNodeChanges(changes, state.nodes) as Node<NodeData>[],
edges: applyEdgeChanges(changes, state.edges) as Edge[],

// Canvas - import and use NodeTypes for nodeTypes object
import { NodeTypes } from "@xyflow/react";
const nodeTypes: NodeTypes = { ... };
```

## Tauri Webview Limitations

**Problem:** `window.prompt()`, `window.confirm()`, and `window.alert()` may not work reliably in Tauri's webview.

**Solution:** Use React state-based modals instead of native browser dialogs:

```typescript
// BAD - may not work in Tauri
const name = prompt("Enter name:");

// GOOD - use state-based dialog
const [showDialog, setShowDialog] = useState(false);
const [inputValue, setInputValue] = useState("");

// Render a modal component instead
{showDialog && (
  <div className="modal">
    <input value={inputValue} onChange={e => setInputValue(e.target.value)} />
    <button onClick={handleConfirm}>Save</button>
  </div>
)}
```

## Plan Files

Store plan files in the project's `.claude/plans/` folder, not the global `~/.claude/plans/`:

```
/Users/dsuke/Projects/dev/desktop/.claude/plans/
```

## Git Workflow

**Before making code changes, always create a new branch:**

```bash
git checkout -b feat/feature-name   # For new features
git checkout -b fix/bug-name        # For bug fixes
```

**After completing changes, commit, push, and create PR:**

```bash
git add .
git commit -m "feat: add trainer node with form-based ML config"
git push -u origin feat/feature-name
gh pr create --title "feat: add trainer node" --body "Description here"
```

**Conventional Commit Tags:**
- `feat:` - New feature
- `fix:` - Bug fix
- `refactor:` - Code refactoring
- `test:` - Adding/updating tests
- `docs:` - Documentation changes
- `chore:` - Maintenance tasks

Do NOT commit directly to `main`. Create a branch, make changes, then PR.

## Commands

```bash
npm run dev          # Start Vite dev server
npm run build        # TypeScript + Vite production build
npm run tauri dev    # Full Tauri dev (frontend + Rust backend)
npm run tauri build  # Production build
npm run test         # Run Vitest in watch mode
npm run test:run     # Run tests once
```

## Architecture

**Frontend:**
- `src/stores/pipelineStore.ts` - Zustand store for nodes, edges, execution state, save/load
- `src/components/Canvas.tsx` - ReactFlow canvas wrapper
- `src/components/Toolbar.tsx` - Run/Save/Load buttons, Python path config
- `src/components/DataLoaderNode.tsx` - File picker node
- `src/components/ScriptNode.tsx` - Python code editor node
- `src/components/OutputPanel.tsx` - Script output display
- `src/lib/tauri.ts` - Tauri IPC wrappers

**Backend:**
- `src-tauri/src/commands.rs` - Tauri IPC commands (run_script, cancel_script, save/load pipeline)
- `src-tauri/src/db.rs` - SQLite database (settings + pipelines tables)
- `src-tauri/src/python.rs` - Python detection logic

**Tests:**
- `src/stores/pipelineStore.test.ts` - Store unit tests
- `src/components/Toolbar.test.tsx` - Component tests
- `src-tauri/src/db.rs` (bottom) - Rust unit tests
