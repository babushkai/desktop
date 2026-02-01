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
} from "../lib/tauri";

export type NodeData = {
  label: string;
  filePath?: string;
  code?: string;
  // Trainer fields
  modelType?: string;
  targetColumn?: string;
  testSplit?: number;
};

// Single source of truth for valid connections
export const VALID_CONNECTIONS: [string, string][] = [
  ["dataLoader", "script"],
  ["dataLoader", "trainer"],
  ["trainer", "evaluator"],
];

export type ExecutionStatus = "idle" | "running" | "success" | "error";

interface PipelineState {
  nodes: Node<NodeData>[];
  edges: Edge[];
  executionStatus: ExecutionStatus;
  outputLogs: string[];
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
  addNode: (type: "dataLoader" | "script" | "trainer" | "evaluator", position: { x: number; y: number }) => void;
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

  // Settings
  setPythonPath: (path: string | null) => void;

  // Pipeline save/load
  savePipeline: (name: string) => Promise<string>;
  loadPipeline: (id: string) => Promise<void>;
  newPipeline: () => void;
}

let nodeIdCounter = 0;

export const usePipelineStore = create<PipelineState>((set, get) => ({
  nodes: [],
  edges: [],
  executionStatus: "idle",
  outputLogs: [],
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
      trainer: {
        label: "Trainer",
        modelType: "linear_regression",
        targetColumn: "",
        testSplit: 0.2,
      },
      evaluator: {
        label: "Evaluator",
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

    // Script and Trainer nodes must have DataLoader connection
    const primaryNodes = nodes.filter((n) => n.type === "script" || n.type === "trainer");
    for (const node of primaryNodes) {
      if (!edges.some((e) => e.target === node.id)) {
        errors.push(`Connect a Data Loader to the ${node.data.label || node.type}`);
      }
    }

    // Trainer nodes must have target column specified
    const trainerNodes = nodes.filter((n) => n.type === "trainer");
    for (const trainer of trainerNodes) {
      if (!trainer.data.targetColumn) {
        errors.push("Specify a target column in the Trainer");
      }
    }

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

    // DataLoader connected to primary nodes must have file selected
    const connectedLoaders = edges
      .filter((e) => primaryNodes.some((n) => n.id === e.target))
      .map((e) => nodes.find((n) => n.id === e.source))
      .filter(Boolean);

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

  clearLogs: () => set({ outputLogs: [] }),

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

  newPipeline: () => {
    set({
      nodes: [],
      edges: [],
      currentPipelineId: null,
      currentPipelineName: null,
      isDirty: false,
    });
  },
}));
