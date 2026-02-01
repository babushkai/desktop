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

  // Node operations
  addNode: (type: "dataLoader" | "script", position: { x: number; y: number }) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  updateNodeData: (nodeId: string, data: Partial<NodeData>) => void;

  // Execution
  setExecutionStatus: (status: ExecutionStatus) => void;
  appendLog: (message: string) => void;
  clearLogs: () => void;

  // Settings
  setPythonPath: (path: string | null) => void;
}

let nodeIdCounter = 0;

export const usePipelineStore = create<PipelineState>((set, get) => ({
  nodes: [],
  edges: [],
  executionStatus: "idle",
  outputLogs: [],
  pythonPath: null,

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
    set((state) => ({ nodes: [...state.nodes, newNode] }));
  },

  onNodesChange: (changes) => {
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes),
    }));
  },

  onEdgesChange: (changes) => {
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
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
    }));
  },

  setExecutionStatus: (status) => set({ executionStatus: status }),

  appendLog: (message) => {
    set((state) => ({
      outputLogs: [...state.outputLogs, message],
    }));
  },

  clearLogs: () => set({ outputLogs: [] }),

  setPythonPath: (path) => set({ pythonPath: path }),
}));
