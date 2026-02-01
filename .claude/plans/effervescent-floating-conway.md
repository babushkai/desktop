# MLOps Desktop v1.4 - Trainer Node

## Scope
Add a Trainer node with form-based configuration that generates training code automatically.

**Connections:** DataLoader → Trainer only (Script → Trainer deferred)

**Pipeline Flow:**
```
DataLoader ─→ Trainer ─→ (future: Evaluator)
```

---

## Implementation

### 1. Extend NodeData type

**File:** `src/stores/pipelineStore.ts`

```typescript
export type NodeData = {
  label: string;
  filePath?: string;           // DataLoader
  code?: string;               // Script
  // Trainer fields (only what's actually used):
  modelType?: string;          // "linear_regression" | "random_forest" | "gradient_boosting"
  targetColumn?: string;       // Column to predict
  testSplit?: number;          // Test set ratio (0.2 = 20%)
};
```

Note: Removed `epochs` and `learningRate` - not used by sklearn's LinearRegression/RandomForest/GradientBoosting.

### 2. Create TrainerNode component

**File:** `src/components/TrainerNode.tsx` (NEW)

```typescript
export function TrainerNode({ id, data }: NodeProps) {
  const nodeData = data as NodeData;
  const updateNodeData = usePipelineStore((s) => s.updateNodeData);
  const executionStatus = usePipelineStore((s) => s.executionStatus);

  return (
    <div style={{
      backgroundColor: "#4c1d95",  // Purple theme
      border: "2px solid #a78bfa",
      borderRadius: 8,
      padding: 12,
      minWidth: 220,
    }}>
      <Handle type="target" position={Position.Left} />

      <div style={{ color: "#a78bfa", fontSize: 12, marginBottom: 8 }}>
        🧠 Trainer
      </div>

      {/* Model Type Dropdown */}
      <label style={{ fontSize: 10, color: "#9ca3af" }}>Model</label>
      <select value={nodeData.modelType || "linear_regression"}
        onChange={(e) => updateNodeData(id, { modelType: e.target.value })}
        style={{ width: "100%", marginBottom: 8 }}>
        <option value="linear_regression">Linear Regression</option>
        <option value="random_forest">Random Forest</option>
        <option value="gradient_boosting">Gradient Boosting</option>
      </select>

      {/* Target Column Input */}
      <label style={{ fontSize: 10, color: "#9ca3af" }}>Target Column</label>
      <input placeholder="e.g. price"
        value={nodeData.targetColumn || ""}
        onChange={(e) => updateNodeData(id, { targetColumn: e.target.value })}
        style={{ width: "100%", marginBottom: 8 }} />

      {/* Test Split Slider */}
      <label style={{ fontSize: 10, color: "#9ca3af" }}>
        Test Split: {((nodeData.testSplit || 0.2) * 100).toFixed(0)}%
      </label>
      <input type="range" min="0.1" max="0.5" step="0.05"
        value={nodeData.testSplit || 0.2}
        onChange={(e) => updateNodeData(id, { testSplit: parseFloat(e.target.value) })}
        style={{ width: "100%" }} />

      {/* No output handle - nothing connects to Trainer yet */}
    </div>
  );
}
```

Note: Output handle removed until Evaluator node exists.

### 3. Update connection validation (single source of truth)

**File:** `src/stores/pipelineStore.ts` - Define valid connections in one place:

```typescript
// At top of file
const VALID_CONNECTIONS: [string, string][] = [
  ["dataLoader", "script"],
  ["dataLoader", "trainer"],
];

// In onConnect:
onConnect: (connection) => {
  const { nodes } = get();
  const sourceNode = nodes.find((n) => n.id === connection.source);
  const targetNode = nodes.find((n) => n.id === connection.target);

  const isValid = VALID_CONNECTIONS.some(
    ([src, tgt]) => sourceNode?.type === src && targetNode?.type === tgt
  );

  if (isValid) {
    set((state) => ({
      edges: addEdge(connection, state.edges),
      isDirty: true,
    }));
  }
},
```

**File:** `src/components/Canvas.tsx` - Use same validation:

```typescript
import { VALID_CONNECTIONS } from "../stores/pipelineStore";

const isValidConnection = (connection) => {
  const sourceNode = nodes.find((n) => n.id === connection.source);
  const targetNode = nodes.find((n) => n.id === connection.target);

  return VALID_CONNECTIONS.some(
    ([src, tgt]) => sourceNode?.type === src && targetNode?.type === tgt
  );
};
```

Note: Only DataLoader → Trainer allowed. Script → Trainer removed (undefined output contract).

### 4. Register node type

**File:** `src/components/Canvas.tsx`

