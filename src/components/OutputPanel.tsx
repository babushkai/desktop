import { useEffect, useRef } from "react";
import { usePipelineStore } from "../stores/pipelineStore";

export function OutputPanel() {
  const { outputLogs, executionStatus, clearLogs } = usePipelineStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [outputLogs]);

  return (
    <div
      style={{
        height: 200,
        backgroundColor: "#0f0f23",
        borderTop: "1px solid #394867",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 16px",
          backgroundColor: "#1a1a2e",
          borderBottom: "1px solid #394867",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>Output</span>
          {executionStatus === "running" && (
            <span
              style={{
                fontSize: 12,
                color: "#fbbf24",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: "#fbbf24",
                  animation: "pulse 1s infinite",
                }}
              />
              Running...
            </span>
          )}
        </div>
        <button
          onClick={clearLogs}
          style={{
            padding: "4px 8px",
            backgroundColor: "transparent",
            color: "#9ca3af",
            border: "1px solid #394867",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Clear
        </button>
      </div>

      {/* Log content */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflow: "auto",
          padding: 16,
          fontFamily: "monospace",
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        {outputLogs.length === 0 ? (
          <span style={{ color: "#6b7280" }}>
            Output will appear here when you run a script...
          </span>
        ) : (
          outputLogs.map((log, i) => (
            <div
              key={i}
              style={{
                color: log.startsWith("ERROR")
                  ? "#ef4444"
                  : log.startsWith("---")
                  ? "#9ca3af"
                  : "#eee",
              }}
            >
              {log}
            </div>
          ))
        )}
      </div>

      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}
      </style>
    </div>
  );
}
