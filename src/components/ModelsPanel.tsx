import { useState, useEffect, Fragment } from "react";
import { Dialog, Transition, Menu, Listbox, Combobox } from "@headlessui/react";
import {
  RiDeleteBinLine,
  RiLoader4Line,
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiBox3Line,
  RiSearchLine,
  RiCloseLine,
  RiEyeLine,
  RiCheckLine,
  RiLineChartLine,
} from "@remixicon/react";
import {
  listModels,
  listModelVersions,
  deleteModel,
  deleteModelVersion,
  promoteModel,
  listAllModelTags,
  ModelMetadata,
  ModelVersion,
} from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { ModelDetailsModal } from "./ModelDetailsModal";
import { VersionComparisonModal } from "./VersionComparisonModal";

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
    case "archived":
      return { icon: "⚫", label: "archived", className: "text-text-muted bg-white/5" };
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
  const stages = ["none", "staging", "production", "archived"];

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

const STAGE_OPTIONS = [
  { value: "all", label: "All Stages" },
  { value: "none", label: "None" },
  { value: "staging", label: "Staging" },
  { value: "production", label: "Production" },
  { value: "archived", label: "Archived" },
];

interface FiltersBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  stage: string;
  onStageChange: (value: string) => void;
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  allTags: string[];
}

