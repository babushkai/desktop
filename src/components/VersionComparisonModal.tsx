import { useState, useEffect, Fragment } from "react";
import { Dialog, Transition } from "@headlessui/react";
import {
  RiLoader4Line,
  RiCloseLine,
  RiTrophyLine,
  RiCheckLine,
} from "@remixicon/react";
import {
  ModelVersion,
  ModelVersionComparison,
  getModelVersionsForComparison,
  getComparableVersions,
} from "@/lib/tauri";
import { cn } from "@/lib/utils";

interface VersionComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  modelId: string;
  modelName: string;
}

// Metrics where higher is better (for highlighting best)
const HIGHER_IS_BETTER = ["accuracy", "precision", "recall", "f1", "r2"];
// Metrics where lower is better
const LOWER_IS_BETTER = ["mse", "rmse", "mae"];

const MAX_VERSIONS_TO_COMPARE = 5;

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStageBadge(stage: string) {
  switch (stage) {
    case "production":
      return { className: "text-state-success bg-state-success/20" };
    case "staging":
      return { className: "text-state-warning bg-state-warning/20" };
    case "archived":
      return { className: "text-text-muted bg-white/5" };
    default:
      return { className: "text-text-muted bg-white/10" };
  }
}

export function VersionComparisonModal({
  isOpen,
  onClose,
  modelId,
  modelName,
}: VersionComparisonModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableVersions, setAvailableVersions] = useState<ModelVersion[]>(
    []
  );
  const [selectedVersionIds, setSelectedVersionIds] = useState<string[]>([]);
  const [comparison, setComparison] = useState<ModelVersionComparison | null>(
    null
  );
  const [showSelection, setShowSelection] = useState(false);

  // Load available versions for comparison
  useEffect(() => {
    if (isOpen && modelId) {
      setLoading(true);
      setError(null);
      setComparison(null);
      setSelectedVersionIds([]);

      getComparableVersions(modelId)
        .then((versions) => {
          setAvailableVersions(versions);
          if (versions.length <= MAX_VERSIONS_TO_COMPARE) {
            // Auto-select all if within limit
            const ids = versions.map((v) => v.id);
            setSelectedVersionIds(ids);
            setShowSelection(false);
            // Load comparison directly
            if (ids.length >= 2) {
              loadComparison(ids);
            }
          } else {
            // Show selection UI
            setShowSelection(true);
            setLoading(false);
          }
        })
        .catch((err) => {
          setError(
            err instanceof Error ? err.message : "Failed to load versions"
          );
          setLoading(false);
        });
    }
  }, [isOpen, modelId]);

  const loadComparison = async (versionIds: string[]) => {
    if (versionIds.length < 2) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getModelVersionsForComparison(versionIds);
      setComparison(result);
      setShowSelection(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load comparison"
      );
    } finally {
      setLoading(false);
    }
  };

  const toggleVersionSelection = (versionId: string) => {
    setSelectedVersionIds((prev) => {
      if (prev.includes(versionId)) {
        return prev.filter((id) => id !== versionId);
      }
      if (prev.length >= MAX_VERSIONS_TO_COMPARE) {
        return prev; // Don't add more than max
      }
      return [...prev, versionId];
    });
  };

  const handleCompare = () => {
    loadComparison(selectedVersionIds);
  };

  const handleBackToSelection = () => {
    setShowSelection(true);
    setComparison(null);
  };

  // Find best value for a metric across versions
  const findBestVersionId = (
    metricName: string
  ): string | null => {
    if (!comparison) return null;
    const isHigherBetter = HIGHER_IS_BETTER.includes(metricName);
    const isLowerBetter = LOWER_IS_BETTER.includes(metricName);

    if (!isHigherBetter && !isLowerBetter) return null;

    let bestVersionId: string | null = null;
    let bestValue: number | null = null;

    for (const version of comparison.versions) {
      const value = version.metrics[metricName];
      if (value === null || value === undefined) continue;

      if (bestValue === null) {
        bestValue = value;
        bestVersionId = version.version_id;
      } else if (isHigherBetter && value > bestValue) {
        bestValue = value;
        bestVersionId = version.version_id;
      } else if (isLowerBetter && value < bestValue) {
        bestValue = value;
        bestVersionId = version.version_id;
      }
    }

    return bestVersionId;
  };

  // Get all unique metric names across versions
  const getMetricNames = (): string[] => {
    if (!comparison) return [];
    const names = new Set<string>();
    for (const version of comparison.versions) {
      for (const name of Object.keys(version.metrics)) {
        if (
          typeof version.metrics[name] === "number" ||
          version.metrics[name] === null
        ) {
          names.add(name);
        }
      }
    }
    return Array.from(names).sort();
  };

  // Get all unique hyperparameter names
  const getHyperparamNames = (): string[] => {
    if (!comparison) return [];
    const names = new Set<string>();
    for (const version of comparison.versions) {
      for (const name of Object.keys(version.hyperparameters)) {
        names.add(name);
      }
    }
    return Array.from(names).sort();
  };

  // Check if hyperparameters differ between versions
  const hyperparamsDiffer = (paramName: string): boolean => {
    if (!comparison || comparison.versions.length < 2) return false;
    const values = comparison.versions.map((v) =>
      JSON.stringify(v.hyperparameters[paramName])
    );
    return new Set(values).size > 1;
  };

  // Format metric value for display
  const formatMetric = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return "-";
    if (Math.abs(value) < 0.001) return value.toExponential(2);
    if (Math.abs(value) >= 1000) return value.toFixed(0);
    return value.toFixed(4);
  };

  // Format hyperparameter value for display
  const formatHyperparam = (value: unknown): string => {
    if (value === null || value === undefined) return "-";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") {
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
                    {showSelection
                      ? `Select Versions to Compare: ${modelName}`
                      : `Compare Versions: ${modelName}`}
                  </Dialog.Title>
                  <button
                    onClick={onClose}
                    className="text-text-muted hover:text-text-primary"
                  >
                    <RiCloseLine className="w-5 h-5" />
                  </button>
                </div>

                {loading ? (
                  <div className="flex-1 flex items-center justify-center py-12">
                    <RiLoader4Line className="w-6 h-6 animate-spin text-text-muted" />
                    <span className="ml-2 text-text-muted">Loading...</span>
                  </div>
                ) : error ? (
                  <div className="text-sm text-state-error bg-state-error/10 rounded-lg px-3 py-2">
                    {error}
                  </div>
                ) : showSelection ? (
                  // Version Selection UI
                  <div className="flex-1 overflow-auto">
                    <p className="text-sm text-text-muted mb-4">
                      Select up to {MAX_VERSIONS_TO_COMPARE} versions to
                      compare:
                    </p>
                    <div className="space-y-2">
                      {availableVersions.map((version) => {
                        const isSelected = selectedVersionIds.includes(
                          version.id
                        );
                        const isDisabled =
                          !isSelected &&
                          selectedVersionIds.length >= MAX_VERSIONS_TO_COMPARE;

                        return (
                          <button
                            key={version.id}
                            onClick={() => toggleVersionSelection(version.id)}
                            disabled={isDisabled}
                            className={cn(
                              "w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors",
                              isSelected
                                ? "border-accent bg-accent/10"
                                : "border-white/10 hover:border-white/20",
                              isDisabled && "opacity-50 cursor-not-allowed"
                            )}
                          >
                            <div
                              className={cn(
                                "w-5 h-5 rounded border flex items-center justify-center",
                                isSelected
                                  ? "bg-accent border-accent"
                                  : "border-white/30"
                              )}
                            >
                              {isSelected && (
                                <RiCheckLine className="w-3.5 h-3.5 text-white" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-text-primary font-medium">
                                  v{version.version}
                                </span>
                                <span
                                  className={cn(
                                    "px-1.5 py-0.5 rounded text-xs capitalize",
                                    getStageBadge(version.stage).className
                                  )}
                                >
                                  {version.stage || "none"}
                                </span>
                              </div>
                              <div className="text-xs text-text-muted mt-0.5">
                                {formatDateTime(version.created_at)}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-4 text-sm text-text-muted">
                      Selected: {selectedVersionIds.length}/
                      {MAX_VERSIONS_TO_COMPARE}
                    </div>
                  </div>
                ) : comparison ? (
                  // Comparison Results
                  <div className="flex-1 overflow-auto">
                    {availableVersions.length > MAX_VERSIONS_TO_COMPARE && (
                      <button
                        onClick={handleBackToSelection}
                        className="text-sm text-accent hover:text-accent-hover mb-4"
                      >
                        &larr; Change selection
                      </button>
                    )}

                    {/* Metrics Section */}
                    {metricNames.length > 0 && (
                      <div className="mb-6">
                        <h3 className="text-sm font-medium text-text-secondary mb-3">
                          Metrics
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-white/10">
                                <th className="text-left py-2 pr-4 text-text-muted font-medium">
                                  Metric
                                </th>
                                {comparison.versions.map((v) => (
                                  <th
                                    key={v.version_id}
                                    className="text-right py-2 px-3 text-text-muted font-medium min-w-[100px]"
                                  >
                                    <div>v{v.version}</div>
                                    <div
                                      className={cn(
                                        "text-xs px-1.5 py-0.5 rounded inline-block mt-0.5 capitalize",
                                        getStageBadge(v.stage).className
                                      )}
                                    >
                                      {v.stage || "none"}
                                    </div>
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {metricNames.map((metricName) => {
                                const bestVersionId =
                                  findBestVersionId(metricName);
                                return (
                                  <tr
                                    key={metricName}
                                    className="border-b border-white/5"
                                  >
                                    <td className="py-2 pr-4 text-text-secondary capitalize">
                                      {metricName.replace(/_/g, " ")}
                                    </td>
                                    {comparison.versions.map((v) => {
                                      const value = v.metrics[metricName];
                                      const isBest =
                                        bestVersionId === v.version_id &&
                                        value !== null;
                                      return (
                                        <td
                                          key={v.version_id}
                                          className={cn(
                                            "text-right py-2 px-3 font-mono",
                                            isBest
                                              ? "text-accent font-medium"
                                              : "text-text-primary"
                                          )}
                                        >
                                          <span className="inline-flex items-center gap-1">
                                            {formatMetric(value)}
                                            {isBest && (
                                              <RiTrophyLine className="w-3.5 h-3.5" />
                                            )}
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
                      </div>
                    )}

                    {/* Hyperparameters Section */}
                    {hyperparamNames.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-text-secondary mb-3">
                          Hyperparameters
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-white/10">
                                <th className="text-left py-2 pr-4 text-text-muted font-medium">
                                  Parameter
                                </th>
                                {comparison.versions.map((v) => (
                                  <th
                                    key={v.version_id}
                                    className="text-right py-2 px-3 text-text-muted font-medium min-w-[100px]"
                                  >
                                    v{v.version}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {hyperparamNames.map((paramName) => {
                                const differs = hyperparamsDiffer(paramName);
                                return (
                                  <tr
                                    key={paramName}
                                    className="border-b border-white/5"
                                  >
                                    <td className="py-2 pr-4 text-text-secondary">
                                      {paramName}
                                    </td>
                                    {comparison.versions.map((v) => {
                                      const value =
                                        v.hyperparameters[paramName];
                                      return (
                                        <td
                                          key={v.version_id}
                                          className={cn(
                                            "text-right py-2 px-3 font-mono",
                                            differs
                                              ? "text-state-warning"
                                              : "text-text-primary"
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
                        Highlighted = differs between versions
                      </span>
                    </div>
                  </div>
                ) : availableVersions.length < 2 ? (
                  <div className="text-center py-12 text-text-muted">
                    At least 2 versions are required for comparison
                  </div>
                ) : null}

                <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-white/10">
                  {showSelection && selectedVersionIds.length >= 2 && (
                    <button onClick={handleCompare} className="btn-primary">
                      Compare ({selectedVersionIds.length})
                    </button>
                  )}
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
