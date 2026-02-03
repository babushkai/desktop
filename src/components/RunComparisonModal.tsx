import { useState, useEffect, Fragment } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { RiLoader4Line, RiCloseLine, RiTrophyLine } from "@remixicon/react";
import { getRunsForComparison, RunComparison, RunMetadata } from "@/lib/tauri";
import { cn } from "@/lib/utils";

interface RunComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  runIds: string[];
  runs: RunMetadata[]; // Full run metadata for display names
}

// Metrics where higher is better (for highlighting best)
const HIGHER_IS_BETTER = ['accuracy', 'precision', 'recall', 'f1', 'r2'];
// Metrics where lower is better
const LOWER_IS_BETTER = ['mse', 'rmse', 'mae'];

export function RunComparisonModal({
  isOpen,
  onClose,
  runIds,
  runs,
}: RunComparisonModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comparison, setComparison] = useState<RunComparison | null>(null);

  useEffect(() => {
    if (isOpen && runIds.length >= 2) {
      setLoading(true);
      setError(null);
      getRunsForComparison(runIds)
        .then(setComparison)
        .catch((err) => setError(err instanceof Error ? err.message : "Failed to load comparison"))
        .finally(() => setLoading(false));
    }
  }, [isOpen, runIds]);

  // Get display name for a run
  const getRunDisplayName = (runId: string): string => {
    const run = runs.find((r) => r.id === runId);
    if (run?.display_name) return run.display_name;
    if (run?.started_at) {
      return new Date(run.started_at).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return runId.slice(0, 8);
  };

  // Find best value for a metric across runs
  const findBestRunId = (
    metricName: string,
    metrics: Record<string, Record<string, number | null>>
  ): string | null => {
    const isHigherBetter = HIGHER_IS_BETTER.includes(metricName);
    const isLowerBetter = LOWER_IS_BETTER.includes(metricName);

    if (!isHigherBetter && !isLowerBetter) return null;

    let bestRunId: string | null = null;
    let bestValue: number | null = null;

    for (const runId of runIds) {
      const value = metrics[runId]?.[metricName];
      if (value === null || value === undefined) continue;

      if (bestValue === null) {
        bestValue = value;
        bestRunId = runId;
      } else if (isHigherBetter && value > bestValue) {
        bestValue = value;
        bestRunId = runId;
      } else if (isLowerBetter && value < bestValue) {
        bestValue = value;
        bestRunId = runId;
      }
    }

    return bestRunId;
  };

  // Get all unique metric names across runs
  const getMetricNames = (): string[] => {
    if (!comparison) return [];
    const names = new Set<string>();
    for (const runMetrics of Object.values(comparison.metrics)) {
      for (const name of Object.keys(runMetrics)) {
        // Exclude complex JSON metrics like confusion_matrix
        if (typeof runMetrics[name] === 'number' || runMetrics[name] === null) {
          names.add(name);
        }
      }
    }
    return Array.from(names).sort();
  };

  // Get all unique hyperparameter names across runs
  const getHyperparamNames = (): string[] => {
    if (!comparison) return [];
    const names = new Set<string>();
    for (const runParams of Object.values(comparison.hyperparameters)) {
      for (const name of Object.keys(runParams)) {
        names.add(name);
      }
    }
    return Array.from(names).sort();
  };

  // Check if hyperparameters differ between runs
  const hyperparamsDiffer = (paramName: string): boolean => {
    if (!comparison || runIds.length < 2) return false;
    const values = runIds.map((id) =>
      JSON.stringify(comparison.hyperparameters[id]?.[paramName])
    );
    return new Set(values).size > 1;
  };

  // Format metric value for display
  const formatMetric = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return '-';
    if (Math.abs(value) < 0.001) return value.toExponential(2);
    if (Math.abs(value) >= 1000) return value.toFixed(0);
    return value.toFixed(4);
  };

  // Format hyperparameter value for display
  const formatHyperparam = (value: unknown): string => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') {
      if (Number.isInteger(value)) return String(value);
      return value.toFixed(4);
    }
    return String(value);
  };

  const metricNames = getMetricNames();
  const hyperparamNames = getHyperparamNames();

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-4xl rounded-xl bg-background-surface border border-white/10 p-6 shadow-xl max-h-[85vh] flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <Dialog.Title className="text-lg font-semibold text-text-primary">
                    Compare Runs ({runIds.length})
                  </Dialog.Title>
                  <button onClick={onClose} className="text-text-muted hover:text-text-primary">
                    <RiCloseLine className="w-5 h-5" />
                  </button>
                </div>

                {loading ? (
                  <div className="flex-1 flex items-center justify-center py-12">
                    <RiLoader4Line className="w-6 h-6 animate-spin text-text-muted" />
                    <span className="ml-2 text-text-muted">Loading comparison...</span>
                  </div>
                ) : error ? (
                  <div className="text-sm text-state-error bg-state-error/10 rounded-lg px-3 py-2">
                    {error}
                  </div>
                ) : comparison ? (
                  <div className="flex-1 overflow-auto">
                    {/* Metrics Section */}
                    {metricNames.length > 0 && (
                      <div className="mb-6">
                        <h3 className="text-sm font-medium text-text-secondary mb-3">Metrics</h3>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-white/10">
                              <th className="text-left py-2 pr-4 text-text-muted font-medium">Metric</th>
                              {runIds.map((runId) => (
                                <th
                                  key={runId}
                                  className="text-right py-2 px-3 text-text-muted font-medium min-w-[100px]"
                                >
                                  {getRunDisplayName(runId)}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {metricNames.map((metricName) => {
                              const bestRunId = findBestRunId(metricName, comparison.metrics);
                              return (
                                <tr key={metricName} className="border-b border-white/5">
                                  <td className="py-2 pr-4 text-text-secondary capitalize">
                                    {metricName.replace(/_/g, ' ')}
                                  </td>
                                  {runIds.map((runId) => {
                                    const value = comparison.metrics[runId]?.[metricName];
                                    const isBest = bestRunId === runId && value !== null;
                                    return (
                                      <td
                                        key={runId}
                                        className={cn(
                                          "text-right py-2 px-3 font-mono",
                                          isBest ? "text-accent font-medium" : "text-text-primary"
                                        )}
                                      >
                                        <span className="inline-flex items-center gap-1">
                                          {formatMetric(value)}
                                          {isBest && <RiTrophyLine className="w-3.5 h-3.5" />}
                                        </span>
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Hyperparameters Section */}
                    {hyperparamNames.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-text-secondary mb-3">Hyperparameters</h3>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-white/10">
                              <th className="text-left py-2 pr-4 text-text-muted font-medium">Parameter</th>
                              {runIds.map((runId) => (
                                <th
                                  key={runId}
                                  className="text-right py-2 px-3 text-text-muted font-medium min-w-[100px]"
                                >
                                  {getRunDisplayName(runId)}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {hyperparamNames.map((paramName) => {
                              const differs = hyperparamsDiffer(paramName);
                              return (
                                <tr key={paramName} className="border-b border-white/5">
                                  <td className="py-2 pr-4 text-text-secondary">
                                    {paramName}
                                  </td>
                                  {runIds.map((runId) => {
                                    const value = comparison.hyperparameters[runId]?.[paramName];
                                    return (
                                      <td
                                        key={runId}
                                        className={cn(
                                          "text-right py-2 px-3 font-mono",
                                          differs ? "text-state-warning" : "text-text-primary"
                                        )}
                                      >
                                        {formatHyperparam(value)}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {metricNames.length === 0 && hyperparamNames.length === 0 && (
                      <div className="text-center py-12 text-text-muted">
                        No metrics or hyperparameters to compare
                      </div>
                    )}

                    {/* Legend */}
                    <div className="mt-6 pt-4 border-t border-white/10 text-xs text-text-muted flex gap-4">
                      <span className="inline-flex items-center gap-1">
                        <RiTrophyLine className="w-3.5 h-3.5 text-accent" />
                        Best value for metric
                      </span>
                      <span className="text-state-warning">
                        Highlighted = differs between runs
                      </span>
                    </div>
                  </div>
                ) : null}

                <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-white/10">
                  <button onClick={onClose} className="btn-secondary">
                    Close
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
