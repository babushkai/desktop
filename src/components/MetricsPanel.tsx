import { useEffect, useState, Fragment } from "react";
import { Menu, Transition } from "@headlessui/react";
import { RiBarChartBoxLine, RiArrowDownSLine, RiTimeLine } from "@remixicon/react";
import { usePipelineStore } from "@/stores/pipelineStore";
import { MetricsBarChart, ConfusionMatrixChart } from "./charts";
import { getRunMetrics, MetricsData, Metric, RunMetadata } from "@/lib/tauri";
import { cn } from "@/lib/utils";

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function metricsToData(metrics: Metric[]): MetricsData | null {
  if (metrics.length === 0) return null;

  const data: MetricsData = { modelType: "classifier" };

  for (const m of metrics) {
    if (m.name === "accuracy" && m.value !== undefined) data.accuracy = m.value;
    if (m.name === "precision" && m.value !== undefined) data.precision = m.value;
    if (m.name === "recall" && m.value !== undefined) data.recall = m.value;
    if (m.name === "f1" && m.value !== undefined) data.f1 = m.value;
    if (m.name === "r2" && m.value !== undefined) {
      data.r2 = m.value;
      data.modelType = "regressor";
    }
    if (m.name === "mse" && m.value !== undefined) {
      data.mse = m.value;
      data.modelType = "regressor";
    }
    if (m.name === "rmse" && m.value !== undefined) {
      data.rmse = m.value;
      data.modelType = "regressor";
    }
    if (m.name === "mae" && m.value !== undefined) {
      data.mae = m.value;
      data.modelType = "regressor";
    }
    if (m.name === "confusion_matrix" && m.value_json) {
      try {
        data.confusionMatrix = JSON.parse(m.value_json);
      } catch {
        // ignore parse errors
      }
    }
  }

  return data;
}

interface RunSelectorProps {
  runHistory: RunMetadata[];
  selectedRunId: string | null;
  currentRunId: string | null;
  onSelect: (id: string | null) => void;
}

function RunSelector({ runHistory, selectedRunId, currentRunId, onSelect }: RunSelectorProps) {
  const selectedRun = runHistory.find((r) => r.id === (selectedRunId || currentRunId));

  if (runHistory.length === 0) return null;

  return (
    <Menu as="div" className="relative">
      <Menu.Button className="flex items-center gap-1.5 px-2 py-1 text-xs rounded bg-background-elevated hover:bg-white/10 transition-colors">
        <RiTimeLine className="w-3.5 h-3.5 text-text-muted" />
        <span className="text-text-secondary">
          {selectedRun ? formatTime(selectedRun.started_at) : "Select run"}
        </span>
        <RiArrowDownSLine className="w-3 h-3 text-text-muted" />
      </Menu.Button>

      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items className="absolute right-0 mt-1 w-56 origin-top-right rounded-lg bg-background-surface border border-white/10 shadow-lg focus:outline-none z-50 max-h-64 overflow-y-auto">
          <div className="py-1">
            {runHistory.map((run) => {
              const isCurrent = run.id === currentRunId;
              const isSelected = run.id === (selectedRunId || currentRunId);

              return (
                <Menu.Item key={run.id}>
                  {({ active }) => (
                    <button
                      onClick={() => onSelect(run.id)}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2 text-xs",
                        active && "bg-background-elevated",
                        isSelected && "bg-accent/10"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "w-2 h-2 rounded-full",
                            run.status === "completed" && "bg-state-success",
                            run.status === "failed" && "bg-state-error",
                            run.status === "running" && "bg-state-warning animate-pulse"
                          )}
                        />
                        <span className={cn("text-text-secondary", isCurrent && "font-medium")}>
                          {formatTime(run.started_at)}
                          {isCurrent && " (current)"}
                        </span>
                      </div>
                      <span className="text-text-muted">{formatRelativeTime(run.started_at)}</span>
                    </button>
                  )}
                </Menu.Item>
              );
            })}
          </div>
        </Menu.Items>
      </Transition>
    </Menu>
  );
}

