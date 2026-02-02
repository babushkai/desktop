import { useEffect, useRef, useCallback, useState } from "react";
import { Tab } from "@headlessui/react";
import { usePipelineStore, ExecutionStatus } from "../stores/pipelineStore";
import {
  RiTerminalLine,
  RiDeleteBinLine,
  RiLoader4Line,
  RiCheckLine,
  RiCloseLine,
  RiTimeLine,
  RiArrowDownSLine,
  RiBarChartBoxLine,
  RiFileCopyLine,
  RiHistoryLine,
  RiBox3Line,
} from "@remixicon/react";
import { cn } from "@/lib/utils";
import { MetricsPanel } from "./MetricsPanel";
import { RunsPanel } from "./RunsPanel";
import { ModelsPanel } from "./ModelsPanel";
import { listModels } from "@/lib/tauri";

interface StatusConfig {
  label: string;
  icon: React.ReactNode;
  colorClass: string;
  bgClass: string;
}

function getStatusConfig(status: ExecutionStatus): StatusConfig {
  switch (status) {
    case "idle":
      return {
        label: "Idle",
        icon: <RiTimeLine className="w-3 h-3" />,
        colorClass: "text-text-muted",
        bgClass: "bg-white/10",
      };
    case "running":
      return {
        label: "Running",
        icon: <RiLoader4Line className="w-3 h-3 animate-spin" />,
        colorClass: "text-accent",
        bgClass: "bg-accent/20",
      };
    case "success":
      return {
        label: "Success",
        icon: <RiCheckLine className="w-3 h-3" />,
        colorClass: "text-state-success",
        bgClass: "bg-state-success/20",
      };
    case "error":
      return {
        label: "Failed",
        icon: <RiCloseLine className="w-3 h-3" />,
        colorClass: "text-state-error",
        bgClass: "bg-state-error/20",
      };
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = ((ms % 60000) / 1000).toFixed(0);
  return `${mins}m ${secs}s`;
}

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getLogClass(log: string): string {
  // Error lines
  if (log.startsWith("ERROR") || log.includes("Traceback")) {
    return "text-log-error";
  }
  // Section headers (--- text ---)
  if (log.startsWith("---")) {
    return "text-log-info";
  }
  // Separators (only = or - chars, 3+ length)
  if (/^[=\-]{3,}$/.test(log.trim())) {
    return "text-log-muted";
  }
  // Default
  return "text-log-text";
}

interface OutputPanelProps {
  onCollapse?: () => void;
}

const DEFAULT_HEIGHT = 240;
const MIN_HEIGHT = 150;
const MAX_HEIGHT = 600;

export function OutputPanel({ onCollapse }: OutputPanelProps) {
  const outputLogs = usePipelineStore((s) => s.outputLogs);
  const executionStatus = usePipelineStore((s) => s.executionStatus);
  const metrics = usePipelineStore((s) => s.metrics);
  const clearLogs = usePipelineStore((s) => s.clearLogs);
  const runHistory = usePipelineStore((s) => s.runHistory);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState<Date | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [panelHeight, setPanelHeight] = useState(DEFAULT_HEIGHT);
  const [isResizing, setIsResizing] = useState(false);
  const [modelCount, setModelCount] = useState(0);

  // Load model count
  useEffect(() => {
    listModels().then((models) => setModelCount(models.length));
  }, []);

  // Handle resize drag
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newHeight = window.innerHeight - e.clientY;
      setPanelHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, newHeight)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

  // Track execution timing
  useEffect(() => {
    if (executionStatus === "running") {
      const now = new Date();
      setStartTime(now);
      setEndTime(null);
      setElapsedMs(0);
    } else if (
      executionStatus === "success" ||
      executionStatus === "error"
    ) {
      const now = new Date();
      setEndTime(now);
      if (startTime) {
        setElapsedMs(now.getTime() - startTime.getTime());
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executionStatus]);

  // Live elapsed time while running
  useEffect(() => {
    if (executionStatus !== "running" || !startTime) return;

    const interval = setInterval(() => {
      setElapsedMs(Date.now() - startTime.getTime());
    }, 100);

    return () => clearInterval(interval);
  }, [executionStatus, startTime]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [outputLogs]);

  const handleClear = useCallback(() => {
    clearLogs();
    setStartTime(null);
    setEndTime(null);
    setElapsedMs(0);
  }, [clearLogs]);

  const handleCopy = useCallback(async () => {
    const text = outputLogs.join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [outputLogs]);

  const statusConfig = getStatusConfig(executionStatus);

  return (
    <div
      className="flex flex-col panel-footer"
      style={{ height: panelHeight }}
    >
      {/* Resize handle */}
      <div
        className={cn(
          "h-2 cursor-ns-resize flex items-center justify-center shrink-0 border-t border-white/10 hover:border-accent transition-colors",
          isResizing && "border-accent"
        )}
        onMouseDown={() => setIsResizing(true)}
      >
        <div className={cn(
          "w-12 h-1 rounded-full bg-white/20 hover:bg-accent transition-colors",
          isResizing && "bg-accent"
        )} />
      </div>
      <Tab.Group as="div" className="flex flex-col flex-1 min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {onCollapse && (
                <button
                  onClick={onCollapse}
                  className="p-1 -ml-1 rounded hover:bg-white/10 text-text-muted hover:text-text-primary transition-colors"
                  title="Collapse panel (Ctrl+J)"
                >
                  <RiArrowDownSLine className="w-4 h-4" />
                </button>
              )}

              {/* Tabs */}
              <Tab.List className="flex items-center gap-1 bg-background rounded-lg p-0.5">
                <Tab
                  className={({ selected }) =>
                    cn(
                      "flex items-center gap-1.5 px-3 py-1 rounded-md text-sm font-medium transition-colors",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                      selected
                        ? "bg-background-elevated text-text-primary"
                        : "text-text-muted hover:text-text-secondary"
                    )
                  }
                >
                  <RiTerminalLine className="w-3.5 h-3.5" />
                  Logs
                </Tab>
                <Tab
                  className={({ selected }) =>
                    cn(
                      "flex items-center gap-1.5 px-3 py-1 rounded-md text-sm font-medium transition-colors",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                      selected
                        ? "bg-background-elevated text-text-primary"
                        : "text-text-muted hover:text-text-secondary",
                      metrics && "text-accent"
                    )
                  }
                >
                  <RiBarChartBoxLine className="w-3.5 h-3.5" />
                  Metrics
                  {metrics && (
                    <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                  )}
                </Tab>
                <Tab
                  className={({ selected }) =>
                    cn(
                      "flex items-center gap-1.5 px-3 py-1 rounded-md text-sm font-medium transition-colors",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                      selected
                        ? "bg-background-elevated text-text-primary"
                        : "text-text-muted hover:text-text-secondary"
                    )
                  }
                >
                  <RiHistoryLine className="w-3.5 h-3.5" />
                  Runs
                  {runHistory.length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-accent/20 text-accent">
                      {runHistory.length > 99 ? "99+" : runHistory.length}
                    </span>
                  )}
                </Tab>
                <Tab
                  className={({ selected }) =>
                    cn(
                      "flex items-center gap-1.5 px-3 py-1 rounded-md text-sm font-medium transition-colors",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                      selected
                        ? "bg-background-elevated text-text-primary"
                        : "text-text-muted hover:text-text-secondary"
                    )
                  }
                >
                  <RiBox3Line className="w-3.5 h-3.5" />
                  Models
                  {modelCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-accent/20 text-accent">
                      {modelCount > 99 ? "99+" : modelCount}
                    </span>
                  )}
                </Tab>
              </Tab.List>
            </div>

            {/* Status Badge */}
            <div
              className={cn(
                "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium",
                statusConfig.colorClass,
                statusConfig.bgClass
              )}
            >
              {statusConfig.icon}
              <span>{statusConfig.label}</span>
            </div>

            {/* Execution Metadata */}
            {(startTime || elapsedMs > 0) && (
              <div className="flex items-center gap-3 text-xs text-text-secondary">
                {elapsedMs > 0 && (
                  <span className="flex items-center gap-1">
                    <RiTimeLine className="w-3 h-3" />
                    {formatDuration(elapsedMs)}
                  </span>
                )}
                {startTime && (
                  <span>
                    {endTime ? "Finished" : "Started"} at {formatTimestamp(endTime || startTime)}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleCopy}
              disabled={outputLogs.length === 0}
              className="btn-ghost text-xs h-7 px-2 disabled:opacity-50"
              title="Copy logs to clipboard"
            >
              <RiFileCopyLine className="w-3.5 h-3.5 mr-1" />
              {copied ? "Copied!" : "Copy"}
            </button>
            <button onClick={handleClear} className="btn-ghost text-xs h-7 px-2">
              <RiDeleteBinLine className="w-3.5 h-3.5 mr-1" />
              Clear
            </button>
          </div>
        </div>

        {/* Tab Panels */}
        <Tab.Panels className="flex-1 min-h-0">
          {/* Logs Panel - GitHub Dark Theme */}
          <Tab.Panel className="h-full overflow-auto bg-log-bg">
            <div
              ref={scrollRef}
              className="p-4 font-mono text-[13px] leading-[1.6]"
            >
              {outputLogs.length === 0 ? (
                <span className="text-log-muted">
                  Output will appear here when you run a script...
                </span>
              ) : (
                outputLogs.map((log, i) => (
                  <div
                    key={i}
                    className={cn("whitespace-pre-wrap break-words", getLogClass(log))}
                  >
                    {log}
                  </div>
                ))
              )}
            </div>
          </Tab.Panel>

          {/* Metrics Panel */}
          <Tab.Panel className="h-full">
            <MetricsPanel />
          </Tab.Panel>

          {/* Runs Panel */}
          <Tab.Panel className="h-full">
            <RunsPanel />
          </Tab.Panel>

          {/* Models Panel */}
          <Tab.Panel className="h-full">
            <ModelsPanel />
          </Tab.Panel>
        </Tab.Panels>
      </Tab.Group>
    </div>
  );
}
