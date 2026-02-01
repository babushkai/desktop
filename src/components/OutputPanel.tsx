import { useEffect, useRef } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { usePipelineStore } from "../stores/pipelineStore";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
    <div className="h-[200px] bg-slate-950 border-t border-slate-700 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Output</span>
          {executionStatus === "running" && (
            <span className="flex items-center gap-1 text-xs text-yellow-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Running...
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={clearLogs}
          className="h-7 px-2 text-xs text-slate-400 hover:text-slate-200"
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
          <span className="text-slate-500">
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
