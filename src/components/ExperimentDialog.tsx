import { useState, useEffect, Fragment } from "react";
import { Dialog, Transition, Listbox } from "@headlessui/react";
import { RiArrowDownSLine, RiCheckLine, RiLoader4Line } from "@remixicon/react";
import {
  createExperiment,
  updateExperiment,
  Experiment,
} from "@/lib/tauri";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS: { value: Experiment['status']; label: string; description: string }[] = [
  { value: 'active', label: 'Active', description: 'Can add new runs' },
  { value: 'completed', label: 'Completed', description: 'Preserved for reference' },
  { value: 'archived', label: 'Archived', description: 'Hidden from default view' },
];

interface ExperimentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  experiment?: Experiment; // If provided, edit mode; otherwise create mode
  onSuccess?: () => void;
}

export function ExperimentDialog({
  isOpen,
  onClose,
  experiment,
  onSuccess,
}: ExperimentDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Experiment['status']>('active');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditMode = !!experiment;

  useEffect(() => {
    if (isOpen) {
      if (experiment) {
        setName(experiment.name);
        setDescription(experiment.description || "");
        setStatus(experiment.status);
      } else {
        setName("");
        setDescription("");
        setStatus('active');
      }
      setError(null);
    }
  }, [isOpen, experiment]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Please enter an experiment name");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (isEditMode && experiment) {
        await updateExperiment(
          experiment.id,
          name.trim(),
          description.trim() || undefined,
          status
        );
      } else {
        await createExperiment(name.trim(), description.trim() || undefined);
      }

      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save experiment");
    } finally {
      setSaving(false);
    }
  };

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
              <Dialog.Panel className="w-full max-w-md rounded-xl bg-background-surface border border-white/10 p-6 shadow-xl">
                <Dialog.Title className="text-lg font-semibold text-text-primary mb-4">
                  {isEditMode ? "Edit Experiment" : "New Experiment"}
                </Dialog.Title>

                <div className="space-y-4">
                  {/* Experiment Name */}
                  <div>
                    <label className="block text-sm text-text-muted mb-1.5">
                      Name
                    </label>
                    <input
                      type="text"
                      className="input w-full"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g., Iris Baseline, Housing Tuning..."
                      autoFocus
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm text-text-muted mb-1.5">
                      Description (optional)
                    </label>
                    <textarea
                      className="input w-full h-20 resize-none"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="What is this experiment testing?"
                    />
                  </div>

                  {/* Status (only in edit mode) */}
                  {isEditMode && (
                    <div>
                      <label className="block text-sm text-text-muted mb-1.5">
                        Status
                      </label>
                      <Listbox value={status} onChange={setStatus}>
                        <div className="relative">
                          <Listbox.Button className="input w-full text-left flex items-center justify-between">
                            <span>{STATUS_OPTIONS.find(s => s.value === status)?.label}</span>
                            <RiArrowDownSLine className="w-4 h-4 text-text-muted" />
                          </Listbox.Button>
                          <Transition
                            as={Fragment}
                            leave="transition ease-in duration-100"
                            leaveFrom="opacity-100"
                            leaveTo="opacity-0"
                          >
                            <Listbox.Options className="absolute mt-1 w-full overflow-auto rounded-lg bg-background-surface border border-white/10 shadow-lg focus:outline-none z-50">
                              {STATUS_OPTIONS.map((option) => (
                                <Listbox.Option
                                  key={option.value}
                                  value={option.value}
                                  className={({ active }) =>
                                    cn(
                                      "relative cursor-pointer select-none py-2 px-3",
                                      active && "bg-background-elevated"
                                    )
                                  }
                                >
                                  {({ selected }) => (
                                    <div className="flex items-center justify-between">
                                      <div>
                                        <span
                                          className={cn(
                                            "block text-sm",
                                            selected ? "font-medium text-text-primary" : "text-text-secondary"
                                          )}
                                        >
                                          {option.label}
                                        </span>
                                        <span className="text-xs text-text-muted">
                                          {option.description}
                                        </span>
                                      </div>
                                      {selected && (
                                        <RiCheckLine className="w-4 h-4 text-accent" />
                                      )}
                                    </div>
                                  )}
                                </Listbox.Option>
                              ))}
                            </Listbox.Options>
                          </Transition>
                        </div>
                      </Listbox>
                    </div>
                  )}

                  {/* Info about current experiment */}
                  {isEditMode && experiment && (
                    <div className="bg-background rounded-lg p-3 text-sm">
                      <div className="flex justify-between mb-2">
                        <span className="text-text-muted">Runs</span>
                        <span className="text-text-secondary">{experiment.run_count || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-muted">Created</span>
                        <span className="text-text-secondary">
                          {new Date(experiment.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  )}

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
                    disabled={saving || !name.trim()}
                  >
                    {saving ? (
                      <>
                        <RiLoader4Line className="w-4 h-4 animate-spin mr-2" />
                        Saving...
                      </>
                    ) : isEditMode ? (
                      "Save Changes"
                    ) : (
                      "Create Experiment"
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
