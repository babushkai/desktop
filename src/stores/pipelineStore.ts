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
};

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

  // Node operations
  addNode: (type: "dataLoader" | "script", position: { x: number; y: number }) => void;
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

  addNode: (type, position) => {
    const id = `${type}-${++nodeIdCounter}`;
    const newNode: Node<NodeData> = {
      id,
      type,
      position,
      data: {
        label: type === "dataLoader" ? "Data Loader" : "Script",
        filePath: type === "dataLoader" ? undefined : undefined,
        code: type === "script" ? "# Write your Python code here\nimport sys\n\ndata_path = sys.argv[1]\nprint(f'Input file: {data_path}')\n" : undefined,
      },
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
    // Validate: only allow DataLoader -> Script connections
    const { nodes } = get();
    const sourceNode = nodes.find((n) => n.id === connection.source);
    const targetNode = nodes.find((n) => n.id === connection.target);

    if (sourceNode?.type === "dataLoader" && targetNode?.type === "script") {
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

    // Must have at least one script
    if (!nodes.some((n) => n.type === "script")) {
      errors.push("Add a Script node");
    }

    // Script must have input connection
    const scriptNodes = nodes.filter((n) => n.type === "script");
    for (const script of scriptNodes) {
      if (!edges.some((e) => e.target === script.id)) {
        errors.push("Connect a Data Loader to the Script");
      }
    }

    // DataLoader connected to script must have file selected
    const connectedLoaders = edges
      .filter((e) => scriptNodes.some((s) => s.id === e.target))
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
