import { useState, useEffect, Fragment } from "react";
import { Dialog, Transition, Menu } from "@headlessui/react";
import {
  RiDeleteBinLine,
  RiLoader4Line,
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiBox3Line,
} from "@remixicon/react";
import {
  listModels,
  listModelVersions,
  deleteModel,
  deleteModelVersion,
  promoteModel,
  ModelMetadata,
  ModelVersion,
} from "@/lib/tauri";
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

function formatFileSize(bytes?: number): string {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getStageBadge(stage: string) {
  switch (stage) {
    case "production":
      return { icon: "🟢", label: "prod", className: "text-state-success bg-state-success/20" };
    case "staging":
      return { icon: "🟡", label: "staging", className: "text-state-warning bg-state-warning/20" };
    default:
      return { icon: "⚪", label: "none", className: "text-text-muted bg-white/10" };
  }
}

function parseMetricsSnapshot(snapshot?: string): string {
  if (!snapshot) return "-";
  try {
    const metrics = JSON.parse(snapshot);
    if (metrics.accuracy !== undefined) {
      return `${(metrics.accuracy * 100).toFixed(0)}% acc`;
    }
    if (metrics.r2 !== undefined) {
      return `${metrics.r2.toFixed(2)} R²`;
    }
    return "-";
  } catch {
    return "-";
  }
}

interface StageDropdownProps {
  currentStage: string;
  onSelect: (stage: string) => void;
}

function StageDropdown({ currentStage, onSelect }: StageDropdownProps) {
  const stages = ["none", "staging", "production"];

  return (
    <Menu as="div" className="relative">
      <Menu.Button className="flex items-center gap-1 px-2 py-0.5 text-xs rounded hover:bg-white/10 transition-colors">
        {getStageBadge(currentStage).icon}
        <span className="text-text-secondary">{getStageBadge(currentStage).label}</span>
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
        <Menu.Items className="absolute left-0 mt-1 w-32 origin-top-left rounded-lg bg-background-surface border border-white/10 shadow-lg focus:outline-none z-50">
          <div className="py-1">
            {stages.map((stage) => (
              <Menu.Item key={stage}>
                {({ active }) => (
                  <button
                    onClick={() => onSelect(stage)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-1.5 text-xs",
                      active && "bg-background-elevated",
                      stage === currentStage && "bg-accent/10"
                    )}
                  >
                    <span>{getStageBadge(stage).icon}</span>
                    <span className="text-text-secondary capitalize">{stage}</span>
                  </button>
                )}
              </Menu.Item>
            ))}
          </div>
        </Menu.Items>
      </Transition>
    </Menu>
  );
}

interface ModelRowProps {
  model: ModelMetadata;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onVersionDelete: (versionId: string) => void;
  onStageChange: (versionId: string, stage: string) => void;
}

