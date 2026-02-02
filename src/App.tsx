import { useState, useEffect, useCallback } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Canvas } from "./components/Canvas";
import { NodePalette } from "./components/NodePalette";
import { OutputPanel } from "./components/OutputPanel";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { Toolbar } from "./components/Toolbar";
import { cn } from "./lib/utils";
import {
  RiLayoutLeftLine,
  RiTerminalBoxLine,
} from "@remixicon/react";

function App() {
  const [showNodePalette, setShowNodePalette] = useState(true);
  const [showOutputPanel, setShowOutputPanel] = useState(true);

  // Keyboard shortcuts for panel toggles
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in input fields
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      // Ctrl/Cmd + B: Toggle node palette (like VS Code sidebar)
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        setShowNodePalette((prev) => !prev);
      }

      // Ctrl/Cmd + J: Toggle output panel (like VS Code terminal)
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        setShowOutputPanel((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const toggleNodePalette = useCallback(() => {
    setShowNodePalette((prev) => !prev);
  }, []);

  const toggleOutputPanel = useCallback(() => {
    setShowOutputPanel((prev) => !prev);
  }, []);

  return (
    <ReactFlowProvider>
      <div className="flex flex-col h-screen bg-background text-text-primary">
        <Toolbar
          showNodePalette={showNodePalette}
          showOutputPanel={showOutputPanel}
          onToggleNodePalette={toggleNodePalette}
          onToggleOutputPanel={toggleOutputPanel}
        />

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Node Palette - collapsible */}
          <div
            className={cn(
              "transition-all duration-200 ease-out overflow-hidden",
              showNodePalette ? "w-56" : "w-0"
            )}
          >
            {showNodePalette && <NodePalette onCollapse={toggleNodePalette} />}
          </div>

          {/* Collapsed tab for NodePalette */}
          {!showNodePalette && (
            <button
              onClick={toggleNodePalette}
              className={cn(
                "flex items-center justify-center w-6",
                "bg-background-surface border-r border-white/5",
                "hover:bg-background-elevated transition-colors",
                "text-text-muted hover:text-text-primary"
              )}
              title="Show Components Panel (Ctrl+B)"
            >
              <RiLayoutLeftLine className="w-4 h-4" />
            </button>
          )}

          <div className="flex-1 relative">
            <Canvas />
          </div>

          <PropertiesPanel />
        </div>

        {/* Output Panel - collapsible */}
        {showOutputPanel && <OutputPanel onCollapse={toggleOutputPanel} />}

        {/* Collapsed tab for OutputPanel */}
        {!showOutputPanel && (
          <button
            onClick={toggleOutputPanel}
            className={cn(
              "flex items-center justify-center gap-2 h-7 px-3",
              "bg-background-surface border-t border-white/5",
              "hover:bg-background-elevated transition-colors",
              "text-text-muted hover:text-text-primary text-xs"
            )}
            title="Show Output Panel (Ctrl+J)"
          >
            <RiTerminalBoxLine className="w-4 h-4" />
            <span>Output</span>
          </button>
        )}
      </div>
    </ReactFlowProvider>
  );
}

export default App;
