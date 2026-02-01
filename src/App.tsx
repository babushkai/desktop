import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Canvas } from "./components/Canvas";
import { NodePalette } from "./components/NodePalette";
import { OutputPanel } from "./components/OutputPanel";
import { Toolbar } from "./components/Toolbar";

function App() {
  return (
    <ReactFlowProvider>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          backgroundColor: "#1a1a2e",
          color: "#eee",
        }}
      >
        {/* Toolbar */}
        <Toolbar />

        {/* Main content area */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Sidebar with node palette */}
          <NodePalette />

          {/* Canvas area */}
          <div style={{ flex: 1, position: "relative" }}>
            <Canvas />
          </div>
        </div>

        {/* Output panel */}
        <OutputPanel />
      </div>
    </ReactFlowProvider>
  );
}

export default App;
