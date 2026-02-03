import { useState, useEffect, Fragment, useMemo } from "react";
import { Dialog, Transition, Listbox } from "@headlessui/react";
import {
  RiDeleteBinLine,
  RiLoader4Line,
  RiBox3Line,
  RiLightbulbLine,
  RiArrowDownSLine,
  RiCheckLine,
  RiCheckboxLine,
  RiCheckboxBlankLine,
  RiScalesLine,
  RiEditLine,
  RiArrowDownSFill,
  RiArrowRightSFill,
} from "@remixicon/react";
import { usePipelineStore } from "@/stores/pipelineStore";
import { deleteRun, getRunMetrics, RunMetadata, Experiment } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { RegisterModelDialog } from "./RegisterModelDialog";
import { RunDetailModal } from "./RunDetailModal";
import { RunComparisonModal } from "./RunComparisonModal";
import { MODEL_FILE } from "@/lib/constants";

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

function formatDuration(ms?: number): string {
  if (!ms) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

interface RunsPanelProps {
  onExplainRun?: (runId: string) => void;
  canExplain?: boolean;
}

interface FilterOption {
  value: string | null;
  label: string;
}

export function RunsPanel({ onExplainRun, canExplain = true }: RunsPanelProps) {
  const loadRunHistory = usePipelineStore((s) => s.loadRunHistory);
  const runHistory = usePipelineStore((s) => s.runHistory);
  const explainRunId = usePipelineStore((s) => s.explainRunId);
  const experiments = usePipelineStore((s) => s.experiments);
  const loadExperiments = usePipelineStore((s) => s.loadExperiments);
  const runsViewMode = usePipelineStore((s) => s.runsViewMode);
  const setRunsViewMode = usePipelineStore((s) => s.setRunsViewMode);
  const experimentFilter = usePipelineStore((s) => s.experimentFilter);
  const setExperimentFilter = usePipelineStore((s) => s.setExperimentFilter);
  const selectedRunsForComparison = usePipelineStore((s) => s.selectedRunsForComparison);
  const toggleRunForComparison = usePipelineStore((s) => s.toggleRunForComparison);
  const clearComparisonSelection = usePipelineStore((s) => s.clearComparisonSelection);

  const [runMetricsCache, setRunMetricsCache] = useState<Record<string, string>>({});
  const [loadingMetrics, setLoadingMetrics] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [registerModelRun, setRegisterModelRun] = useState<RunMetadata | null>(null);
  const [editingRun, setEditingRun] = useState<RunMetadata | null>(null);
  const [showComparisonModal, setShowComparisonModal] = useState(false);
  const [collapsedExperiments, setCollapsedExperiments] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadRunHistory(undefined, experimentFilter || undefined);
    loadExperiments();
  }, [loadRunHistory, loadExperiments, experimentFilter]);

  // Load best metric for each run
  useEffect(() => {
    runHistory.forEach(async (run) => {
      if (!runMetricsCache[run.id] && !loadingMetrics.has(run.id)) {
        setLoadingMetrics(prev => new Set(prev).add(run.id));
        try {
          const metrics = await getRunMetrics(run.id);
          const acc = metrics.find(m => m.name === "accuracy");
          const r2 = metrics.find(m => m.name === "r2");
          const display = acc ? `${(acc.value! * 100).toFixed(0)}% acc`
                         : r2 ? `${r2.value!.toFixed(2)} R²`
                         : "";
          setRunMetricsCache(prev => ({ ...prev, [run.id]: display }));
        } catch (error) {
          console.error("Failed to load metrics for run:", run.id, error);
        }
        setLoadingMetrics(prev => {
          const next = new Set(prev);
          next.delete(run.id);
          return next;
        });
      }
    });
  }, [runHistory, runMetricsCache, loadingMetrics]);

  const handleDeleteClick = (id: string) => setDeleteTarget(id);

  const handleConfirmDelete = async () => {
    if (deleteTarget) {
      await deleteRun(deleteTarget);
      loadRunHistory(undefined, experimentFilter || undefined);
      setDeleteTarget(null);
    }
  };

  const handleCompare = () => {
    if (selectedRunsForComparison.length >= 2) {
      setShowComparisonModal(true);
    }
  };

  const toggleExperimentCollapse = (expId: string) => {
    setCollapsedExperiments(prev => {
      const next = new Set(prev);
      if (next.has(expId)) {
        next.delete(expId);
      } else {
        next.add(expId);
      }
      return next;
    });
  };

  // Build filter options
  const filterOptions: FilterOption[] = useMemo(() => {
    const options: FilterOption[] = [
      { value: null, label: 'All Experiments' },
      { value: 'none', label: '(No Experiment)' },
    ];
    experiments.filter(e => e.status !== 'archived').forEach(exp => {
      options.push({ value: exp.id, label: exp.name });
    });
    return options;
  }, [experiments]);

  // Group runs by experiment for hierarchical view
  const runsByExperiment = useMemo(() => {
    const groups: Map<string | null, { experiment: Experiment | null; runs: RunMetadata[] }> = new Map();

    // Initialize groups for all experiments
    experiments.filter(e => e.status !== 'archived').forEach(exp => {
      groups.set(exp.id, { experiment: exp, runs: [] });
    });
    groups.set(null, { experiment: null, runs: [] });

    // Group runs
    runHistory.forEach(run => {
      const key = run.experiment_id || null;
      const group = groups.get(key);
      if (group) {
        group.runs.push(run);
      } else {
        // Experiment might be archived or deleted
        const nullGroup = groups.get(null);
        if (nullGroup) {
          nullGroup.runs.push(run);
        }
      }
    });

    return groups;
  }, [runHistory, experiments]);

  // Get run display name
  const getRunDisplayName = (run: RunMetadata): string => {
    if (run.display_name) return run.display_name;
    return formatRelativeTime(run.started_at);
  };

  // Render a single run row
  const renderRunRow = (run: RunMetadata, showExperiment: boolean = true) => {
    const isSelected = selectedRunsForComparison.includes(run.id);
    const canSelect = selectedRunsForComparison.length < 5 || isSelected;

    return (
      <tr key={run.id} className="border-t border-white/5 hover:bg-white/5">
        {/* Checkbox for comparison */}
        <td className="px-2 py-2 w-8">
          <button
            onClick={() => toggleRunForComparison(run.id)}
            disabled={!canSelect}
            className={cn(
              "p-0.5 rounded",
              isSelected && "text-accent",
              !canSelect && !isSelected && "text-text-muted/30 cursor-not-allowed"
            )}
          >
            {isSelected ? (
              <RiCheckboxLine className="w-4 h-4" />
            ) : (
              <RiCheckboxBlankLine className="w-4 h-4" />
            )}
          </button>
        </td>
        <td className="px-3 py-2 text-text-primary">
          <div className="flex items-center gap-2">
            <span>{getRunDisplayName(run)}</span>
            {run.tags && run.tags.length > 0 && (
              <span className="text-xs text-accent">{run.tags.length} tag{run.tags.length > 1 ? 's' : ''}</span>
            )}
          </div>
        </td>
        {showExperiment && (
          <td className="px-3 py-2 text-text-muted text-xs">
            {run.experiment_name || '(none)'}
          </td>
        )}
        <td className="px-3 py-2">
          <span className={cn(
            "w-2 h-2 rounded-full inline-block",
            run.status === "completed" && "bg-state-success",
            run.status === "failed" && "bg-state-error",
            run.status === "running" && "bg-state-warning animate-pulse"
          )} />
        </td>
        <td className="px-3 py-2 text-text-muted">{formatDuration(run.duration_ms)}</td>
        <td className="px-3 py-2 text-text-secondary">
          {loadingMetrics.has(run.id) ? (
            <RiLoader4Line className="w-3 h-3 animate-spin text-text-muted" />
          ) : (
            runMetricsCache[run.id] || "-"
          )}
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setEditingRun(run)}
              className="p-1 rounded hover:bg-accent/20 text-text-muted hover:text-accent"
              title="Edit Run Details"
            >
              <RiEditLine className="w-4 h-4" />
            </button>
            {run.status === "completed" && onExplainRun && (
              <button
                onClick={() => onExplainRun(run.id)}
                disabled={!canExplain || explainRunId === run.id}
                className={cn(
                  "p-1 rounded",
                  canExplain && explainRunId !== run.id
                    ? "hover:bg-accent/20 text-text-muted hover:text-accent"
                    : "text-text-muted/50 cursor-not-allowed"
                )}
                title={explainRunId === run.id ? "Explaining..." : "Explain Model"}
              >
                <RiLightbulbLine className={cn(
                  "w-4 h-4",
                  explainRunId === run.id && "animate-pulse text-accent"
                )} />
              </button>
            )}
            {run.status === "completed" && (
              <button
                onClick={() => setRegisterModelRun(run)}
                className="p-1 rounded hover:bg-accent/20 text-text-muted hover:text-accent"
                title="Register Model"
              >
                <RiBox3Line className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => handleDeleteClick(run.id)}
              className="p-1 rounded hover:bg-state-error/20 text-text-muted hover:text-state-error"
              title="Delete Run"
            >
              <RiDeleteBinLine className="w-4 h-4" />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  // Render grouped view
  const renderGroupedView = () => {
    const sortedGroups = Array.from(runsByExperiment.entries())
      .filter(([, group]) => group.runs.length > 0 || group.experiment !== null)
      .sort(([aKey, aGroup], [bKey, bGroup]) => {
        // Sort by experiment status then name, unassigned last
        if (aKey === null) return 1;
        if (bKey === null) return -1;
        const aStatus = aGroup.experiment?.status || '';
        const bStatus = bGroup.experiment?.status || '';
        if (aStatus !== bStatus) {
          if (aStatus === 'active') return -1;
          if (bStatus === 'active') return 1;
        }
        return (aGroup.experiment?.name || '').localeCompare(bGroup.experiment?.name || '');
      });

    return (
      <div className="space-y-4">
        {sortedGroups.map(([expId, group]) => {
          const isCollapsed = collapsedExperiments.has(expId || 'none');
          const displayName = group.experiment?.name || '(No Experiment)';
          const statusBadge = group.experiment?.status === 'completed' ? 'completed' : null;

          return (
            <div key={expId || 'none'} className="rounded-lg border border-white/5">
              <button
                onClick={() => toggleExperimentCollapse(expId || 'none')}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 rounded-t-lg"
              >
                {isCollapsed ? (
                  <RiArrowRightSFill className="w-4 h-4 text-text-muted" />
                ) : (
                  <RiArrowDownSFill className="w-4 h-4 text-text-muted" />
                )}
                <span className="font-medium text-text-primary">{displayName}</span>
                <span className="text-xs text-text-muted">({group.runs.length} run{group.runs.length !== 1 ? 's' : ''})</span>
                {statusBadge && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-state-success/20 text-state-success">
                    {statusBadge}
                  </span>
                )}
              </button>
              {!isCollapsed && group.runs.length > 0 && (
                <table className="w-full text-sm">
                  <tbody>
                    {group.runs.map(run => renderRunRow(run, false))}
                  </tbody>
                </table>
              )}
              {!isCollapsed && group.runs.length === 0 && (
                <div className="px-3 py-4 text-sm text-text-muted">No runs yet</div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <div className="h-full flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-3 py-2 border-b border-white/5">
          {/* View mode toggle */}
          <Listbox value={runsViewMode} onChange={setRunsViewMode}>
            <div className="relative">
              <Listbox.Button className="btn-secondary text-xs h-7 min-w-[100px] justify-between">
                <span>{runsViewMode === 'flat' ? 'Flat List' : 'By Experiment'}</span>
                <RiArrowDownSLine className="w-3 h-3 ml-1" />
              </Listbox.Button>
              <Transition
                as={Fragment}
                leave="transition ease-in duration-100"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
              >
                <Listbox.Options className="absolute left-0 mt-1 w-32 rounded-lg bg-background-surface border border-white/10 shadow-lg focus:outline-none z-50">
                  <Listbox.Option
                    value="flat"
                    className={({ active }) =>
                      cn("relative cursor-pointer select-none py-2 px-3 text-sm", active && "bg-background-elevated")
                    }
                  >
                    {({ selected }) => (
                      <div className="flex items-center justify-between">
                        <span>Flat List</span>
                        {selected && <RiCheckLine className="w-4 h-4 text-accent" />}
                      </div>
                    )}
                  </Listbox.Option>
                  <Listbox.Option
                    value="by-experiment"
                    className={({ active }) =>
                      cn("relative cursor-pointer select-none py-2 px-3 text-sm", active && "bg-background-elevated")
                    }
                  >
                    {({ selected }) => (
                      <div className="flex items-center justify-between">
                        <span>By Experiment</span>
                        {selected && <RiCheckLine className="w-4 h-4 text-accent" />}
                      </div>
                    )}
                  </Listbox.Option>
                </Listbox.Options>
              </Transition>
            </div>
          </Listbox>

          {/* Experiment filter (only in flat view) */}
          {runsViewMode === 'flat' && (
            <Listbox value={experimentFilter} onChange={setExperimentFilter}>
              <div className="relative">
                <Listbox.Button className="btn-secondary text-xs h-7 min-w-[120px] justify-between">
                  <span>
                    {experimentFilter === null
                      ? 'All'
                      : experimentFilter === 'none'
                      ? '(No Exp)'
                      : experiments.find(e => e.id === experimentFilter)?.name || 'Unknown'}
                  </span>
                  <RiArrowDownSLine className="w-3 h-3 ml-1" />
                </Listbox.Button>
                <Transition
                  as={Fragment}
                  leave="transition ease-in duration-100"
                  leaveFrom="opacity-100"
                  leaveTo="opacity-0"
                >
                  <Listbox.Options className="absolute left-0 mt-1 w-40 max-h-48 overflow-auto rounded-lg bg-background-surface border border-white/10 shadow-lg focus:outline-none z-50">
                    {filterOptions.map((option) => (
                      <Listbox.Option
                        key={option.value || 'all'}
                        value={option.value}
                        className={({ active }) =>
                          cn("relative cursor-pointer select-none py-2 px-3 text-sm", active && "bg-background-elevated")
                        }
                      >
                        {({ selected }) => (
                          <div className="flex items-center justify-between">
                            <span className={cn(option.value === 'none' && 'text-text-muted')}>{option.label}</span>
                            {selected && <RiCheckLine className="w-4 h-4 text-accent" />}
                          </div>
                        )}
                      </Listbox.Option>
                    ))}
                  </Listbox.Options>
                </Transition>
              </div>
            </Listbox>
          )}

          <div className="flex-1" />

          {/* Compare button */}
          <button
            onClick={handleCompare}
            disabled={selectedRunsForComparison.length < 2}
            className={cn(
              "btn-secondary text-xs h-7",
              selectedRunsForComparison.length >= 2 && "btn-primary"
            )}
          >
            <RiScalesLine className="w-3.5 h-3.5 mr-1" />
            Compare ({selectedRunsForComparison.length})
          </button>
          {selectedRunsForComparison.length > 0 && (
            <button
              onClick={clearComparisonSelection}
              className="text-xs text-text-muted hover:text-text-primary"
            >
              Clear
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-2">
          {runHistory.length === 0 && experimentFilter === null ? (
            <div className="flex items-center justify-center h-full text-text-muted">
              <p className="text-sm">No runs yet. Execute a pipeline to see history.</p>
            </div>
          ) : runHistory.length === 0 ? (
            <div className="flex items-center justify-center h-full text-text-muted">
              <p className="text-sm">No runs match the current filter.</p>
            </div>
          ) : runsViewMode === 'by-experiment' ? (
            renderGroupedView()
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background-surface">
                <tr className="text-left text-text-muted text-xs uppercase">
                  <th className="px-2 py-2 w-8"></th>
                  <th className="px-3 py-2">Name / Time</th>
                  <th className="px-3 py-2">Experiment</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Duration</th>
                  <th className="px-3 py-2">Metric</th>
                  <th className="px-3 py-2 w-32"></th>
                </tr>
              </thead>
              <tbody>
                {runHistory.map((run) => renderRunRow(run, true))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Transition appear show={deleteTarget !== null} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setDeleteTarget(null)}>
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
                <Dialog.Panel className="w-full max-w-sm rounded-xl bg-background-surface border border-white/10 p-6 shadow-xl">
                  <Dialog.Title className="text-lg font-semibold text-text-primary mb-2">
                    Delete Run
                  </Dialog.Title>
                  <p className="text-sm text-text-muted mb-4">
                    This will permanently delete the run and its metrics.
                  </p>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setDeleteTarget(null)} className="btn-secondary">
                      Cancel
                    </button>
                    <button onClick={handleConfirmDelete} className="btn-destructive">
                      Delete
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* Register Model Dialog */}
      {registerModelRun && (
        <RegisterModelDialog
          isOpen={true}
          onClose={() => setRegisterModelRun(null)}
          run={registerModelRun}
          modelPath={MODEL_FILE}
          onSuccess={() => {
            loadRunHistory(undefined, experimentFilter || undefined);
          }}
        />
      )}

      {/* Run Detail Modal */}
      <RunDetailModal
        isOpen={editingRun !== null}
        onClose={() => setEditingRun(null)}
        run={editingRun}
        experiments={experiments}
        onSuccess={() => {
          loadRunHistory(undefined, experimentFilter || undefined);
          loadExperiments();
        }}
      />

      {/* Run Comparison Modal */}
      <RunComparisonModal
        isOpen={showComparisonModal}
        onClose={() => setShowComparisonModal(false)}
        runIds={selectedRunsForComparison}
        runs={runHistory}
      />
    </>
  );
}