export function MetricsPanel() {
  const metrics = usePipelineStore((s) => s.metrics);
  const runHistory = usePipelineStore((s) => s.runHistory);
  const currentRunId = usePipelineStore((s) => s.currentRunId);
  const selectedRunId = usePipelineStore((s) => s.selectedRunId);
  const setSelectedRunId = usePipelineStore((s) => s.setSelectedRunId);
  const currentPipelineName = usePipelineStore((s) => s.currentPipelineName);
  const loadRunHistory = usePipelineStore((s) => s.loadRunHistory);

  const [historicalMetrics, setHistoricalMetrics] = useState<MetricsData | null>(null);

  // Load run history when pipeline name changes
  useEffect(() => {
    loadRunHistory(currentPipelineName || undefined);
  }, [currentPipelineName, loadRunHistory]);

  // Load metrics when selected run changes
  useEffect(() => {
    if (selectedRunId && selectedRunId !== currentRunId) {
      getRunMetrics(selectedRunId).then((m) => {
        setHistoricalMetrics(metricsToData(m));
      });
    } else {
      setHistoricalMetrics(null);
    }
  }, [selectedRunId, currentRunId]);

  // Use historical metrics if viewing a past run, otherwise use current metrics
  const displayMetrics = selectedRunId && selectedRunId !== currentRunId ? historicalMetrics : metrics;

  const renderHeader = () => {
    if (runHistory.length === 0) return null;

    return (
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
        <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Metrics</span>
        <RunSelector
          runHistory={runHistory}
          selectedRunId={selectedRunId}
          currentRunId={currentRunId}
          onSelect={setSelectedRunId}
        />
      </div>
    );
  };

  if (!displayMetrics) {
    return (
      <div className="flex flex-col h-full">
        {renderHeader()}
        <div className="flex flex-col items-center justify-center flex-1 text-text-muted">
          <RiBarChartBoxLine className="w-8 h-8 mb-2 opacity-50" />
          <p className="text-sm">Run an Evaluator node to see metrics</p>
        </div>
      </div>
    );
  }

  if (displayMetrics.modelType === "classifier") {
    const labels = ["Accuracy", "Precision", "Recall", "F1"];
    const values = [
      displayMetrics.accuracy ?? 0,
      displayMetrics.precision ?? 0,
      displayMetrics.recall ?? 0,
      displayMetrics.f1 ?? 0,
    ];

    return (
      <div className="flex flex-col h-full">
        {renderHeader()}
        <div className="flex gap-4 flex-1 p-2 min-h-0">
          <div className="flex-1 min-w-0">
            <MetricsBarChart
              labels={labels}
              values={values}
              title="Classification Metrics"
            />
          </div>
          {displayMetrics.confusionMatrix && (
            <div className="flex-1 min-w-0">
              <ConfusionMatrixChart
                matrix={displayMetrics.confusionMatrix}
                title="Confusion Matrix"
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (displayMetrics.modelType === "regressor") {
    const labels = ["R2", "MSE", "RMSE", "MAE"];
    const values = [
      displayMetrics.r2 ?? 0,
      displayMetrics.mse ?? 0,
      displayMetrics.rmse ?? 0,
      displayMetrics.mae ?? 0,
    ];

    return (
      <div className="flex flex-col h-full">
        {renderHeader()}
        <div className="flex gap-4 flex-1 p-2 min-h-0">
          <div className="flex-1 min-w-0">
            <MetricsBarChart
              labels={labels}
              values={values}
              title="Regression Metrics"
            />
          </div>
        </div>
      </div>
    );
  }

  // Unknown model type - show empty state
  return (
    <div className="flex flex-col h-full">
      {renderHeader()}
      <div className="flex flex-col items-center justify-center flex-1 text-text-muted">
        <RiBarChartBoxLine className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">Unknown model type: {displayMetrics.modelType}</p>
      </div>
    </div>
  );
}