function FiltersBar({
  search,
  onSearchChange,
  stage,
  onStageChange,
  selectedTags,
  onTagsChange,
  allTags,
}: FiltersBarProps) {
  const [tagQuery, setTagQuery] = useState("");

  const filteredTags = allTags.filter(
    (t) =>
      !selectedTags.includes(t) &&
      t.toLowerCase().includes(tagQuery.toLowerCase())
  );

  return (
    <div className="flex items-center gap-3 p-3 border-b border-white/5 bg-background-surface">
      {/* Search Input */}
      <div className="relative flex-1 max-w-xs">
        <RiSearchLine className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          type="text"
          className="input w-full pl-8 py-1.5 text-sm"
          placeholder="Search models..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {search && (
          <button
            onClick={() => onSearchChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
          >
            <RiCloseLine className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Stage Filter */}
      <Listbox value={stage} onChange={onStageChange}>
        <div className="relative">
          <Listbox.Button className="input py-1.5 px-3 text-sm flex items-center gap-2 min-w-[120px]">
            <span className="text-text-secondary">
              {STAGE_OPTIONS.find((o) => o.value === stage)?.label}
            </span>
            <RiArrowDownSLine className="w-4 h-4 text-text-muted ml-auto" />
          </Listbox.Button>
          <Transition
            as={Fragment}
            leave="transition ease-in duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <Listbox.Options className="absolute mt-1 w-full rounded-lg bg-background-surface border border-white/10 shadow-lg focus:outline-none z-50">
              {STAGE_OPTIONS.map((option) => (
                <Listbox.Option
                  key={option.value}
                  value={option.value}
                  className={({ active }) =>
                    cn(
                      "relative cursor-pointer select-none py-2 px-3 text-sm",
                      active && "bg-background-elevated"
                    )
                  }
                >
                  {({ selected }) => (
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          selected ? "text-text-primary" : "text-text-secondary"
                        )}
                      >
                        {option.label}
                      </span>
                      {selected && <RiCheckLine className="w-4 h-4 text-accent" />}
                    </div>
                  )}
                </Listbox.Option>
              ))}
            </Listbox.Options>
          </Transition>
        </div>
      </Listbox>

      {/* Tags Filter */}
      <Combobox
        multiple
        value={selectedTags}
        onChange={onTagsChange}
      >
        <div className="relative">
          <div className="flex items-center gap-1 input py-1 px-2 min-w-[140px]">
            {selectedTags.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {selectedTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-accent/20 text-accent text-xs"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTagsChange(selectedTags.filter((t) => t !== tag));
                      }}
                      className="hover:text-accent-hover"
                    >
                      <RiCloseLine className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <Combobox.Input
                className="bg-transparent text-sm text-text-muted focus:outline-none w-20"
                placeholder="Tags..."
                value={tagQuery}
                onChange={(e) => setTagQuery(e.target.value)}
              />
            )}
            <Combobox.Button className="ml-auto">
              <RiArrowDownSLine className="w-4 h-4 text-text-muted" />
            </Combobox.Button>
          </div>

          <Transition
            as={Fragment}
            leave="transition ease-in duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <Combobox.Options className="absolute mt-1 max-h-40 w-full overflow-auto rounded-lg bg-background-surface border border-white/10 shadow-lg focus:outline-none z-50">
              {filteredTags.length === 0 && tagQuery === "" ? (
                <div className="py-2 px-3 text-sm text-text-muted">No tags</div>
              ) : (
                filteredTags.map((tag) => (
                  <Combobox.Option
                    key={tag}
                    value={tag}
                    className={({ active }) =>
                      cn(
                        "relative cursor-pointer select-none py-2 px-3 text-sm",
                        active
                          ? "bg-background-elevated text-text-primary"
                          : "text-text-secondary"
                      )
                    }
                  >
                    {tag}
                  </Combobox.Option>
                ))
              )}
            </Combobox.Options>
          </Transition>
        </div>
      </Combobox>

      {/* Clear Filters */}
      {(search || stage !== "all" || selectedTags.length > 0) && (
        <button
          onClick={() => {
            onSearchChange("");
            onStageChange("all");
            onTagsChange([]);
          }}
          className="text-xs text-text-muted hover:text-text-primary transition-colors whitespace-nowrap"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

interface ModelRowProps {
  model: ModelMetadata;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onVersionDelete: (versionId: string) => void;
  onStageChange: (versionId: string, stage: string) => void;
  onViewDetails: (version: ModelVersion) => void;
  onCompareVersions: () => void;
}

function ModelRow({
  model,
  isExpanded,
  onToggle,
  onDelete,
  onVersionDelete,
  onStageChange,
  onViewDetails,
  onCompareVersions,
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

  // Refresh versions when stage changes
  const handleStageChange = async (versionId: string, stage: string) => {
    await onStageChange(versionId, stage);
    // Reload versions
    const updatedVersions = await listModelVersions(model.id);
    setVersions(updatedVersions);
  };

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
          <div className="flex items-center gap-1">
            {model.version_count >= 2 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCompareVersions();
                }}
                className="p-1 rounded hover:bg-white/10 text-text-muted hover:text-text-primary"
                title="Compare versions"
              >
                <RiLineChartLine className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1 rounded hover:bg-state-error/20 text-text-muted hover:text-state-error"
              title="Delete model"
            >
              <RiDeleteBinLine className="w-4 h-4" />
            </button>
          </div>
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
                      <th className="px-3 py-1.5">Tags</th>
                      <th className="px-3 py-1.5">Metrics</th>
                      <th className="px-3 py-1.5">Size</th>
                      <th className="px-3 py-1.5">Created</th>
                      <th className="px-3 py-1.5 w-20"></th>
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
                            onSelect={(stage) => handleStageChange(version.id, stage)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          {version.tags && version.tags.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {version.tags.slice(0, 2).map((tag) => (
                                <span
                                  key={tag}
                                  className="px-1.5 py-0.5 rounded-full bg-accent/20 text-accent text-xs"
                                >
                                  {tag}
                                </span>
                              ))}
                              {version.tags.length > 2 && (
                                <span className="text-text-muted text-xs">
                                  +{version.tags.length - 2}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-text-muted">-</span>
                          )}
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
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => onViewDetails(version)}
                              className="p-1 rounded hover:bg-white/10 text-text-muted hover:text-text-primary"
                              title="View details"
                            >
                              <RiEyeLine className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onVersionDelete(version.id)}
                              className="p-1 rounded hover:bg-state-error/20 text-text-muted hover:text-state-error"
                              title="Delete version"
                            >
                              <RiDeleteBinLine className="w-3.5 h-3.5" />
                            </button>
                          </div>
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
  const [selectedVersion, setSelectedVersion] = useState<ModelVersion | null>(null);
  const [comparisonModel, setComparisonModel] = useState<{ id: string; name: string } | null>(null);

  // Filter state
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);

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

  const loadTags = async () => {
    try {
      const tags = await listAllModelTags();
      setAllTags(tags);
    } catch (error) {
      console.error("Failed to load tags:", error);
    }
  };

  useEffect(() => {
    loadModels();
    loadTags();
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
      await loadTags();
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
    } catch (error) {
      console.error("Failed to change stage:", error);
    }
  };

  // Filter models based on search, stage, and tags
  // We filter at the model level for search (by name/description)
  // For stage and tags we need to filter versions, then show models that have matching versions
  const filteredModels = models.filter((model) => {
    // Search filter (model name or description)
    if (search) {
      const searchLower = search.toLowerCase();
      if (!model.name.toLowerCase().includes(searchLower) &&
          !(model.description?.toLowerCase().includes(searchLower))) {
        return false;
      }
    }
    return true;
  });

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
      <div className="h-full flex flex-col">
        {/* Filters Bar */}
        <FiltersBar
          search={search}
          onSearchChange={setSearch}
          stage={stageFilter}
          onStageChange={setStageFilter}
          selectedTags={selectedTags}
          onTagsChange={setSelectedTags}
          allTags={allTags}
        />

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {filteredModels.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-text-muted">
              <RiSearchLine className="w-6 h-6 mb-2 opacity-50" />
              <p className="text-sm">No models match your filters.</p>
              <button
                onClick={() => {
                  setSearch("");
                  setStageFilter("all");
                  setSelectedTags([]);
                }}
                className="text-xs text-accent hover:text-accent-hover mt-2"
              >
                Clear filters
              </button>
            </div>
          ) : (
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
                {filteredModels.map((model) => (
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
                    onViewDetails={setSelectedVersion}
                    onCompareVersions={() => setComparisonModel({ id: model.id, name: model.name })}
                  />
                ))}
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

      {/* Model Details Modal */}
      <ModelDetailsModal
        isOpen={selectedVersion !== null}
        onClose={() => setSelectedVersion(null)}
        version={selectedVersion}
        modelName={
          selectedVersion
            ? models.find((m) => m.id === selectedVersion.model_id)?.name
            : undefined
        }
        onUpdate={() => {
          loadModels();
          loadTags();
        }}
      />

      {/* Version Comparison Modal */}
      <VersionComparisonModal
        isOpen={comparisonModel !== null}
        onClose={() => setComparisonModel(null)}
        modelId={comparisonModel?.id || ""}
        modelName={comparisonModel?.name || ""}
      />
    </>
  );
}