```typescript
import { TrainerNode } from "./TrainerNode";

const nodeTypes: NodeTypes = {
  dataLoader: DataLoaderNode,
  script: ScriptNode,
  trainer: TrainerNode,  // NEW
};
```

### 5. Add to NodePalette

**File:** `src/components/NodePalette.tsx`

```typescript
<button onClick={() => addNode("trainer", { x: 400, y: 100 + Math.random() * 100 })}>
  🧠 Trainer
</button>
```

### 6. Update addNode in store

**File:** `src/stores/pipelineStore.ts`

```typescript
addNode: (type: "dataLoader" | "script" | "trainer", position) => {
  const id = `${type}-${++nodeIdCounter}`;
  const defaults: Partial<NodeData> = {
    dataLoader: { label: "Data Loader" },
    script: { label: "Script", code: "# Python code..." },
    trainer: {
      label: "Trainer",
      modelType: "linear_regression",
      targetColumn: "",
      testSplit: 0.2,
    },
  };

  const newNode: Node<NodeData> = {
    id,
    type,
    position,
    data: defaults[type] as NodeData,
  };
  // ...
},
```

### 7. Generate training code (execution)

**File:** `src/lib/trainerCodeGen.ts` (NEW)

Use lookup table for models, sanitize inputs, add error handling:

```typescript
import { NodeData } from "../stores/pipelineStore";

const MODEL_CONFIG: Record<string, { module: string; class: string }> = {
  linear_regression: { module: 'sklearn.linear_model', class: 'LinearRegression' },
  random_forest: { module: 'sklearn.ensemble', class: 'RandomForestRegressor' },
  gradient_boosting: { module: 'sklearn.ensemble', class: 'GradientBoostingRegressor' },
};

// Sanitize file path for embedding in Python string
const sanitizePath = (p: string): string =>
  p.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

export const generateTrainerCode = (nodeData: NodeData, inputPath: string): string => {
  const config = MODEL_CONFIG[nodeData.modelType || 'linear_regression'];
  const targetCol = nodeData.targetColumn?.replace(/"/g, '\\"') || 'target';
  const testSplit = nodeData.testSplit || 0.2;
  const safePath = sanitizePath(inputPath);

  return `
import sys
import pandas as pd
import joblib
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, mean_absolute_error
from ${config.module} import ${config.class}

try:
    df = pd.read_csv("${safePath}")

    target_col = "${targetCol}"
    if target_col not in df.columns:
        print(f"ERROR: Column '{target_col}' not found. Available: {list(df.columns)}")
        sys.exit(1)

    X = df.drop(target_col, axis=1)
    y = df[target_col]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=${testSplit}, random_state=42
    )

    model = ${config.class}()
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    print(f"Model: ${nodeData.modelType}")
    print(f"R² Score: {model.score(X_test, y_test):.4f}")
    print(f"MSE: {mean_squared_error(y_test, y_pred):.4f}")
    print(f"MAE: {mean_absolute_error(y_test, y_pred):.4f}")

    joblib.dump(model, "model.joblib")
    print("Model saved to model.joblib")

except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
`;
};
```

### 8. Simplify connection rules

**Only allow DataLoader → Trainer** (remove Script → Trainer for now)

This avoids undefined Script output contract. Users who need preprocessing can use Script node to write their own training code.

---

## v1.5 Consideration

**Model output location:** Currently saves `model.joblib` to Python's cwd. Future improvement: save next to input file or let user configure output directory.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/stores/pipelineStore.ts` | Extend NodeData, add VALID_CONNECTIONS, update addNode, update onConnect |
| `src/components/TrainerNode.tsx` | NEW - Trainer component with form UI |
| `src/components/Canvas.tsx` | Register TrainerNode, use shared validation |
| `src/components/NodePalette.tsx` | Add Trainer button |
| `src/lib/trainerCodeGen.ts` | NEW - Generate training code from config |
| `src/components/Toolbar.tsx` | Handle Trainer execution |

---

## Verification

1. `npm run build` - should pass
2. `npm run tauri dev`
3. Add Trainer from palette → purple node with form UI
4. Connect DataLoader → Trainer → works
5. Connect Script → Trainer → blocked (not allowed)
6. Configure: model type, target column (e.g. "price"), test split
7. Click Run → shows R², MSE, MAE in output
8. Check current directory → `model.joblib` saved

---

# v1.3 - Script Editor Panel - COMPLETED

- PropertiesPanel shows large Monaco when Script selected
- Hidden when no node or non-Script selected

# v1.2 - Monaco Editor - COMPLETED

- `@monaco-editor/react@4.7.0` added
- ScriptNode uses Monaco with Python syntax highlighting
