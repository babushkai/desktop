# MLOps Desktop v1.5 - Evaluator Node

## Scope
Add Evaluator node with sequential execution: **DataLoader -> Trainer -> Evaluator**

Auto-detects model type (classifier vs regressor) and displays comprehensive metrics.

---

## Implementation

### 1. Extend NodeData & VALID_CONNECTIONS

**File:** `src/stores/pipelineStore.ts`

```typescript
export const VALID_CONNECTIONS: [string, string][] = [
  ["dataLoader", "script"],
  ["dataLoader", "trainer"],
  ["trainer", "evaluator"],  // NEW
];
```

Update `addNode` type union to include `"evaluator"` and add defaults:
```typescript
evaluator: { label: "Evaluator" },
```

### 2. Create EvaluatorNode component

**File:** `src/components/EvaluatorNode.tsx` (NEW)

- Orange theme (`#c2410c` background, `#fb923c` accent)
- Target handle on left (receives from Trainer)
- No source handle (terminal node)
- Displays status indicator

```typescript
export function EvaluatorNode({ id, data }: NodeProps) {
  const nodeData = data as NodeData;
  const executionStatus = usePipelineStore((s) => s.executionStatus);

  const borderColor = executionStatus === "running" ? "#fbbf24"
    : executionStatus === "success" ? "#4ade80"
    : executionStatus === "error" ? "#ef4444"
    : "#fb923c";

  return (
    <div style={{
      backgroundColor: "#c2410c",
      border: `2px solid ${borderColor}`,
      borderRadius: 8,
      padding: 12,
      minWidth: 180,
    }}>
      <Handle type="target" position={Position.Left} ... />
      <div style={{ color: "#fb923c", fontSize: 12, fontWeight: 500 }}>
        Evaluator
      </div>
      <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 8 }}>
        Auto-detects model type and displays metrics
      </div>
    </div>
  );
}
```

### 3. Create evaluatorCodeGen.ts

**File:** `src/lib/evaluatorCodeGen.ts` (NEW)

Auto-detects sklearn classifier vs regressor:

```typescript
import { NodeData } from "../stores/pipelineStore";

const sanitizePath = (p: string): string =>
  p.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

export const generateEvaluatorCode = (
  trainerData: NodeData,
  modelPath: string,
  dataPath: string
): string => {
  const targetCol = trainerData.targetColumn?.replace(/"/g, '\\"') || "target";
  const testSplit = trainerData.testSplit || 0.2;
  const safeModelPath = sanitizePath(modelPath);
  const safeDataPath = sanitizePath(dataPath);

  return `import sys
import pandas as pd
import joblib
import numpy as np
from sklearn.base import is_classifier, is_regressor
from sklearn.model_selection import train_test_split

try:
    model = joblib.load("${safeModelPath}")
    df = pd.read_csv("${safeDataPath}")

    target_col = "${targetCol}"
    X = df.drop(target_col, axis=1)
    y = df[target_col]

    _, X_test, _, y_test = train_test_split(
        X, y, test_size=${testSplit}, random_state=42
    )

    y_pred = model.predict(X_test)

    print("=" * 40)
    print("EVALUATION RESULTS")
    print("=" * 40)

    if is_classifier(model):
        from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix

        print("Model Type: Classifier")
        print("-" * 40)
        print(f"Accuracy:  {accuracy_score(y_test, y_pred):.4f}")

        average = 'binary' if len(np.unique(y)) == 2 else 'weighted'
        print(f"Precision: {precision_score(y_test, y_pred, average=average, zero_division=0):.4f}")
        print(f"Recall:    {recall_score(y_test, y_pred, average=average, zero_division=0):.4f}")
        print(f"F1 Score:  {f1_score(y_test, y_pred, average=average, zero_division=0):.4f}")
        print("-" * 40)
        print("Confusion Matrix:")
        print(confusion_matrix(y_test, y_pred))

    elif is_regressor(model):
        from sklearn.metrics import r2_score, mean_squared_error, mean_absolute_error

        print("Model Type: Regressor")
        print("-" * 40)
        print(f"R2 Score:  {r2_score(y_test, y_pred):.4f}")
        print(f"MSE:       {mean_squared_error(y_test, y_pred):.4f}")
        print(f"RMSE:      {np.sqrt(mean_squared_error(y_test, y_pred)):.4f}")
        print(f"MAE:       {mean_absolute_error(y_test, y_pred):.4f}")

    print("=" * 40)
    print("Evaluation complete!")

except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
`;
};
```

### 4. Add runScriptAndWait for sequential execution

**File:** `src/lib/tauri.ts`

```typescript
export async function runScriptAndWait(
  scriptCode: string,
  inputPath: string,
  onOutput?: (event: ScriptEvent) => void
): Promise<number> {
  return new Promise((resolve, reject) => {
    let unlistener: UnlistenFn | undefined;

    listenToScriptOutput((event) => {
      onOutput?.(event);
      if (event.type === "exit") {
        unlistener?.();
        if (event.code === 0) resolve(event.code);
        else reject(new Error(`Script exited with code ${event.code}`));
      }
    }).then((unlisten) => {
      unlistener = unlisten;
      runScript(scriptCode, inputPath).catch(reject);
    });
  });
}
```

### 5. Refactor Toolbar.tsx handleRun for sequential execution

**File:** `src/components/Toolbar.tsx`

