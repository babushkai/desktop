import { useEffect, useRef } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { usePipelineStore } from "../stores/pipelineStore";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function OutputPanel() {
  // Rule: rerender-derived-state - Single shallow selector
  const { outputLogs, executionStatus, clearLogs } = usePipelineStore(
    useShallow((s) => ({
      outputLogs: s.outputLogs,
      executionStatus: s.executionStatus,
      clearLogs: s.clearLogs,
    }))
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [outputLogs]);

  return (
    <div className="h-[200px] glass-subtle border-t border-white/[0.08] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.08]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tracking-tight">Output</span>
          {executionStatus === "running" && (
            <span className="flex items-center gap-1 text-xs text-amber-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Running...
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={clearLogs}
          className="h-7 px-2 text-xs text-slate-400 hover:text-slate-200 glass-subtle glass-hover rounded-lg transition-button"
        >
          <Trash2 className="h-3 w-3 mr-1" />
          Clear
        </Button>
      </div>

      {/* Log content */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto p-4 font-mono text-[13px] leading-relaxed"
      >
        {outputLogs.length === 0 ? (
          <span className="text-slate-500/60 italic">
            Output will appear here when you run a script...
          </span>
        ) : (
          outputLogs.map((log, i) => (
            <div
              key={i}
              className={cn(
                log.startsWith("ERROR") && "text-red-400",
                log.startsWith("---") && "text-slate-500",
                !log.startsWith("ERROR") && !log.startsWith("---") && "text-slate-200"
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
