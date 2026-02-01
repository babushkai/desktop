import { describe, it, expect, beforeEach, vi } from "vitest";
import { usePipelineStore } from "./pipelineStore";

// Mock the tauri lib
vi.mock("../lib/tauri", () => ({
  savePipeline: vi.fn(() => Promise.resolve()),
  loadPipeline: vi.fn(() => Promise.resolve(JSON.stringify({
    nodes: [{ id: "loaded-1", type: "script", position: { x: 0, y: 0 }, data: { label: "Loaded" } }],
    edges: [],
    name: "Loaded Pipeline",
  }))),
}));

describe("pipelineStore", () => {
  beforeEach(() => {
    // Reset store state before each test
    usePipelineStore.setState({
      nodes: [],
      edges: [],
      executionStatus: "idle",
      outputLogs: [],
      pythonPath: null,
      validationErrors: [],
      currentPipelineId: null,
      currentPipelineName: null,
      isDirty: false,
    });
  });

  describe("addNode", () => {
    it("adds a dataLoader node", () => {
      const { addNode } = usePipelineStore.getState();
      addNode("dataLoader", { x: 100, y: 100 });

      const { nodes, isDirty } = usePipelineStore.getState();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].type).toBe("dataLoader");
      expect(nodes[0].data.label).toBe("Data Loader");
      expect(isDirty).toBe(true);
    });

    it("adds a script node with default code", () => {
      const { addNode } = usePipelineStore.getState();
      addNode("script", { x: 200, y: 200 });

      const { nodes } = usePipelineStore.getState();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].type).toBe("script");
      expect(nodes[0].data.code).toContain("sys.argv[1]");
    });
  });

  describe("deleteNodes", () => {
    it("removes nodes by id", () => {
      const { addNode, deleteNodes } = usePipelineStore.getState();
      addNode("dataLoader", { x: 0, y: 0 });
      addNode("script", { x: 100, y: 0 });

      let { nodes } = usePipelineStore.getState();
      expect(nodes).toHaveLength(2);

      const nodeToDelete = nodes[0].id;
      deleteNodes([nodeToDelete]);

      nodes = usePipelineStore.getState().nodes;
      expect(nodes).toHaveLength(1);
      expect(nodes[0].id).not.toBe(nodeToDelete);
    });

    it("removes connected edges when node is deleted", () => {
      const { addNode, onConnect, deleteNodes } = usePipelineStore.getState();
      addNode("dataLoader", { x: 0, y: 0 });
      addNode("script", { x: 100, y: 0 });

      let { nodes } = usePipelineStore.getState();
      const dataLoaderId = nodes.find((n) => n.type === "dataLoader")!.id;
      const scriptId = nodes.find((n) => n.type === "script")!.id;

      // Connect them
      onConnect({ source: dataLoaderId, target: scriptId, sourceHandle: null, targetHandle: null });

      let { edges } = usePipelineStore.getState();
      expect(edges).toHaveLength(1);

      // Delete dataLoader
      deleteNodes([dataLoaderId]);

      edges = usePipelineStore.getState().edges;
      expect(edges).toHaveLength(0);
    });

    it("sets isDirty to true", () => {
      const { addNode, deleteNodes } = usePipelineStore.getState();
      addNode("dataLoader", { x: 0, y: 0 });

      // Reset isDirty manually
      usePipelineStore.setState({ isDirty: false });

      const { nodes } = usePipelineStore.getState();
      deleteNodes([nodes[0].id]);

      expect(usePipelineStore.getState().isDirty).toBe(true);
    });
  });

  describe("validatePipeline", () => {
    it("returns error when no executable node exists", () => {
      const { validatePipeline } = usePipelineStore.getState();
      const errors = validatePipeline();

      expect(errors).toContain("Add a Script, Trainer, or Evaluator node");
    });

    it("returns error when script has no connection", () => {
      const { addNode, validatePipeline } = usePipelineStore.getState();
      addNode("script", { x: 0, y: 0 });

      const errors = validatePipeline();
      expect(errors).toContain("Connect a Data Loader to the Script");
    });

    it("returns error when connected dataLoader has no file", () => {
      const { addNode, onConnect, validatePipeline } = usePipelineStore.getState();
      addNode("dataLoader", { x: 0, y: 0 });
      addNode("script", { x: 100, y: 0 });

      const { nodes } = usePipelineStore.getState();
      const dataLoaderId = nodes.find((n) => n.type === "dataLoader")!.id;
      const scriptId = nodes.find((n) => n.type === "script")!.id;

      onConnect({ source: dataLoaderId, target: scriptId, sourceHandle: null, targetHandle: null });

      const errors = validatePipeline();
      expect(errors).toContain("Select a file in the Data Loader");
    });

    it("returns no errors when pipeline is valid", () => {
      const { addNode, onConnect, updateNodeData, validatePipeline } = usePipelineStore.getState();
      addNode("dataLoader", { x: 0, y: 0 });
      addNode("script", { x: 100, y: 0 });

      const { nodes } = usePipelineStore.getState();
      const dataLoaderId = nodes.find((n) => n.type === "dataLoader")!.id;
      const scriptId = nodes.find((n) => n.type === "script")!.id;

      // Set file path
      updateNodeData(dataLoaderId, { filePath: "/path/to/data.csv" });

      // Connect
      onConnect({ source: dataLoaderId, target: scriptId, sourceHandle: null, targetHandle: null });

      const errors = validatePipeline();
      expect(errors).toHaveLength(0);
    });

    it("validates modelExporter must connect to trainer or evaluator", () => {
      const { addNode, validatePipeline } = usePipelineStore.getState();
      addNode("modelExporter", { x: 0, y: 0 });

      const errors = validatePipeline();
      expect(errors).toContain("Connect a Trainer or Evaluator to the Model Exporter");
    });

    it("validates dataSplit must connect to dataLoader", () => {
      const { addNode, validatePipeline } = usePipelineStore.getState();
      addNode("dataSplit", { x: 0, y: 0 });

      const errors = validatePipeline();
      expect(errors).toContain("Connect a Data Loader to the Data Split");
    });

    it("validates stratify requires target column", () => {
      const { addNode, onConnect, updateNodeData, validatePipeline } = usePipelineStore.getState();
      addNode("dataLoader", { x: 0, y: 0 });
      addNode("dataSplit", { x: 100, y: 0 });
      addNode("trainer", { x: 200, y: 0 });

      const { nodes } = usePipelineStore.getState();
      const dataLoaderId = nodes.find((n) => n.type === "dataLoader")!.id;
      const dataSplitId = nodes.find((n) => n.type === "dataSplit")!.id;
      const trainerId = nodes.find((n) => n.type === "trainer")!.id;

      // Set up connections
      onConnect({ source: dataLoaderId, target: dataSplitId, sourceHandle: null, targetHandle: null });
      onConnect({ source: dataSplitId, target: trainerId, sourceHandle: null, targetHandle: null });

      // Set file path and target column
      updateNodeData(dataLoaderId, { filePath: "/path/to/data.csv" });
      updateNodeData(trainerId, { targetColumn: "target" });

      // Enable stratify without setting target column
      updateNodeData(dataSplitId, { stratify: true, splitTargetColumn: "" });

      const errors = validatePipeline();
      expect(errors).toContain("Specify a target column for stratified split");
    });

    it("passes validation with valid dataSplit pipeline", () => {
      const { addNode, onConnect, updateNodeData, validatePipeline } = usePipelineStore.getState();
      addNode("dataLoader", { x: 0, y: 0 });
      addNode("dataSplit", { x: 100, y: 0 });
      addNode("trainer", { x: 200, y: 0 });

      const { nodes } = usePipelineStore.getState();
      const dataLoaderId = nodes.find((n) => n.type === "dataLoader")!.id;
      const dataSplitId = nodes.find((n) => n.type === "dataSplit")!.id;
      const trainerId = nodes.find((n) => n.type === "trainer")!.id;

      // Set up connections
      onConnect({ source: dataLoaderId, target: dataSplitId, sourceHandle: null, targetHandle: null });
      onConnect({ source: dataSplitId, target: trainerId, sourceHandle: null, targetHandle: null });

      // Set required data
      updateNodeData(dataLoaderId, { filePath: "/path/to/data.csv" });
      updateNodeData(trainerId, { targetColumn: "target" });

      const errors = validatePipeline();
      expect(errors).toHaveLength(0);
    });
  });

  describe("onConnect", () => {
    it("allows dataLoader -> script connections", () => {
      const { addNode, onConnect } = usePipelineStore.getState();
      addNode("dataLoader", { x: 0, y: 0 });
      addNode("script", { x: 100, y: 0 });

      const { nodes } = usePipelineStore.getState();
      const dataLoaderId = nodes.find((n) => n.type === "dataLoader")!.id;
      const scriptId = nodes.find((n) => n.type === "script")!.id;

      onConnect({ source: dataLoaderId, target: scriptId, sourceHandle: null, targetHandle: null });

      const { edges } = usePipelineStore.getState();
      expect(edges).toHaveLength(1);
    });

    it("rejects script -> dataLoader connections", () => {
      const { addNode, onConnect } = usePipelineStore.getState();
      addNode("dataLoader", { x: 0, y: 0 });
      addNode("script", { x: 100, y: 0 });

      const { nodes } = usePipelineStore.getState();
      const dataLoaderId = nodes.find((n) => n.type === "dataLoader")!.id;
      const scriptId = nodes.find((n) => n.type === "script")!.id;

      // Try reverse connection
      onConnect({ source: scriptId, target: dataLoaderId, sourceHandle: null, targetHandle: null });

      const { edges } = usePipelineStore.getState();
      expect(edges).toHaveLength(0);
    });

    it("allows evaluator -> modelExporter connections", () => {
      const { addNode, onConnect } = usePipelineStore.getState();
      addNode("evaluator", { x: 0, y: 0 });
      addNode("modelExporter", { x: 100, y: 0 });

      const { nodes } = usePipelineStore.getState();
      const evaluatorId = nodes.find((n) => n.type === "evaluator")!.id;
      const exporterId = nodes.find((n) => n.type === "modelExporter")!.id;

      onConnect({ source: evaluatorId, target: exporterId, sourceHandle: null, targetHandle: null });

      const { edges } = usePipelineStore.getState();
      expect(edges).toHaveLength(1);
    });

    it("allows trainer -> modelExporter connections", () => {
      const { addNode, onConnect } = usePipelineStore.getState();
      addNode("trainer", { x: 0, y: 0 });
      addNode("modelExporter", { x: 100, y: 0 });

      const { nodes } = usePipelineStore.getState();
      const trainerId = nodes.find((n) => n.type === "trainer")!.id;
      const exporterId = nodes.find((n) => n.type === "modelExporter")!.id;

      onConnect({ source: trainerId, target: exporterId, sourceHandle: null, targetHandle: null });

      const { edges } = usePipelineStore.getState();
      expect(edges).toHaveLength(1);
    });

    it("rejects dataLoader -> modelExporter connections", () => {
      const { addNode, onConnect } = usePipelineStore.getState();
      addNode("dataLoader", { x: 0, y: 0 });
      addNode("modelExporter", { x: 100, y: 0 });

      const { nodes } = usePipelineStore.getState();
      const dataLoaderId = nodes.find((n) => n.type === "dataLoader")!.id;
      const exporterId = nodes.find((n) => n.type === "modelExporter")!.id;

      onConnect({ source: dataLoaderId, target: exporterId, sourceHandle: null, targetHandle: null });

      const { edges } = usePipelineStore.getState();
      expect(edges).toHaveLength(0);
    });

    it("allows dataLoader -> dataSplit connections", () => {
      const { addNode, onConnect } = usePipelineStore.getState();
      addNode("dataLoader", { x: 0, y: 0 });
      addNode("dataSplit", { x: 100, y: 0 });

      const { nodes } = usePipelineStore.getState();
      const dataLoaderId = nodes.find((n) => n.type === "dataLoader")!.id;
      const dataSplitId = nodes.find((n) => n.type === "dataSplit")!.id;

      onConnect({ source: dataLoaderId, target: dataSplitId, sourceHandle: null, targetHandle: null });

      const { edges } = usePipelineStore.getState();
      expect(edges).toHaveLength(1);
    });

    it("allows dataSplit -> trainer connections", () => {
      const { addNode, onConnect } = usePipelineStore.getState();
      addNode("dataSplit", { x: 0, y: 0 });
      addNode("trainer", { x: 100, y: 0 });

      const { nodes } = usePipelineStore.getState();
      const dataSplitId = nodes.find((n) => n.type === "dataSplit")!.id;
      const trainerId = nodes.find((n) => n.type === "trainer")!.id;

      onConnect({ source: dataSplitId, target: trainerId, sourceHandle: null, targetHandle: null });

      const { edges } = usePipelineStore.getState();
      expect(edges).toHaveLength(1);
    });

    it("rejects trainer -> dataSplit connections", () => {
      const { addNode, onConnect } = usePipelineStore.getState();
      addNode("trainer", { x: 0, y: 0 });
      addNode("dataSplit", { x: 100, y: 0 });

      const { nodes } = usePipelineStore.getState();
      const trainerId = nodes.find((n) => n.type === "trainer")!.id;
      const dataSplitId = nodes.find((n) => n.type === "dataSplit")!.id;

      onConnect({ source: trainerId, target: dataSplitId, sourceHandle: null, targetHandle: null });

      const { edges } = usePipelineStore.getState();
      expect(edges).toHaveLength(0);
    });

    it("sets isDirty when connection is made", () => {
      const { addNode, onConnect } = usePipelineStore.getState();
      addNode("dataLoader", { x: 0, y: 0 });
      addNode("script", { x: 100, y: 0 });

      usePipelineStore.setState({ isDirty: false });

      const { nodes } = usePipelineStore.getState();
      const dataLoaderId = nodes.find((n) => n.type === "dataLoader")!.id;
      const scriptId = nodes.find((n) => n.type === "script")!.id;

      onConnect({ source: dataLoaderId, target: scriptId, sourceHandle: null, targetHandle: null });

      expect(usePipelineStore.getState().isDirty).toBe(true);
    });
  });

  describe("updateNodeData", () => {
    it("updates node data and sets isDirty", () => {
      const { addNode, updateNodeData } = usePipelineStore.getState();
      addNode("dataLoader", { x: 0, y: 0 });

      usePipelineStore.setState({ isDirty: false });

      const { nodes } = usePipelineStore.getState();
      updateNodeData(nodes[0].id, { filePath: "/test/path.csv" });

      const updatedNodes = usePipelineStore.getState().nodes;
      expect(updatedNodes[0].data.filePath).toBe("/test/path.csv");
      expect(usePipelineStore.getState().isDirty).toBe(true);
    });
  });

  describe("newPipeline", () => {
    it("clears all state", () => {
      const { addNode, newPipeline } = usePipelineStore.getState();
      addNode("dataLoader", { x: 0, y: 0 });
      addNode("script", { x: 100, y: 0 });

      usePipelineStore.setState({
        currentPipelineId: "test-id",
        currentPipelineName: "Test",
        isDirty: true,
      });

      newPipeline();

      const state = usePipelineStore.getState();
      expect(state.nodes).toHaveLength(0);
      expect(state.edges).toHaveLength(0);
      expect(state.currentPipelineId).toBeNull();
      expect(state.currentPipelineName).toBeNull();
      expect(state.isDirty).toBe(false);
    });
  });

  describe("savePipeline", () => {
    it("saves pipeline and updates state", async () => {
      const { addNode, savePipeline } = usePipelineStore.getState();
      addNode("script", { x: 0, y: 0 });

      const id = await savePipeline("My Pipeline");

      const state = usePipelineStore.getState();
      expect(id).toBe("test-uuid-1234");
      expect(state.currentPipelineId).toBe("test-uuid-1234");
      expect(state.currentPipelineName).toBe("My Pipeline");
      expect(state.isDirty).toBe(false);
    });
  });

  describe("loadPipeline", () => {
    it("loads pipeline and updates state", async () => {
      const { loadPipeline } = usePipelineStore.getState();

      await loadPipeline("some-id");

      const state = usePipelineStore.getState();
      expect(state.nodes).toHaveLength(1);
      expect(state.nodes[0].id).toBe("loaded-1");
      expect(state.currentPipelineId).toBe("some-id");
      expect(state.currentPipelineName).toBe("Loaded Pipeline");
      expect(state.isDirty).toBe(false);
    });
  });
});
