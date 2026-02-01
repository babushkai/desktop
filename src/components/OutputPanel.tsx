import { useEffect, useRef, useCallback } from "react";
import { usePipelineStore } from "../stores/pipelineStore";
import { RiTerminalLine, RiDeleteBinLine } from "@remixicon/react";
import { cn } from "@/lib/utils";

export function OutputPanel() {
  const outputLogs = usePipelineStore((s) => s.outputLogs);
  const executionStatus = usePipelineStore((s) => s.executionStatus);
  const clearLogs = usePipelineStore((s) => s.clearLogs);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [outputLogs]);

  const handleClear = useCallback(() => {
    clearLogs();
  }, [clearLogs]);

  return (
    <div className="h-52 flex flex-col bg-background border-t border-white/5">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-background-surface border-b border-white/5">
        <div className="flex items-center gap-2">
          <RiTerminalLine className="w-4 h-4 text-text-muted" />
          <span className="text-sm font-medium text-text-primary">Output</span>
          {executionStatus === "running" && (
            <span className="flex items-center gap-1.5 text-xs text-state-warning">
              <span className="w-2 h-2 rounded-full bg-state-warning animate-pulse" />
              Running...
            </span>
          )}
        </div>
        <button onClick={handleClear} className="btn-ghost text-xs h-7 px-2">
          <RiDeleteBinLine className="w-3.5 h-3.5 mr-1" />
          Clear
        </button>
      </div>

      {/* Log content */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto p-4 font-mono text-sm leading-relaxed"
      >
        {outputLogs.length === 0 ? (
          <span className="text-text-muted">
            Output will appear here when you run a script...
          </span>
        ) : (
          outputLogs.map((log, i) => (
            <div
              key={i}
              className={cn(
                log.startsWith("ERROR") && "text-state-error",
                log.startsWith("---") && "text-text-muted",
                !log.startsWith("ERROR") && !log.startsWith("---") && "text-text-primary"
              )}
            >
              {log}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
