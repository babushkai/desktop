import { create } from "zustand";
import {
  Node,
  Edge,
  Connection,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
} from "@xyflow/react";
import {
  savePipeline as savePipelineApi,
  loadPipeline as loadPipelineApi,
  getExampleDataPath,
  MetricsData,
} from "../lib/tauri";
import {
  createClassificationWorkflow,
  createRegressionWorkflow,
  ExampleWorkflow,
} from "../lib/exampleWorkflows";
import { AlignType, alignNodes, distributeNodes } from "@/lib/alignment";

export type TrainerMode = "train" | "load";

export type NodeData = {
  label: string;
  filePath?: string;
  code?: string;
  // DataSplit fields
  splitRatio?: number; // test split ratio (0.1-0.5, default 0.2)
  randomState?: number; // random seed (default 42)
  stratify?: boolean; // whether to stratify split
  splitTargetColumn?: string; // column for stratification
  // Trainer fields
  trainerMode?: TrainerMode; // "train" (default) or "load"
  modelType?: string;
  targetColumn?: string;
  testSplit?: number; // KEPT for backward compat
  modelFilePath?: string; // path to pre-trained model (for "load" mode)
  // ModelExporter fields
  exportFormat?: string; // "joblib" | "pickle" | "onnx"
  outputFileName?: string;
};

// Single source of truth for valid connections
export const VALID_CONNECTIONS: [string, string][] = [
  ["dataLoader", "script"],
  ["dataLoader", "dataSplit"],
  ["dataLoader", "trainer"], // Keep for backward compat
  ["dataSplit", "trainer"],
  ["trainer", "evaluator"],
  ["script", "evaluator"], // Script can feed Evaluator if it saves MODEL_FILE
  ["evaluator", "modelExporter"],
  ["trainer", "modelExporter"],
];

export type ExecutionStatus = "idle" | "running" | "success" | "error";

interface PipelineState {
  nodes: Node<NodeData>[];
  edges: Edge[];
  executionStatus: ExecutionStatus;
  outputLogs: string[];
  metrics: MetricsData | null;
  pythonPath: string | null;
  validationErrors: string[];

  // Pipeline persistence
  currentPipelineId: string | null;
  currentPipelineName: string | null;
  isDirty: boolean;

  // Selection
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;

  // Node operations
  addNode: (type: "dataLoader" | "script" | "trainer" | "evaluator" | "modelExporter" | "dataSplit", position: { x: number; y: number }) => void;
  deleteNodes: (nodeIds: string[]) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  updateNodeData: (nodeId: string, data: Partial<NodeData>) => void;

  // Validation
  validatePipeline: () => string[];

  // Execution
  setExecutionStatus: (status: ExecutionStatus) => void;
  appendLog: (message: string) => void;
  clearLogs: () => void;
  setMetrics: (metrics: MetricsData) => void;

  // Settings
  setPythonPath: (path: string | null) => void;

  // Pipeline save/load
  savePipeline: (name: string) => Promise<string>;
  loadPipeline: (id: string) => Promise<void>;
  loadExampleWorkflow: (type: "classification" | "regression") => Promise<void>;
  newPipeline: () => void;

  // Alignment and selection
  alignSelectedNodes: (alignType: AlignType) => void;
  distributeSelectedNodes: (direction: "horizontal" | "vertical") => void;
  selectAllNodes: () => void;
  deselectAllNodes: () => void;
  duplicateSelectedNodes: () => void;
  getSelectedNodes: () => Node[];
}

let nodeIdCounter = 0;

