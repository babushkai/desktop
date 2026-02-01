import { usePipelineStore } from "../stores/pipelineStore";

export function NodePalette() {
  const addNode = usePipelineStore((state) => state.addNode);

  const handleAddDataLoader = () => {
    addNode("dataLoader", { x: 100, y: 100 + Math.random() * 100 });
  };

  const handleAddScript = () => {
    addNode("script", { x: 400, y: 100 + Math.random() * 100 });
  };

  const handleAddTrainer = () => {
    addNode("trainer", { x: 400, y: 100 + Math.random() * 100 });
  };

  const handleAddEvaluator = () => {
    addNode("evaluator", { x: 700, y: 100 + Math.random() * 100 });
  };

  const handleAddModelExporter = () => {
    addNode("modelExporter", { x: 900, y: 100 + Math.random() * 100 });
  };

  return (
    <div
      style={{
        width: 200,
        backgroundColor: "#0f3460",
        padding: 16,
        borderRight: "1px solid #394867",
      }}
    >
      <h3 style={{ marginBottom: 16, fontSize: 14, color: "#9ca3af" }}>
        Nodes
      </h3>

      <button
        onClick={handleAddDataLoader}
        style={{
          width: "100%",
          padding: "12px 16px",
          marginBottom: 8,
          backgroundColor: "#4ade80",
          color: "#1a1a2e",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 18 }}>📁</span>
        Data Loader
      </button>

      <button
        onClick={handleAddScript}
        style={{
          width: "100%",
          padding: "12px 16px",
          marginBottom: 8,
          backgroundColor: "#60a5fa",
          color: "#1a1a2e",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 18 }}>📜</span>
        Script
      </button>

      <button
        onClick={handleAddTrainer}
        style={{
          width: "100%",
          padding: "12px 16px",
          marginBottom: 8,
          backgroundColor: "#a78bfa",
          color: "#1a1a2e",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 18 }}>🧠</span>
        Trainer
      </button>

      <button
        onClick={handleAddEvaluator}
        style={{
          width: "100%",
          padding: "12px 16px",
          marginBottom: 8,
          backgroundColor: "#fb923c",
          color: "#1a1a2e",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 18 }}>📊</span>
        Evaluator
      </button>

      <button
        onClick={handleAddModelExporter}
        style={{
          width: "100%",
          padding: "12px 16px",
          backgroundColor: "#5eead4",
          color: "#1a1a2e",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 18 }}>📦</span>
        Model Exporter
      </button>

      <div
        style={{
          marginTop: 24,
          padding: 12,
          backgroundColor: "#1a1a2e",
          borderRadius: 6,
          fontSize: 12,
          color: "#9ca3af",
        }}
      >
        <p style={{ marginBottom: 8 }}>
          <strong>Tip:</strong> Build a pipeline with nodes.
        </p>
        <p>DataLoader → Trainer → Evaluator → Model Exporter</p>
      </div>
    </div>
  );
}
