import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Canvas } from "./components/Canvas";
import { NodePalette } from "./components/NodePalette";
import { OutputPanel } from "./components/OutputPanel";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { Toolbar } from "./components/Toolbar";

function App() {
  return (
    <ReactFlowProvider>
      <div className="flex flex-col h-screen bg-slate-900 text-slate-100">
        <Toolbar />
        <div className="flex flex-1 overflow-hidden">
          <NodePalette />
          <div className="flex-1 relative">
            <Canvas />
          </div>
          <PropertiesPanel />
        </div>
        <OutputPanel />
      </div>
    </ReactFlowProvider>
  );
}

export default App;