```typescript
import { generateEvaluatorCode } from "../lib/evaluatorCodeGen";
import { runScriptAndWait } from "../lib/tauri";

const handleRun = async () => {
  const errors = validatePipeline();
  if (errors.length > 0) {
    clearLogs();
    errors.forEach((e) => appendLog(`ERROR: ${e}`));
    return;
  }

  clearLogs();
  setExecutionStatus("running");

  // Find pipeline structure
  const trainerNode = nodes.find((n) => n.type === "trainer");
  const evaluatorNode = nodes.find((n) => n.type === "evaluator");
  const scriptNode = nodes.find((n) => n.type === "script");

  // Get DataLoader for input path
  const targetNode = trainerNode || scriptNode;
  if (!targetNode) {
    appendLog("ERROR: No executable node found");
    setExecutionStatus("error");
    return;
  }

  const edge = edges.find((e) => e.target === targetNode.id);
  const dataLoaderNode = nodes.find((n) => n.id === edge?.source);
  const inputPath = dataLoaderNode?.data.filePath;

  if (!inputPath) {
    appendLog("ERROR: No input file selected");
    setExecutionStatus("error");
    return;
  }

  try {
    // Step 1: Run Trainer or Script
    if (trainerNode) {
      appendLog("--- Running Trainer ---");
      const trainerCode = generateTrainerCode(trainerNode.data, inputPath);
      await runScriptAndWait(trainerCode, inputPath, (event) => {
        if (event.type === "log") appendLog(event.message);
        if (event.type === "error") appendLog(`ERROR: ${event.message}`);
      });
    } else if (scriptNode) {
      appendLog("--- Running Script ---");
      await runScriptAndWait(scriptNode.data.code!, inputPath, (event) => {
        if (event.type === "log") appendLog(event.message);
        if (event.type === "error") appendLog(`ERROR: ${event.message}`);
      });
    }

    // Step 2: Run Evaluator (if connected to Trainer)
    if (evaluatorNode && trainerNode) {
      const evalEdge = edges.find((e) => e.target === evaluatorNode.id);
      if (evalEdge?.source === trainerNode.id) {
        appendLog("");
        appendLog("--- Running Evaluator ---");
        const evalCode = generateEvaluatorCode(trainerNode.data, "model.joblib", inputPath);
        await runScriptAndWait(evalCode, inputPath, (event) => {
          if (event.type === "log") appendLog(event.message);
          if (event.type === "error") appendLog(`ERROR: ${event.message}`);
        });
      }
    }

    setExecutionStatus("success");
  } catch (error) {
    appendLog(`ERROR: ${error}`);
    setExecutionStatus("error");
  }
};
```

### 6. Update validatePipeline

**File:** `src/stores/pipelineStore.ts`

Add validation for Evaluator:
```typescript
// Evaluator must be connected to Trainer
const evaluatorNodes = nodes.filter((n) => n.type === "evaluator");
for (const evaluator of evaluatorNodes) {
  const incomingEdge = edges.find((e) => e.target === evaluator.id);
  if (!incomingEdge) {
    errors.push("Connect a Trainer to the Evaluator");
  } else {
    const sourceNode = nodes.find((n) => n.id === incomingEdge.source);
    if (sourceNode?.type !== "trainer") {
      errors.push("Evaluator must be connected to a Trainer node");
    }
  }
}
```

### 7. Register in Canvas.tsx

```typescript
import { EvaluatorNode } from "./EvaluatorNode";

const nodeTypes: NodeTypes = {
  dataLoader: DataLoaderNode,
  script: ScriptNode,
  trainer: TrainerNode,
  evaluator: EvaluatorNode,
};

// MiniMap color
case "evaluator": return "#fb923c";
```

### 8. Add to NodePalette.tsx

```typescript
<button onClick={() => addNode("evaluator", { x: 700, y: 100 + Math.random() * 100 })}
  style={{ backgroundColor: "#fb923c", ... }}>
  Evaluator
</button>

// Update tip:
<p>Valid: DataLoader -> Trainer -> Evaluator</p>
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/stores/pipelineStore.ts` | Add evaluator to addNode, VALID_CONNECTIONS, validatePipeline |
| `src/components/EvaluatorNode.tsx` | NEW - Evaluator node component |
| `src/lib/evaluatorCodeGen.ts` | NEW - Generate evaluation code |
| `src/lib/tauri.ts` | Add runScriptAndWait function |
| `src/components/Toolbar.tsx` | Refactor handleRun for sequential execution |
| `src/components/Canvas.tsx` | Register EvaluatorNode, add MiniMap color |
| `src/components/NodePalette.tsx` | Add Evaluator button |

---

## Known Limitations (v1.5)

| Issue | Severity | Note |
|-------|----------|------|
| Test set fragility | Medium | Trainer/Evaluator both call train_test_split with same random_state=42. Works if data unchanged. Fix in v1.6: save test_indices.json |
| Redundant regressor metrics | Low | Evaluator only adds RMSE for regressors. Real value is classification metrics (future) |
| Hardcoded model.joblib path | Low | Accept for v1.5. Add configurable output dir in v1.6 |
| No timeout in runScriptAndWait | Low | Add 5-min timeout in v1.6 |

---

## Verification

1. `npm run build` - should pass
2. `npm run test:run` - all tests pass
3. `npm run tauri dev`
4. Create pipeline: DataLoader -> Trainer -> Evaluator
5. Select CSV file, configure Trainer (target column)
6. Click Run:
   - Trainer runs first, outputs R2/MSE/MAE
   - Evaluator runs second, shows full metrics
7. Test with regression dataset -> shows regressor metrics
8. Test with classification dataset -> shows accuracy/precision/recall/F1/confusion matrix

---

## Test Cases to Add

```typescript
it("allows trainer -> evaluator connections", () => { ... });
it("rejects dataLoader -> evaluator connections", () => { ... });
it("validates evaluator must connect to trainer", () => { ... });
```

---

# Previous Versions

## v1.4 - Trainer Node - COMPLETED
## v1.3 - Script Editor Panel - COMPLETED
## v1.2 - Monaco Editor - COMPLETED
