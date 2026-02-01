import { useEffect, useState } from "react";
import { usePipelineStore } from "../stores/pipelineStore";
import {
  findPython,
  getPythonPath,
  setPythonPath,
  runScript,
  cancelScript,
  listenToScriptOutput,
} from "../lib/tauri";

export function Toolbar() {
  const {
    nodes,
    edges,
    executionStatus,
    pythonPath,
    setPythonPath: setStorePythonPath,
    setExecutionStatus,
    appendLog,
    clearLogs,
  } = usePipelineStore();

  const [isEditingPath, setIsEditingPath] = useState(false);
  const [pathInput, setPathInput] = useState("");

  // Load Python path on mount
  useEffect(() => {
    const loadPythonPath = async () => {
      let path = await getPythonPath();
      if (!path) {
        path = await findPython();
      }
      if (path) {
        setStorePythonPath(path);
        setPathInput(path);
      }
    };
    loadPythonPath();
  }, [setStorePythonPath]);

  // Listen to script output events
  useEffect(() => {
    const setupListener = async () => {
      const unlisten = await listenToScriptOutput((event) => {
        switch (event.type) {
          case "log":
            appendLog(event.message);
            break;
          case "progress":
            appendLog(`Progress: ${event.current}/${event.total}`);
            break;
          case "error":
            appendLog(`ERROR: ${event.message}`);
            break;
          case "complete":
            appendLog("--- Script completed ---");
            break;
          case "exit":
            setExecutionStatus(event.code === 0 ? "success" : "error");
            appendLog(`Exit code: ${event.code}`);
            break;
        }
      });
      return unlisten;
    };

    const unlistenPromise = setupListener();
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [appendLog, setExecutionStatus]);

  const handleRun = async () => {
    // Find the script node and its connected data loader
    const scriptNode = nodes.find((n) => n.type === "script");
    if (!scriptNode) {
      appendLog("ERROR: No Script node found");
      return;
    }

    const edge = edges.find((e) => e.target === scriptNode.id);
    if (!edge) {
      appendLog("ERROR: Script node is not connected to a Data Loader");
      return;
    }

    const dataLoaderNode = nodes.find((n) => n.id === edge.source);
    if (!dataLoaderNode?.data.filePath) {
      appendLog("ERROR: Data Loader has no file selected");
      return;
    }

    const scriptCode = scriptNode.data.code;
    if (!scriptCode) {
      appendLog("ERROR: Script node has no code");
      return;
    }

    clearLogs();
    setExecutionStatus("running");
    appendLog(`Running script with input: ${dataLoaderNode.data.filePath}`);

    try {
      await runScript(scriptCode, dataLoaderNode.data.filePath);
    } catch (error) {
      appendLog(`ERROR: ${error}`);
      setExecutionStatus("error");
    }
  };

  const handleCancel = async () => {
    try {
      await cancelScript();
      appendLog("--- Script cancelled ---");
      setExecutionStatus("idle");
    } catch (error) {
      appendLog(`ERROR: ${error}`);
    }
  };

  const handleSavePythonPath = async () => {
    await setPythonPath(pathInput);
    setStorePythonPath(pathInput);
    setIsEditingPath(false);
  };

  const isRunnable = nodes.some((n) => n.type === "script") &&
                     nodes.some((n) => n.type === "dataLoader" && n.data.filePath);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "12px 16px",
        backgroundColor: "#0f3460",
        borderBottom: "1px solid #394867",
      }}
    >
      <h1 style={{ fontSize: 18, fontWeight: 600 }}>MLOps Desktop</h1>

      <div style={{ flex: 1 }} />

      {/* Python path display/edit */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, color: "#9ca3af" }}>Python:</span>
        {isEditingPath ? (
          <>
            <input
              type="text"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              style={{
                padding: "4px 8px",
                backgroundColor: "#1a1a2e",
                border: "1px solid #394867",
                borderRadius: 4,
                color: "#eee",
                fontSize: 12,
                width: 300,
              }}
            />
            <button
              onClick={handleSavePythonPath}
              style={{
                padding: "4px 8px",
                backgroundColor: "#4ade80",
                color: "#1a1a2e",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Save
            </button>
            <button
              onClick={() => setIsEditingPath(false)}
              style={{
                padding: "4px 8px",
                backgroundColor: "#6b7280",
                color: "#eee",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <span style={{ fontSize: 12, color: "#eee", fontFamily: "monospace" }}>
              {pythonPath || "Not found"}
            </span>
            <button
              onClick={() => setIsEditingPath(true)}
              style={{
                padding: "4px 8px",
                backgroundColor: "#394867",
                color: "#eee",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Change
            </button>
          </>
        )}
      </div>

      <div style={{ width: 1, height: 24, backgroundColor: "#394867" }} />

      {/* Run/Cancel buttons */}
      {executionStatus === "running" ? (
        <button
          onClick={handleCancel}
          style={{
            padding: "8px 16px",
            backgroundColor: "#ef4444",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          Cancel
        </button>
      ) : (
        <button
          onClick={handleRun}
          disabled={!isRunnable}
          style={{
            padding: "8px 16px",
            backgroundColor: isRunnable ? "#4ade80" : "#394867",
            color: isRunnable ? "#1a1a2e" : "#6b7280",
            border: "none",
            borderRadius: 6,
            cursor: isRunnable ? "pointer" : "not-allowed",
            fontWeight: 500,
          }}
        >
          Run
        </button>
      )}

      {/* Status indicator */}
      <div
        style={{
          width: 12,
          height: 12,
          borderRadius: "50%",
          backgroundColor:
            executionStatus === "running"
              ? "#fbbf24"
              : executionStatus === "success"
              ? "#4ade80"
              : executionStatus === "error"
              ? "#ef4444"
              : "#6b7280",
        }}
      />
    </div>
  );
}
