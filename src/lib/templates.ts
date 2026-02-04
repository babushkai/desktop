import { Node, Edge } from "@xyflow/react";
import { nanoid } from "nanoid";
import { NodeData, TrainerMode } from "@/stores/pipelineStore";
import { TuningConfig } from "./tuningTypes";
import { getExampleDataPath } from "./tauri";

// Template-specific node data types (before instantiation)
export interface TemplateDataLoaderNode {
  id: string;
  type: "dataLoader";
  position: { x: number; y: number };
  data: {
    label: string;
    datasetName?: string; // Name of bundled dataset (e.g., "iris.csv")
    filePath?: string;
  };
}

export interface TemplateTrainerNode {
  id: string;
  type: "trainer";
  position: { x: number; y: number };
  data: {
    label: string;
    modelType: string;
    targetColumn?: string;
    trainerMode?: TrainerMode;
    testSplit?: number;
    tuningConfig?: Partial<TuningConfig>;
  };
}

export interface TemplateEvaluatorNode {
  id: string;
  type: "evaluator";
  position: { x: number; y: number };
  data: {
    label: string;
  };
}

export interface TemplateDataSplitNode {
  id: string;
  type: "dataSplit";
  position: { x: number; y: number };
  data: {
    label: string;
    splitRatio: number;
    randomState?: number;
    stratify?: boolean;
    splitTargetColumn?: string;
  };
}

export interface TemplateModelExporterNode {
  id: string;
  type: "modelExporter";
  position: { x: number; y: number };
  data: {
    label: string;
    exportFormat: "joblib" | "pickle" | "onnx";
    outputFileName?: string;
  };
}

export interface TemplateScriptNode {
  id: string;
  type: "script";
  position: { x: number; y: number };
  data: {
    label: string;
    code: string;
  };
}

export type TemplateNode =
  | TemplateDataLoaderNode
  | TemplateTrainerNode
  | TemplateEvaluatorNode
  | TemplateDataSplitNode
  | TemplateModelExporterNode
  | TemplateScriptNode;

export interface TemplateEdge {
  id: string;
  source: string;
  target: string;
}

export type TemplateCategory = "classification" | "regression" | "advanced";
export type TemplateDifficulty = "beginner" | "intermediate" | "advanced";

export interface PipelineTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  difficulty: TemplateDifficulty;
  datasetName?: string; // Name of bundled dataset for preview
  nodes: TemplateNode[];
  edges: TemplateEdge[];
}

/**
 * Resolve a bundled dataset path using the Tauri backend
 * Returns undefined if resolution fails (e.g., file not found)
 */
export async function resolveDatasetPath(datasetName: string): Promise<string | undefined> {
  try {
    // Use the existing Tauri command that handles resource path resolution
    // and copies to app data directory for consistent access
    return await getExampleDataPath(datasetName);
  } catch (error) {
    console.warn(`Failed to resolve dataset path for ${datasetName}:`, error);
    return undefined;
  }
}

/**
 * Instantiate a template with unique node/edge IDs
 * Resolves bundled dataset paths for dataLoader nodes
 */
export async function instantiateTemplate(template: PipelineTemplate): Promise<{
  nodes: Node<NodeData>[];
  edges: Edge[];
}> {
  const idMap = new Map<string, string>();

  // Generate unique IDs for all nodes and resolve dataset paths
  const nodes = await Promise.all(
    template.nodes.map(async (node) => {
      const newId = `${node.type}-${nanoid(6)}`;
      idMap.set(node.id, newId);

      // Clone data to prevent mutations - cast to NodeData
      const data = { ...node.data } as NodeData;

      // Resolve bundled dataset paths for dataLoader nodes
      if (node.type === "dataLoader" && "datasetName" in node.data && node.data.datasetName) {
        const resolvedPath = await resolveDatasetPath(node.data.datasetName);
        if (resolvedPath) {
          data.filePath = resolvedPath;
        }
        // Remove template-only field
        delete (data as Record<string, unknown>).datasetName;
      }

      return {
        id: newId,
        type: node.type,
        position: node.position,
        data,
        // Add width for script nodes
        style: node.type === "script" ? { width: 320, height: 280 } : undefined,
      } as Node<NodeData>;
    })
  );

  // Remap edge source/target references
  const edges = template.edges.map((edge) => ({
    id: `e-${nanoid(6)}`,
    source: idMap.get(edge.source)!,
    target: idMap.get(edge.target)!,
  }));

  return { nodes, edges };
}

