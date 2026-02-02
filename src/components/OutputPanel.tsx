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
  RiExpandUpDownLine,
  RiCollapseVerticalLine,
} from "@remixicon/react";
import { cn } from "@/lib/utils";
import { MetricsPanel } from "./MetricsPanel";

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

interface OutputPanelProps {
  onCollapse?: () => void;
}

const COLLAPSED_HEIGHT = 200;
const EXPANDED_HEIGHT = 450;

export function OutputPanel({ onCollapse }: OutputPanelProps) {
  const outputLogs = usePipelineStore((s) => s.outputLogs);
  const executionStatus = usePipelineStore((s) => s.executionStatus);
  const metrics = usePipelineStore((s) => s.metrics);
  const clearLogs = usePipelineStore((s) => s.clearLogs);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState<Date | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const panelHeight = isExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;

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

  const statusConfig = getStatusConfig(executionStatus);

  return (
    <div
      className="flex flex-col bg-background border-t border-white/5"
      style={{ height: panelHeight }}
    >
      <Tab.Group>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-background-surface border-b border-white/5">
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
              onClick={() => setIsExpanded(!isExpanded)}
              className="btn-ghost text-xs h-7 px-2"
              title={isExpanded ? "Collapse panel" : "Expand panel"}
            >
              {isExpanded ? (
                <RiCollapseVerticalLine className="w-3.5 h-3.5" />
              ) : (
                <RiExpandUpDownLine className="w-3.5 h-3.5" />
              )}
            </button>
            <button onClick={handleClear} className="btn-ghost text-xs h-7 px-2">
              <RiDeleteBinLine className="w-3.5 h-3.5 mr-1" />
              Clear
            </button>
          </div>
        </div>

        {/* Tab Panels */}
        <Tab.Panels className="flex-1 overflow-hidden">
          {/* Logs Panel */}
          <Tab.Panel className="h-full">
            <div
              ref={scrollRef}
              className="h-full overflow-auto p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap"
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
                      "whitespace-pre-wrap break-words",
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
          </Tab.Panel>

          {/* Metrics Panel */}
          <Tab.Panel className="h-full">
            <MetricsPanel />
          </Tab.Panel>
        </Tab.Panels>
      </Tab.Group>
    </div>
  );
}