export const usePipelineStore = create<PipelineState>((set, get) => ({
  nodes: [],
  edges: [],
  executionStatus: "idle",
  outputLogs: [],
  metrics: null,
  pythonPath: null,
  validationErrors: [],
  currentPipelineId: null,
  currentPipelineName: null,
  isDirty: false,
  selectedNodeId: null,

  setSelectedNodeId: (id) => set({ selectedNodeId: id }),

  addNode: (type, position) => {
    const id = `${type}-${++nodeIdCounter}`;
    const nodeDefaults: Record<string, Partial<NodeData>> = {
      dataLoader: { label: "Data Loader" },
      script: {
        label: "Script",
        code: "# Write your Python code here\nimport sys\n\ndata_path = sys.argv[1]\nprint(f'Input file: {data_path}')\n",
      },
      dataSplit: {
        label: "Data Split",
        splitRatio: 0.2,
        randomState: 42,
        stratify: false,
        splitTargetColumn: "",
      },
      trainer: {
        label: "Trainer",
        trainerMode: "train",
        modelType: "linear_regression",
        targetColumn: "",
        testSplit: 0.2,
        modelFilePath: "",
      },
      evaluator: {
        label: "Evaluator",
      },
      modelExporter: {
        label: "Model Exporter",
        exportFormat: "joblib",
        outputFileName: "model_export",
      },
    };
    const newNode: Node<NodeData> = {
      id,
      type,
      position,
      data: nodeDefaults[type] as NodeData,
      style: type === "script" ? { width: 320, height: 280 } : undefined,
    };
    set((state) => ({ nodes: [...state.nodes, newNode], isDirty: true }));
  },

  deleteNodes: (nodeIds) => {
    set((state) => ({
      nodes: state.nodes.filter((n) => !nodeIds.includes(n.id)),
      edges: state.edges.filter(
        (e) => !nodeIds.includes(e.source) && !nodeIds.includes(e.target)
      ),
      isDirty: true,
    }));
  },

  onNodesChange: (changes) => {
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes) as Node<NodeData>[],
    }));
  },

  onEdgesChange: (changes) => {
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges) as Edge[],
    }));
  },

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

  updateNodeData: (nodeId, data) => {
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...data } }
          : node
      ),
      isDirty: true,
    }));
  },

  validatePipeline: () => {
    const errors: string[] = [];
    const { nodes, edges } = get();

    // Must have at least one executable node (script, trainer, or evaluator)
    const executableNodes = nodes.filter(
      (n) => n.type === "script" || n.type === "trainer" || n.type === "evaluator"
    );
    if (executableNodes.length === 0) {
      errors.push("Add a Script, Trainer, or Evaluator node");
    }

    // DataSplit must have DataLoader connection
    const dataSplitNodes = nodes.filter((n) => n.type === "dataSplit");
    for (const ds of dataSplitNodes) {
      const incomingEdge = edges.find((e) => e.target === ds.id);
      if (!incomingEdge) {
        errors.push("Connect a Data Loader to the Data Split");
      } else {
        const sourceNode = nodes.find((n) => n.id === incomingEdge.source);
        if (sourceNode?.type !== "dataLoader") {
          errors.push("Data Split must be connected from a Data Loader");
        }
      }
      if (ds.data.stratify && !ds.data.splitTargetColumn) {
        errors.push("Specify a target column for stratified split");
      }
    }

    // Script nodes must have DataLoader connection
    const scriptNodes = nodes.filter((n) => n.type === "script");
    for (const node of scriptNodes) {
      if (!edges.some((e) => e.target === node.id)) {
        errors.push(`Connect a Data Loader to the ${node.data.label || node.type}`);
      }
    }

    // Trainer nodes validation
    const trainerNodes = nodes.filter((n) => n.type === "trainer");
    for (const trainer of trainerNodes) {
      const isLoadMode = trainer.data.trainerMode === "load";

      // In train mode, must have DataLoader or DataSplit connection
      if (!isLoadMode) {
        const incomingEdge = edges.find((e) => e.target === trainer.id);
        if (!incomingEdge) {
          errors.push("Connect a Data Loader or Data Split to the Trainer");
        } else {
          const sourceNode = nodes.find((n) => n.id === incomingEdge.source);
          if (sourceNode?.type !== "dataLoader" && sourceNode?.type !== "dataSplit") {
            errors.push("Trainer must be connected from a Data Loader or Data Split");
          }
        }
        // Train mode requires target column
        if (!trainer.data.targetColumn) {
          errors.push("Specify a target column in the Trainer");
        }
      } else {
        // Load mode requires model file path
        if (!trainer.data.modelFilePath) {
          errors.push("Select a model file in the Trainer");
        }
      }
    }

    // Evaluator must be connected to Trainer or Script
    const evaluatorNodes = nodes.filter((n) => n.type === "evaluator");
    for (const evaluator of evaluatorNodes) {
      const incomingEdge = edges.find((e) => e.target === evaluator.id);
      if (!incomingEdge) {
        errors.push("Connect a Trainer or Script to the Evaluator");
      } else {
        const sourceNode = nodes.find((n) => n.id === incomingEdge.source);
        if (sourceNode?.type !== "trainer" && sourceNode?.type !== "script") {
          errors.push("Evaluator must be connected to a Trainer or Script node");
        }
      }
    }

    // ModelExporter must be connected to Trainer or Evaluator
    const exporterNodes = nodes.filter((n) => n.type === "modelExporter");
    for (const exporter of exporterNodes) {
      const incomingEdge = edges.find((e) => e.target === exporter.id);
      if (!incomingEdge) {
        errors.push("Connect a Trainer or Evaluator to the Model Exporter");
      } else {
        const sourceNode = nodes.find((n) => n.id === incomingEdge.source);
        if (sourceNode?.type !== "trainer" && sourceNode?.type !== "evaluator") {
          errors.push("Model Exporter must be connected to a Trainer or Evaluator node");
        }
      }
    }

    // DataLoader connected to primary nodes (script, trainer, dataSplit) must have file selected
    const primaryNodes = nodes.filter(
      (n) => n.type === "script" || n.type === "trainer" || n.type === "dataSplit"
    );
    const connectedLoaders = edges
      .filter((e) => primaryNodes.some((n) => n.id === e.target))
      .map((e) => nodes.find((n) => n.id === e.source))
      .filter((n) => n?.type === "dataLoader");

    for (const loader of connectedLoaders) {
      if (!loader?.data.filePath) {
        errors.push("Select a file in the Data Loader");
      }
    }

    set({ validationErrors: errors });
    return errors;
  },

  setExecutionStatus: (status) => set({ executionStatus: status }),

  appendLog: (message) => {
    set((state) => ({
      outputLogs: [...state.outputLogs, message],
    }));
  },

  clearLogs: () => set({ outputLogs: [], metrics: null }),

  setMetrics: (metrics) => set({ metrics }),

  setPythonPath: (path) => set({ pythonPath: path }),

  // Pipeline save/load
  savePipeline: async (name) => {
    const { nodes, edges, currentPipelineId } = get();
    const id = currentPipelineId || crypto.randomUUID();
    const data = JSON.stringify({ nodes, edges, name });
    await savePipelineApi(id, name, data);
    set({ currentPipelineId: id, currentPipelineName: name, isDirty: false });
    return id;
  },

  loadPipeline: async (id) => {
    try {
      const data = await loadPipelineApi(id);
      if (!data) {
        console.error("Pipeline not found");
        return;
      }
      const { nodes, edges, name } = JSON.parse(data);
      set({
        nodes,
        edges,
        currentPipelineId: id,
        currentPipelineName: name,
        isDirty: false,
      });
    } catch (e) {
      console.error("Failed to load pipeline:", e);
    }
  },

  loadExampleWorkflow: async (type) => {
    try {
      const dataset = type === "classification" ? "iris.csv" : "california_housing.csv";
      const dataPath = await getExampleDataPath(dataset);

      let workflow: ExampleWorkflow;
      if (type === "classification") {
        workflow = createClassificationWorkflow(dataPath);
      } else {
        workflow = createRegressionWorkflow(dataPath);
      }

      set({
        nodes: workflow.nodes,
        edges: workflow.edges,
        currentPipelineId: null,
        currentPipelineName: workflow.name,
        isDirty: false,
        outputLogs: [],
        metrics: null,
        executionStatus: "idle",
      });
    } catch (e) {
      console.error("Failed to load example workflow:", e);
      throw e;
    }
  },

  newPipeline: () => {
    set({
      nodes: [],
      edges: [],
      currentPipelineId: null,
      currentPipelineName: null,
      isDirty: false,
    });
  },

  // Alignment and selection
  alignSelectedNodes: (alignType) => {
    const { nodes } = get();
    const selectedNodes = nodes.filter((n) => n.selected);
    if (selectedNodes.length < 2) return;

    const alignedNodes = alignNodes(selectedNodes, alignType) as Node<NodeData>[];
    const alignedMap = new Map(alignedNodes.map((n) => [n.id, n]));

    set({
      nodes: nodes.map((node) => alignedMap.get(node.id) ?? node) as Node<NodeData>[],
      isDirty: true,
    });
  },

  distributeSelectedNodes: (direction) => {
    const { nodes } = get();
    const selectedNodes = nodes.filter((n) => n.selected);
    if (selectedNodes.length < 3) return;

    const distributedNodes = distributeNodes(selectedNodes, direction) as Node<NodeData>[];
    const distributedMap = new Map(distributedNodes.map((n) => [n.id, n]));

    set({
      nodes: nodes.map((node) => distributedMap.get(node.id) ?? node) as Node<NodeData>[],
      isDirty: true,
    });
  },

  selectAllNodes: () => {
    set((state) => ({
      nodes: state.nodes.map((node) => ({ ...node, selected: true })),
    }));
  },

  deselectAllNodes: () => {
    set((state) => ({
      nodes: state.nodes.map((node) => ({ ...node, selected: false })),
    }));
  },

  duplicateSelectedNodes: () => {
    const { nodes } = get();
    const selectedNodes = nodes.filter((n) => n.selected);
    if (selectedNodes.length === 0) return;

    const duplicatedNodes = selectedNodes.map((node) => {
      const newId = `${node.type}-${++nodeIdCounter}`;
      return {
        ...node,
        id: newId,
        position: {
          x: node.position.x + 20,
          y: node.position.y + 20,
        },
        selected: false,
      };
    });

    set((state) => ({
      nodes: [...state.nodes, ...duplicatedNodes],
      isDirty: true,
    }));
  },

  getSelectedNodes: () => {
    const { nodes } = get();
    return nodes.filter((n) => n.selected);
  },
}));
