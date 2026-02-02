import { useState, useEffect, Fragment } from "react";
import { Dialog, Transition, Combobox } from "@headlessui/react";
import { RiArrowDownSLine, RiCheckLine, RiLoader4Line } from "@remixicon/react";
import {
  listModels,
  createModel,
  registerModelVersion,
  getRunMetrics,
  ModelMetadata,
  RunMetadata,
} from "@/lib/tauri";
import { cn } from "@/lib/utils";

function detectFormat(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "joblib":
      return "joblib";
    case "pkl":
    case "pickle":
      return "pickle";
    case "onnx":
      return "onnx";
    case "mlmodel":
      return "coreml";
    default:
      return "unknown";
  }
}

interface RegisterModelDialogProps {
  isOpen: boolean;
  onClose: () => void;
  run: RunMetadata;
  modelPath: string;
  onSuccess?: () => void;
}

export function RegisterModelDialog({
  isOpen,
  onClose,
  run,
  modelPath,
  onSuccess,
}: RegisterModelDialogProps) {
  const [models, setModels] = useState<ModelMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedModel, setSelectedModel] = useState<ModelMetadata | null>(null);
  const [query, setQuery] = useState("");
  const [description, setDescription] = useState("");
  const [featureNamesInput, setFeatureNamesInput] = useState("");

  const format = detectFormat(modelPath);
  const isNewModel = query.length > 0 && !models.some((m) => m.name === query);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      listModels()
        .then(setModels)
        .finally(() => setLoading(false));
      setSelectedModel(null);
      setQuery("");
      setDescription("");
      setFeatureNamesInput("");
      setError(null);
    }
  }, [isOpen]);

  const filteredModels =
    query === ""
      ? models
      : models.filter((model) =>
          model.name.toLowerCase().includes(query.toLowerCase())
        );

  const handleRegister = async () => {
    if (!query.trim()) {
      setError("Please enter a model name");
      return;
    }

    setRegistering(true);
    setError(null);

    try {
      let modelId: string;

      if (isNewModel) {
        modelId = await createModel(query.trim(), description || undefined);
      } else if (selectedModel) {
        modelId = selectedModel.id;
      } else {
        const existing = models.find((m) => m.name === query.trim());
        if (existing) {
          modelId = existing.id;
        } else {
          modelId = await createModel(query.trim(), description || undefined);
        }
      }

      // Get metrics snapshot
      let metricsSnapshot: string | undefined;
      try {
        const metrics = await getRunMetrics(run.id);
        if (metrics.length > 0) {
          const snapshot: Record<string, number | undefined> = {};
          for (const m of metrics) {
            if (m.value !== undefined) {
              snapshot[m.name] = m.value;
            }
          }
          metricsSnapshot = JSON.stringify(snapshot);
        }
      } catch {
        // Ignore metrics fetch errors
      }

      // Parse feature names
      const featureNames = featureNamesInput
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      await registerModelVersion(
        modelId,
        modelPath,
        format,
        run.id,
        metricsSnapshot,
        featureNames.length > 0 ? featureNames : undefined
      );

      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register model");
    } finally {
      setRegistering(false);
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
                  Register Model
                </Dialog.Title>

                <div className="space-y-4">
                  {/* Model Name with Autocomplete */}
                  <div>
                    <label className="block text-sm text-text-muted mb-1.5">
                      Model Name
                    </label>
                    <Combobox value={selectedModel} onChange={setSelectedModel}>
                      <div className="relative">
                        <Combobox.Input
                          className="input w-full"
                          displayValue={(model: ModelMetadata | null) =>
                            model?.name || query
                          }
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Enter or select model name..."
                        />
                        <Combobox.Button className="absolute inset-y-0 right-0 flex items-center pr-2">
                          <RiArrowDownSLine className="w-4 h-4 text-text-muted" />
                        </Combobox.Button>

                        <Transition
                          as={Fragment}
                          leave="transition ease-in duration-100"
                          leaveFrom="opacity-100"
                          leaveTo="opacity-0"
                        >
                          <Combobox.Options className="absolute mt-1 max-h-48 w-full overflow-auto rounded-lg bg-background-surface border border-white/10 shadow-lg focus:outline-none z-50">
                            {loading ? (
                              <div className="flex items-center justify-center py-4">
                                <RiLoader4Line className="w-4 h-4 animate-spin text-text-muted" />
                              </div>
                            ) : (
                              <>
                                {isNewModel && (
                                  <div className="px-3 py-2 text-xs text-accent border-b border-white/5">
                                    Create new model: "{query}"
                                  </div>
                                )}
                                {filteredModels.length === 0 && !isNewModel ? (
                                  <div className="px-3 py-2 text-sm text-text-muted">
                                    No models found
                                  </div>
                                ) : (
                                  filteredModels.map((model) => (
                                    <Combobox.Option
                                      key={model.id}
                                      value={model}
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
                                              "block truncate text-sm",
                                              selected
                                                ? "font-medium text-text-primary"
                                                : "text-text-secondary"
                                            )}
                                          >
                                            {model.name}
                                          </span>
                                          {selected && (
                                            <RiCheckLine className="w-4 h-4 text-accent" />
                                          )}
                                          {!selected && (
                                            <span className="text-xs text-text-muted">
                                              v{model.latest_version || 0}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </Combobox.Option>
                                  ))
                                )}
                              </>
                            )}
                          </Combobox.Options>
                        </Transition>
                      </div>
                    </Combobox>
                  </div>

                  {/* Description (only for new models) */}
                  {isNewModel && (
                    <div>
                      <label className="block text-sm text-text-muted mb-1.5">
                        Description (optional)
                      </label>
                      <input
                        type="text"
                        className="input w-full"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Brief description of the model..."
                      />
                    </div>
                  )}

                  {/* Feature Names */}
                  <div>
                    <label className="block text-sm text-text-muted mb-1.5">
                      Feature Names (optional)
                    </label>
                    <input
                      type="text"
                      className="input w-full"
                      value={featureNamesInput}
                      onChange={(e) => setFeatureNamesInput(e.target.value)}
                      placeholder="sepal_length, sepal_width, petal_length, petal_width"
                    />
                    <p className="text-xs text-text-muted mt-1">
                      Comma-separated list. Used for the inference playground.
                    </p>
                  </div>

                  {/* Source Run Info */}
                  <div className="bg-background rounded-lg p-3 text-sm">
                    <div className="flex justify-between mb-2">
                      <span className="text-text-muted">Source Run</span>
                      <span className="text-text-secondary font-mono">
                        {run.id.slice(0, 8)}
                      </span>
                    </div>
                    <div className="flex justify-between mb-2">
                      <span className="text-text-muted">Pipeline</span>
                      <span className="text-text-secondary">{run.pipeline_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Format</span>
                      <span className="text-text-secondary">{format}</span>
                    </div>
                  </div>

                  {error && (
                    <div className="text-sm text-state-error bg-state-error/10 rounded-lg px-3 py-2">
                      {error}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 mt-6">
                  <button onClick={onClose} className="btn-secondary" disabled={registering}>
                    Cancel
                  </button>
                  <button
                    onClick={handleRegister}
                    className="btn-primary"
                    disabled={registering || !query.trim()}
                  >
                    {registering ? (
                      <>
                        <RiLoader4Line className="w-4 h-4 animate-spin mr-2" />
                        Registering...
                      </>
                    ) : (
                      "Register"
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
