import { useState, useEffect, Fragment } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { RiDeleteBinLine, RiLoader4Line, RiBox3Line } from "@remixicon/react";
import { usePipelineStore } from "@/stores/pipelineStore";
import { deleteRun, getRunMetrics, RunMetadata } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { RegisterModelDialog } from "./RegisterModelDialog";
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

export function RunsPanel() {
  const loadRunHistory = usePipelineStore((s) => s.loadRunHistory);
  const runHistory = usePipelineStore((s) => s.runHistory);
  const [runMetricsCache, setRunMetricsCache] = useState<Record<string, string>>({});
  const [loadingMetrics, setLoadingMetrics] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [registerModelRun, setRegisterModelRun] = useState<RunMetadata | null>(null);

  useEffect(() => {
    loadRunHistory();
  }, [loadRunHistory]);

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
      loadRunHistory();
      setDeleteTarget(null);
    }
  };

  if (runHistory.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted">
        <p className="text-sm">No runs yet. Execute a pipeline to see history.</p>
      </div>
    );
  }

  return (
    <>
      <div className="h-full overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-background-surface">
            <tr className="text-left text-text-muted text-xs uppercase">
              <th className="px-3 py-2">Pipeline</th>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Duration</th>
              <th className="px-3 py-2">Metric</th>
              <th className="px-3 py-2 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {runHistory.map((run) => (
              <tr key={run.id} className="border-t border-white/5 hover:bg-white/5">
                <td className="px-3 py-2 text-text-primary">{run.pipeline_name}</td>
                <td className="px-3 py-2 text-text-muted">{formatRelativeTime(run.started_at)}</td>
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
            ))}
          </tbody>
        </table>
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
            loadRunHistory();
          }}
        />
      )}
    </>
  );
}