function ModelRow({
  model,
  isExpanded,
  onToggle,
  onDelete,
  onVersionDelete,
  onStageChange,
}: ModelRowProps) {
  const [versions, setVersions] = useState<ModelVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  useEffect(() => {
    if (isExpanded && versions.length === 0) {
      setLoadingVersions(true);
      listModelVersions(model.id)
        .then(setVersions)
        .finally(() => setLoadingVersions(false));
    }
  }, [isExpanded, model.id, versions.length]);

  const stageBadge = model.production_version
    ? getStageBadge("production")
    : getStageBadge("none");

  return (
    <>
      <tr
        className="border-t border-white/5 hover:bg-white/5 cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-3 py-2 text-text-primary">
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <RiArrowDownSLine className="w-4 h-4 text-text-muted" />
            ) : (
              <RiArrowRightSLine className="w-4 h-4 text-text-muted" />
            )}
            <span>{model.name}</span>
          </div>
        </td>
        <td className="px-3 py-2 text-text-secondary">
          v{model.latest_version || 0}
        </td>
        <td className="px-3 py-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs",
              stageBadge.className
            )}
          >
            {stageBadge.icon} {stageBadge.label}
          </span>
        </td>
        <td className="px-3 py-2 text-text-muted">
          {model.version_count} version{model.version_count !== 1 ? "s" : ""}
        </td>
        <td className="px-3 py-2 text-text-muted">
          {formatRelativeTime(model.created_at)}
        </td>
        <td className="px-3 py-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1 rounded hover:bg-state-error/20 text-text-muted hover:text-state-error"
          >
            <RiDeleteBinLine className="w-4 h-4" />
          </button>
        </td>
      </tr>

      {isExpanded && (
        <tr>
          <td colSpan={6} className="p-0">
            <div className="bg-background/50 border-y border-white/5">
              {loadingVersions ? (
                <div className="flex items-center justify-center py-4">
                  <RiLoader4Line className="w-4 h-4 animate-spin text-text-muted" />
                </div>
              ) : versions.length === 0 ? (
                <div className="text-center py-4 text-text-muted text-xs">
                  No versions registered
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-text-muted uppercase">
                      <th className="px-6 py-1.5">Version</th>
                      <th className="px-3 py-1.5">Run</th>
                      <th className="px-3 py-1.5">Stage</th>
                      <th className="px-3 py-1.5">Metrics</th>
                      <th className="px-3 py-1.5">Size</th>
                      <th className="px-3 py-1.5">Created</th>
                      <th className="px-3 py-1.5 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {versions.map((version) => (
                      <tr
                        key={version.id}
                        className="border-t border-white/5 hover:bg-white/5"
                      >
                        <td className="px-6 py-2 text-text-primary">
                          v{version.version}
                          <span className="ml-2 text-text-muted">
                            ({version.format})
                          </span>
                        </td>
                        <td className="px-3 py-2 text-text-muted font-mono">
                          {version.run_id ? version.run_id.slice(0, 8) : "-"}
                        </td>
                        <td className="px-3 py-2">
                          <StageDropdown
                            currentStage={version.stage}
                            onSelect={(stage) => onStageChange(version.id, stage)}
                          />
                        </td>
                        <td className="px-3 py-2 text-text-secondary">
                          {parseMetricsSnapshot(version.metrics_snapshot)}
                        </td>
                        <td className="px-3 py-2 text-text-muted">
                          {formatFileSize(version.file_size)}
                        </td>
                        <td className="px-3 py-2 text-text-muted">
                          {formatRelativeTime(version.created_at)}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => onVersionDelete(version.id)}
                            className="p-1 rounded hover:bg-state-error/20 text-text-muted hover:text-state-error"
                          >
                            <RiDeleteBinLine className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function ModelsPanel() {
  const [models, setModels] = useState<ModelMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "model" | "version"; id: string; name: string } | null>(null);

  const loadModels = async () => {
    setLoading(true);
    try {
      const data = await listModels();
      setModels(data);
    } catch (error) {
      console.error("Failed to load models:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadModels();
  }, []);

  const handleDeleteModel = (model: ModelMetadata) => {
    setDeleteTarget({ type: "model", id: model.id, name: model.name });
  };

  const handleDeleteVersion = (versionId: string) => {
    setDeleteTarget({ type: "version", id: versionId, name: `version ${versionId.slice(0, 8)}` });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      if (deleteTarget.type === "model") {
        await deleteModel(deleteTarget.id);
      } else {
        await deleteModelVersion(deleteTarget.id);
      }
      await loadModels();
      setExpandedModelId(null);
    } catch (error) {
      console.error("Failed to delete:", error);
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleStageChange = async (versionId: string, stage: string) => {
    try {
      await promoteModel(versionId, stage);
      await loadModels();
      // Reload expanded model's versions
      if (expandedModelId) {
        const expanded = expandedModelId;
        setExpandedModelId(null);
        setTimeout(() => setExpandedModelId(expanded), 0);
      }
    } catch (error) {
      console.error("Failed to change stage:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RiLoader4Line className="w-6 h-6 animate-spin text-text-muted" />
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-muted">
        <RiBox3Line className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">No models registered yet.</p>
        <p className="text-xs mt-1">Register a model from the Runs tab after training.</p>
      </div>
    );
  }

  return (
    <>
      <div className="h-full overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-background-surface">
            <tr className="text-left text-text-muted text-xs uppercase">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Latest</th>
              <th className="px-3 py-2">Stage</th>
              <th className="px-3 py-2">Versions</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {models.map((model) => (
              <ModelRow
                key={model.id}
                model={model}
                isExpanded={expandedModelId === model.id}
                onToggle={() =>
                  setExpandedModelId(expandedModelId === model.id ? null : model.id)
                }
                onDelete={() => handleDeleteModel(model)}
                onVersionDelete={handleDeleteVersion}
                onStageChange={handleStageChange}
              />
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
                    Delete {deleteTarget?.type === "model" ? "Model" : "Version"}
                  </Dialog.Title>
                  <p className="text-sm text-text-muted mb-4">
                    {deleteTarget?.type === "model"
                      ? `This will permanently delete "${deleteTarget.name}" and all its versions.`
                      : `This will permanently delete ${deleteTarget?.name}.`}
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
    </>
  );
}
