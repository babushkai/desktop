import { NodeData } from "../stores/pipelineStore";
import { SPLIT_INDICES_FILE } from "./constants";

const sanitizePath = (p: string): string =>
  p.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

export const generateDataSplitCode = (
  nodeData: NodeData,
  inputPath: string
): string => {
  const splitRatio = nodeData.splitRatio || 0.2;
  const randomState = nodeData.randomState ?? 42;
  const stratify = nodeData.stratify || false;
  const targetCol = nodeData.splitTargetColumn?.replace(/"/g, '\\"') || "";
  const safePath = sanitizePath(inputPath);

  return `import sys
import json
import pandas as pd
from sklearn.model_selection import train_test_split

try:
    df = pd.read_csv("${safePath}")
    print(f"Dataset loaded: {len(df)} rows")

    indices = list(range(len(df)))

    ${
      stratify
        ? `target_col = "${targetCol}"
    if target_col not in df.columns:
        print(f"ERROR: Stratify column '{target_col}' not found. Available: {list(df.columns)}")
        sys.exit(1)
    stratify_values = df[target_col].tolist()
    train_idx, test_idx = train_test_split(
        indices, test_size=${splitRatio}, random_state=${randomState},
        stratify=stratify_values
    )`
        : `train_idx, test_idx = train_test_split(
        indices, test_size=${splitRatio}, random_state=${randomState}
    )`
    }

    split_data = {
        "train_indices": train_idx,
        "test_indices": test_idx,
        "train_size": len(train_idx),
        "test_size": len(test_idx),
        "split_ratio": ${splitRatio},
        "random_state": ${randomState},
        "stratified": ${stratify ? "True" : "False"},
        "source_file": "${safePath}"
    }

    with open("${SPLIT_INDICES_FILE}", "w") as f:
        json.dump(split_data, f, indent=2)

    print("=" * 40)
    print("DATA SPLIT COMPLETE")
    print("=" * 40)
    print(f"Training samples: {len(train_idx)} ({(1-${splitRatio})*100:.0f}%)")
    print(f"Test samples: {len(test_idx)} ({${splitRatio}*100:.0f}%)")
    print(f"Random state: ${randomState}")
    ${stratify ? `print(f"Stratified by: ${targetCol}")` : ""}
    print("=" * 40)

except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
`;
};