// ============================================================================
// TEMPLATE DEFINITIONS
// ============================================================================

export const TEMPLATES: PipelineTemplate[] = [
  // -------------------------------------------------------------------------
  // CLASSIFICATION TEMPLATES
  // -------------------------------------------------------------------------
  {
    id: "clf-basic",
    name: "Basic Classification",
    description: "Train a Random Forest classifier on the Iris dataset with evaluation metrics.",
    category: "classification",
    difficulty: "beginner",
    datasetName: "iris.csv",
    nodes: [
      {
        id: "dl-1",
        type: "dataLoader",
        position: { x: 50, y: 200 },
        data: {
          label: "Load Iris Data",
          datasetName: "iris.csv",
        },
      },
      {
        id: "tr-1",
        type: "trainer",
        position: { x: 320, y: 200 },
        data: {
          label: "Random Forest",
          modelType: "random_forest_classifier",
          targetColumn: "species",
          trainerMode: "train",
          testSplit: 0.2,
        },
      },
      {
        id: "ev-1",
        type: "evaluator",
        position: { x: 650, y: 200 },
        data: {
          label: "Evaluate Model",
        },
      },
    ],
    edges: [
      { id: "e-1", source: "dl-1", target: "tr-1" },
      { id: "e-2", source: "tr-1", target: "ev-1" },
    ],
  },
  {
    id: "clf-binary",
    name: "Binary Classification",
    description: "Predict Titanic survival using Logistic Regression with train/test split.",
    category: "classification",
    difficulty: "beginner",
    datasetName: "titanic.csv",
    nodes: [
      {
        id: "dl-1",
        type: "dataLoader",
        position: { x: 50, y: 200 },
        data: {
          label: "Load Titanic Data",
          datasetName: "titanic.csv",
        },
      },
      {
        id: "ds-1",
        type: "dataSplit",
        position: { x: 320, y: 200 },
        data: {
          label: "Train/Test Split",
          splitRatio: 0.2,
          randomState: 42,
          stratify: true,
          splitTargetColumn: "Survived",
        },
      },
      {
        id: "tr-1",
        type: "trainer",
        position: { x: 590, y: 200 },
        data: {
          label: "Logistic Regression",
          modelType: "logistic_regression",
          targetColumn: "Survived",
          trainerMode: "train",
        },
      },
      {
        id: "ev-1",
        type: "evaluator",
        position: { x: 920, y: 200 },
        data: {
          label: "Evaluate Model",
        },
      },
    ],
    edges: [
      { id: "e-1", source: "dl-1", target: "ds-1" },
      { id: "e-2", source: "ds-1", target: "tr-1" },
      { id: "e-3", source: "tr-1", target: "ev-1" },
    ],
  },
  {
    id: "clf-tuned",
    name: "Tuned Classification",
    description: "Hyperparameter tuning with Optuna for Random Forest on Iris dataset.",
    category: "classification",
    difficulty: "intermediate",
    datasetName: "iris.csv",
    nodes: [
      {
        id: "dl-1",
        type: "dataLoader",
        position: { x: 50, y: 200 },
        data: {
          label: "Load Iris Data",
          datasetName: "iris.csv",
        },
      },
      {
        id: "ds-1",
        type: "dataSplit",
        position: { x: 320, y: 200 },
        data: {
          label: "Train/Test Split",
          splitRatio: 0.2,
          randomState: 42,
          stratify: true,
          splitTargetColumn: "species",
        },
      },
      {
        id: "tr-1",
        type: "trainer",
        position: { x: 590, y: 200 },
        data: {
          label: "Random Forest (Tuned)",
          modelType: "random_forest_classifier",
          targetColumn: "species",
          trainerMode: "tune",
        },
      },
      {
        id: "ev-1",
        type: "evaluator",
        position: { x: 920, y: 200 },
        data: {
          label: "Evaluate Model",
        },
      },
    ],
    edges: [
      { id: "e-1", source: "dl-1", target: "ds-1" },
      { id: "e-2", source: "ds-1", target: "tr-1" },
      { id: "e-3", source: "tr-1", target: "ev-1" },
    ],
  },

  // -------------------------------------------------------------------------
  // REGRESSION TEMPLATES
  // -------------------------------------------------------------------------
  {
    id: "reg-basic",
    name: "Basic Regression",
    description: "Predict California housing prices with Linear Regression.",
    category: "regression",
    difficulty: "beginner",
    datasetName: "california_housing.csv",
    nodes: [
      {
        id: "dl-1",
        type: "dataLoader",
        position: { x: 50, y: 200 },
        data: {
          label: "Load Housing Data",
          datasetName: "california_housing.csv",
        },
      },
      {
        id: "tr-1",
        type: "trainer",
        position: { x: 320, y: 200 },
        data: {
          label: "Linear Regression",
          modelType: "linear_regression",
          targetColumn: "MedHouseVal",
          trainerMode: "train",
          testSplit: 0.2,
        },
      },
      {
        id: "ev-1",
        type: "evaluator",
        position: { x: 650, y: 200 },
        data: {
          label: "Evaluate Model",
        },
      },
    ],
    edges: [
      { id: "e-1", source: "dl-1", target: "tr-1" },
      { id: "e-2", source: "tr-1", target: "ev-1" },
    ],
  },
  {
    id: "reg-forest",
    name: "Random Forest Regression",
    description: "Housing price prediction with Random Forest and data splitting.",
    category: "regression",
    difficulty: "intermediate",
    datasetName: "california_housing.csv",
    nodes: [
      {
        id: "dl-1",
        type: "dataLoader",
        position: { x: 50, y: 200 },
        data: {
          label: "Load Housing Data",
          datasetName: "california_housing.csv",
        },
      },
      {
        id: "ds-1",
        type: "dataSplit",
        position: { x: 320, y: 200 },
        data: {
          label: "Train/Test Split",
          splitRatio: 0.2,
          randomState: 42,
        },
      },
      {
        id: "tr-1",
        type: "trainer",
        position: { x: 590, y: 200 },
        data: {
          label: "Random Forest",
          modelType: "random_forest",  // Regressor model type (not random_forest_regressor)
          targetColumn: "MedHouseVal",
          trainerMode: "train",
        },
      },
      {
        id: "ev-1",
        type: "evaluator",
        position: { x: 920, y: 200 },
        data: {
          label: "Evaluate Model",
        },
      },
    ],
    edges: [
      { id: "e-1", source: "dl-1", target: "ds-1" },
      { id: "e-2", source: "ds-1", target: "tr-1" },
      { id: "e-3", source: "tr-1", target: "ev-1" },
    ],
  },
  {
    id: "reg-boosted",
    name: "Gradient Boosting Regression",
    description: "Wine quality prediction with Gradient Boosting ensemble method.",
    category: "regression",
    difficulty: "intermediate",
    datasetName: "wine_quality.csv",
    nodes: [
      {
        id: "dl-1",
        type: "dataLoader",
        position: { x: 50, y: 200 },
        data: {
          label: "Load Wine Data",
          datasetName: "wine_quality.csv",
        },
      },
      {
        id: "ds-1",
        type: "dataSplit",
        position: { x: 320, y: 200 },
        data: {
          label: "Train/Test Split",
          splitRatio: 0.2,
          randomState: 42,
        },
      },
      {
        id: "tr-1",
        type: "trainer",
        position: { x: 590, y: 200 },
        data: {
          label: "Gradient Boosting",
          modelType: "gradient_boosting",  // Regressor model type
          targetColumn: "quality",
          trainerMode: "train",
        },
      },
      {
        id: "ev-1",
        type: "evaluator",
        position: { x: 920, y: 200 },
        data: {
          label: "Evaluate Model",
        },
      },
    ],
    edges: [
      { id: "e-1", source: "dl-1", target: "ds-1" },
      { id: "e-2", source: "ds-1", target: "tr-1" },
      { id: "e-3", source: "tr-1", target: "ev-1" },
    ],
  },

  // -------------------------------------------------------------------------
  // ADVANCED TEMPLATES
  // -------------------------------------------------------------------------
  {
    id: "adv-full",
    name: "Full ML Pipeline",
    description: "Complete pipeline: Load, Split, Train, Evaluate, and Export model.",
    category: "advanced",
    difficulty: "advanced",
    datasetName: "iris.csv",
    nodes: [
      {
        id: "dl-1",
        type: "dataLoader",
        position: { x: 50, y: 200 },
        data: {
          label: "Load Iris Data",
          datasetName: "iris.csv",
        },
      },
      {
        id: "ds-1",
        type: "dataSplit",
        position: { x: 320, y: 200 },
        data: {
          label: "Train/Test Split",
          splitRatio: 0.2,
          randomState: 42,
          stratify: true,
          splitTargetColumn: "species",
        },
      },
      {
        id: "tr-1",
        type: "trainer",
        position: { x: 590, y: 200 },
        data: {
          label: "Random Forest",
          modelType: "random_forest_classifier",
          targetColumn: "species",
          trainerMode: "train",
        },
      },
      {
        id: "ev-1",
        type: "evaluator",
        position: { x: 920, y: 200 },
        data: {
          label: "Evaluate Model",
        },
      },
      {
        id: "ex-1",
        type: "modelExporter",
        position: { x: 1190, y: 200 },
        data: {
          label: "Export Model",
          exportFormat: "joblib",
          outputFileName: "iris_model",
        },
      },
    ],
    edges: [
      { id: "e-1", source: "dl-1", target: "ds-1" },
      { id: "e-2", source: "ds-1", target: "tr-1" },
      { id: "e-3", source: "tr-1", target: "ev-1" },
      { id: "e-4", source: "ev-1", target: "ex-1" },
    ],
  },
  {
    id: "adv-custom",
    name: "Custom Preprocessing",
    description: "Load data, apply custom Python preprocessing, then train and evaluate.",
    category: "advanced",
    difficulty: "intermediate",
    datasetName: "titanic.csv",
    nodes: [
      {
        id: "dl-1",
        type: "dataLoader",
        position: { x: 50, y: 200 },
        data: {
          label: "Load Titanic Data",
          datasetName: "titanic.csv",
        },
      },
      {
        id: "sc-1",
        type: "script",
        position: { x: 320, y: 120 },
        data: {
          label: "Preprocess Data",
          code: `# Custom preprocessing script
import sys
import os
import json
import pandas as pd
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split

# Standard output directory (must match app's MODEL_FILE path)
WORK_DIR = "/tmp/mlops-desktop"
MODEL_FILE = f"{WORK_DIR}/model.joblib"
MODEL_INFO_FILE = f"{WORK_DIR}/model_info.json"

os.makedirs(WORK_DIR, exist_ok=True)

# Load data
data_path = sys.argv[1]
df = pd.read_csv(data_path)

# Preprocessing: handle missing values, encode features
df = df.drop(['Name', 'Ticket', 'Cabin', 'PassengerId'], axis=1, errors='ignore')
df['Age'] = df['Age'].fillna(df['Age'].median())
df['Embarked'] = df['Embarked'].fillna('S')
df['Sex'] = df['Sex'].map({'male': 0, 'female': 1})
df['Embarked'] = df['Embarked'].map({'S': 0, 'C': 1, 'Q': 2})

# Split data
X = df.drop('Survived', axis=1)
y = df['Survived']
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Train model
model = RandomForestClassifier(n_estimators=100, random_state=42)
model.fit(X_train, y_train)

# Save model
joblib.dump(model, MODEL_FILE)
print(f"Model saved to {MODEL_FILE}")

# Save model info for Evaluator compatibility
model_info = {
    "n_features": X_train.shape[1],
    "feature_names": X_train.columns.tolist(),
    "model_class": "RandomForestClassifier",
    "model_type": "random_forest_classifier"
}
with open(MODEL_INFO_FILE, "w") as f:
    json.dump(model_info, f, indent=2)

print(f"Preprocessed {len(df)} rows")
print(f"Features: {list(X.columns)}")
print(f"Training samples: {len(X_train)}, Test samples: {len(X_test)}")
`,
        },
      },
      {
        id: "ev-1",
        type: "evaluator",
        position: { x: 700, y: 200 },
        data: {
          label: "Evaluate Model",
        },
      },
    ],
    edges: [
      { id: "e-1", source: "dl-1", target: "sc-1" },
      { id: "e-2", source: "sc-1", target: "ev-1" },
    ],
  },
];

// Standard spacing between nodes (270px accounts for widest nodes ~250px + gap)
// Node positions follow pattern: 50, 320, 590, 920, 1190

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: TemplateCategory): PipelineTemplate[] {
  return TEMPLATES.filter((t) => t.category === category);
}

/**
 * Get a template by ID
 */
export function getTemplateById(id: string): PipelineTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/**
 * Get unique categories from templates
 */
export function getTemplateCategories(): TemplateCategory[] {
  const categories = new Set(TEMPLATES.map((t) => t.category));
  return Array.from(categories);
}
