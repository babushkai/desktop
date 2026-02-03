import { useState, useEffect, Fragment, useCallback } from "react";
import { Dialog, Transition, Combobox, Listbox } from "@headlessui/react";
import {
  RiArrowDownSLine,
  RiCheckLine,
  RiLoader4Line,
  RiCloseLine,
  RiAddLine,
} from "@remixicon/react";
import {
  updateRunDisplayName,
  setRunNote,
  addRunTag,
  removeRunTag,
  listAllTags,
  setRunExperiment,
  RunMetadata,
  Experiment,
} from "@/lib/tauri";
import { cn } from "@/lib/utils";

interface RunDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  run: RunMetadata | null;
  experiments: Experiment[];
  onSuccess?: () => void;
}

export function RunDetailModal({
  isOpen,
  onClose,
  run,
  experiments,
  onSuccess,
}: RunDetailModalProps) {
  const [displayName, setDisplayName] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [selectedExperiment, setSelectedExperiment] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load all tags for autocomplete
  useEffect(() => {
    if (isOpen) {
      listAllTags().then(setAllTags).catch(console.error);
    }
  }, [isOpen]);

  // Initialize form with run data
  useEffect(() => {
    if (isOpen && run) {
      setDisplayName(run.display_name || "");
      setNotes(run.notes || "");
      setTags(run.tags || []);
      setSelectedExperiment(run.experiment_id || null);
      setNewTag("");
      setError(null);
    }
  }, [isOpen, run]);

  const handleAddTag = useCallback(() => {
    const tag = newTag.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setNewTag("");
    }
  }, [newTag, tags]);

  const handleRemoveTag = useCallback((tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  }, [tags]);

  const handleSave = async () => {
    if (!run) return;

    setSaving(true);
    setError(null);

    try {
      // Update display name
      await updateRunDisplayName(run.id, displayName.trim() || undefined);

      // Update notes
      if (notes.trim()) {
        await setRunNote(run.id, notes.trim());
      }

      // Update experiment assignment
      if (selectedExperiment !== run.experiment_id) {
        await setRunExperiment(run.id, selectedExperiment || undefined);
      }

      // Update tags - add new ones and remove deleted ones
      const originalTags = run.tags || [];
      const tagsToAdd = tags.filter((t) => !originalTags.includes(t));
      const tagsToRemove = originalTags.filter((t) => !tags.includes(t));

      for (const tag of tagsToAdd) {
        await addRunTag(run.id, tag);
      }
      for (const tag of tagsToRemove) {
        await removeRunTag(run.id, tag);
      }

      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save run details");
    } finally {
      setSaving(false);
    }
  };

  // Filter available tags for autocomplete (exclude already added)
  const availableTags = allTags.filter(
    (t) => !tags.includes(t) && t.toLowerCase().includes(newTag.toLowerCase())
  );

  // Get active experiments for the dropdown
  const activeExperiments = experiments.filter((e) => e.status === 'active');

  if (!run) return null;

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
              <Dialog.Panel className="w-full max-w-lg rounded-xl bg-background-surface border border-white/10 p-6 shadow-xl">
                <Dialog.Title className="text-lg font-semibold text-text-primary mb-4">
                  Edit Run Details
                </Dialog.Title>

                <div className="space-y-4">
                  {/* Run Info Summary */}
                  <div className="bg-background rounded-lg p-3 text-sm">
                    <div className="flex justify-between mb-2">
                      <span className="text-text-muted">Run ID</span>
                      <span className="text-text-secondary font-mono">
                        {run.id.slice(0, 8)}
                      </span>
                    </div>
                    <div className="flex justify-between mb-2">
                      <span className="text-text-muted">Pipeline</span>
                      <span className="text-text-secondary">{run.pipeline_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Status</span>
                      <span className={cn(
                        "text-sm",
                        run.status === 'completed' && "text-state-success",
                        run.status === 'failed' && "text-state-error",
                        run.status === 'running' && "text-state-warning"
                      )}>
                        {run.status}
                      </span>
                    </div>
                  </div>

                  {/* Display Name */}
                  <div>
                    <label className="block text-sm text-text-muted mb-1.5">
                      Display Name
                    </label>
                    <input
                      type="text"
                      className="input w-full"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g., High LR test, Baseline with dropout..."
                    />
                    <p className="text-xs text-text-muted mt-1">
                      Optional friendly name shown instead of timestamp
                    </p>
                  </div>

                  {/* Experiment Assignment */}
                  <div>
                    <label className="block text-sm text-text-muted mb-1.5">
                      Experiment
                    </label>
                    <Listbox value={selectedExperiment} onChange={setSelectedExperiment}>
                      <div className="relative">
                        <Listbox.Button className="input w-full text-left flex items-center justify-between">
                          <span className={cn(!selectedExperiment && "text-text-muted")}>
                            {selectedExperiment
                              ? experiments.find((e) => e.id === selectedExperiment)?.name
                              : "(No Experiment)"}
                          </span>
                          <RiArrowDownSLine className="w-4 h-4 text-text-muted" />
                        </Listbox.Button>
                        <Transition
                          as={Fragment}
                          leave="transition ease-in duration-100"
                          leaveFrom="opacity-100"
                          leaveTo="opacity-0"
                        >
                          <Listbox.Options className="absolute mt-1 max-h-48 w-full overflow-auto rounded-lg bg-background-surface border border-white/10 shadow-lg focus:outline-none z-50">
                            <Listbox.Option
                              value={null}
                              className={({ active }) =>
                                cn(
                                  "relative cursor-pointer select-none py-2 px-3",
                                  active && "bg-background-elevated"
                                )
                              }
                            >
                              {({ selected }) => (
                                <div className="flex items-center justify-between">
                                  <span className="text-sm text-text-muted">(No Experiment)</span>
                                  {selected && <RiCheckLine className="w-4 h-4 text-accent" />}
                                </div>
                              )}
                            </Listbox.Option>
                            {activeExperiments.map((exp) => (
                              <Listbox.Option
                                key={exp.id}
                                value={exp.id}
                                className={({ active }) =>
                                  cn(
                                    "relative cursor-pointer select-none py-2 px-3",
                                    active && "bg-background-elevated"
                                  )
                                }
                              >
                                {({ selected }) => (
                                  <div className="flex items-center justify-between">
                                    <span
                                      className={cn(
                                        "text-sm",
                                        selected ? "font-medium text-text-primary" : "text-text-secondary"
                                      )}
                                    >
                                      {exp.name}
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
                  </div>

                  {/* Tags */}
                  <div>
                    <label className="block text-sm text-text-muted mb-1.5">
                      Tags
                    </label>

                    {/* Current tags */}
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/20 text-accent text-xs"
                          >
                            {tag}
                            <button
                              type="button"
                              onClick={() => handleRemoveTag(tag)}
                              className="hover:text-accent-hover"
                            >
                              <RiCloseLine className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Add new tag */}
                    <Combobox value="" onChange={(val: string) => {
                      if (val && !tags.includes(val)) {
                        setTags([...tags, val]);
                        setNewTag("");
                      }
                    }}>
                      <div className="relative">
                        <div className="flex gap-2">
                          <Combobox.Input
                            className="input flex-1"
                            value={newTag}
                            onChange={(e) => setNewTag(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && newTag.trim()) {
                                e.preventDefault();
                                handleAddTag();
                              }
                            }}
                            placeholder="Add tag..."
                          />
                          <button
                            type="button"
                            onClick={handleAddTag}
                            disabled={!newTag.trim()}
                            className="btn-secondary px-3"
                          >
                            <RiAddLine className="w-4 h-4" />
                          </button>
                        </div>

                        {availableTags.length > 0 && newTag && (
                          <Transition
                            as={Fragment}
                            leave="transition ease-in duration-100"
                            leaveFrom="opacity-100"
                            leaveTo="opacity-0"
                          >
                            <Combobox.Options className="absolute mt-1 max-h-32 w-full overflow-auto rounded-lg bg-background-surface border border-white/10 shadow-lg focus:outline-none z-50">
                              {availableTags.slice(0, 5).map((tag) => (
                                <Combobox.Option
                                  key={tag}
                                  value={tag}
                                  className={({ active }) =>
                                    cn(
                                      "relative cursor-pointer select-none py-2 px-3 text-sm",
                                      active ? "bg-background-elevated text-text-primary" : "text-text-secondary"
                                    )
                                  }
                                >
                                  {tag}
                                </Combobox.Option>
                              ))}
                            </Combobox.Options>
                          </Transition>
                        )}
                      </div>
                    </Combobox>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-sm text-text-muted mb-1.5">
                      Notes
                    </label>
                    <textarea
                      className="input w-full h-24 resize-none"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add notes about this run..."
                    />
                  </div>

                  {error && (
                    <div className="text-sm text-state-error bg-state-error/10 rounded-lg px-3 py-2">
                      {error}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 mt-6">
                  <button onClick={onClose} className="btn-secondary" disabled={saving}>
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    className="btn-primary"
                    disabled={saving}
                  >
                    {saving ? (
                      <>
                        <RiLoader4Line className="w-4 h-4 animate-spin mr-2" />
                        Saving...
                      </>
                    ) : (
                      "Save Changes"
                    )}
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
