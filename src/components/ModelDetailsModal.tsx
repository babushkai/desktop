import { useState, useEffect, Fragment } from "react";
import { Dialog, Transition } from "@headlessui/react";
import {
  RiCloseLine,
  RiLoader4Line,
  RiFileCopyLine,
  RiFileDownloadLine,
} from "@remixicon/react";
import {
  ModelVersion,
  updateModelVersionMetadata,
  updateModelVersionExportPath,
  getRunMetrics,
  Metric,
  runScriptAndWait,
  cancelScript,
  ScriptEvent,
} from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { ModelTagsInput } from "./ModelTagsInput";
import { ExportFormatDialog } from "./ExportFormatDialog";
import { ExportProgressDialog } from "./ExportProgressDialog";
import { generateOnnxExportCode, generateCoremlExportCode } from "@/lib/exportCodeGen";

function formatFileSize(bytes?: number): string {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStageBadge(stage: string) {
  switch (stage) {
    case "production":
      return { icon: "🟢", label: "Production", className: "text-state-success bg-state-success/20" };
    case "staging":
      return { icon: "🟡", label: "Staging", className: "text-state-warning bg-state-warning/20" };
    case "archived":
      return { icon: "⚫", label: "Archived", className: "text-text-muted bg-white/5" };
    default:
      return { icon: "⚪", label: "None", className: "text-text-muted bg-white/10" };
  }
}

interface ModelDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  version: ModelVersion | null;
  modelName?: string;
  onUpdate?: () => void;
}

export function ModelDetailsModal({
  isOpen,
  onClose,
  version,
  modelName,
  onUpdate,
}: ModelDetailsModalProps) {
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [runMetrics, setRunMetrics] = useState<Metric[]>([]);
  const [copied, setCopied] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<string>("");
  const [localVersion, setLocalVersion] = useState<ModelVersion | null>(null);
  const [showProgressDialog, setShowProgressDialog] = useState(false);
  const [exportFormat, setExportFormat] = useState<"onnx" | "coreml">("onnx");
  const [exportSteps, setExportSteps] = useState<{ label: string; status: "pending" | "in_progress" | "completed" | "error" }[]>([]);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportCancelled, setExportCancelled] = useState(false);

  // Initialize form with version data
  useEffect(() => {
    if (isOpen && version) {
      setDescription(version.description || "");
      setNotes(version.notes || "");
      setTags(version.tags || []);
      setDirty(false);
      setCopied(false);
      setLocalVersion(version);
      setShowExportDialog(false);
      setExporting(false);
      setExportProgress("");

      // Load run metrics if run_id exists
      if (version.run_id) {
        getRunMetrics(version.run_id)
          .then(setRunMetrics)
          .catch(console.error);
      } else {
        setRunMetrics([]);
      }
    }
  }, [isOpen, version]);

  const handleSave = async () => {
    if (!version) return;

    setSaving(true);
    try {
      await updateModelVersionMetadata(
        version.id,
        description.trim() || undefined,
        notes.trim() || undefined
      );
      setDirty(false);
      onUpdate?.();
    } catch (error) {
      console.error("Failed to save:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleCopyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy path:", error);
    }
  };

  const handleExport = async (format: "onnx" | "coreml") => {
    if (!localVersion) return;

    setExporting(true);
    setExportFormat(format);
    setExportError(null);
    setExportCancelled(false);
    setShowExportDialog(false);
    setShowProgressDialog(true);

    // Initialize steps based on format
    const needsOnnxFirst = format === "coreml" && !localVersion.onnx_path;
    const initialSteps = format === "coreml"
      ? needsOnnxFirst
        ? [
            { label: "Converting to ONNX...", status: "pending" as const },
            { label: "Converting to CoreML...", status: "pending" as const },
          ]
        : [{ label: "Converting to CoreML...", status: "pending" as const }]
      : [{ label: "Converting to ONNX...", status: "pending" as const }];

    setExportSteps(initialSteps);

    try {
      // Determine output paths
      const modelDir = localVersion.file_path.replace(/[/\\][^/\\]+$/, "");
      const onnxPath = `${modelDir}/model.onnx`;
      const coremlPath = `${modelDir}/model.mlmodel`;

      let stepIndex = 0;

      // If CoreML, we need ONNX first
      if (format === "coreml" && needsOnnxFirst) {
        setExportSteps((prev) => prev.map((s, i) => i === stepIndex ? { ...s, status: "in_progress" as const } : s));
        setExportProgress("Converting to ONNX...");

        await runOnnxExport(localVersion, onnxPath);

        if (exportCancelled) return;

        // Update local version with new ONNX path
        await updateModelVersionExportPath(localVersion.id, onnxPath, undefined);
        setLocalVersion((prev) => prev ? { ...prev, onnx_path: onnxPath } : null);
        setExportSteps((prev) => prev.map((s, i) => i === stepIndex ? { ...s, status: "completed" as const } : s));
        stepIndex++;
      }

      if (format === "coreml") {
        setExportSteps((prev) => prev.map((s, i) => i === stepIndex ? { ...s, status: "in_progress" as const } : s));
        setExportProgress("Converting to CoreML...");

        await runCoremlExport(localVersion.onnx_path || onnxPath, coremlPath);

        if (exportCancelled) return;

        // Update database with CoreML path
        await updateModelVersionExportPath(localVersion.id, undefined, coremlPath);
        setLocalVersion((prev) => prev ? { ...prev, coreml_path: coremlPath } : null);
        setExportSteps((prev) => prev.map((s, i) => i === stepIndex ? { ...s, status: "completed" as const } : s));
      } else {
        // ONNX only
        setExportSteps((prev) => prev.map((s, i) => i === 0 ? { ...s, status: "in_progress" as const } : s));
        setExportProgress("Converting to ONNX...");

        await runOnnxExport(localVersion, onnxPath);

        if (exportCancelled) return;

        // Update database with ONNX path
        await updateModelVersionExportPath(localVersion.id, onnxPath, undefined);
        setLocalVersion((prev) => prev ? { ...prev, onnx_path: onnxPath } : null);
        setExportSteps((prev) => prev.map((s, i) => i === 0 ? { ...s, status: "completed" as const } : s));
      }

      setExportProgress(`${format.toUpperCase()} export complete!`);
      onUpdate?.();
    } catch (error) {
      console.error("Export failed:", error);
      const errMsg = error instanceof Error ? error.message : String(error);
      setExportError(errMsg);
      setExportProgress(`Export failed: ${errMsg}`);
      // Mark current step as error
      setExportSteps((prev) => prev.map((s) => s.status === "in_progress" ? { ...s, status: "error" as const } : s));
    } finally {
      setExporting(false);
    }
  };

  const handleCancelExport = async () => {
    if (exporting) {
      setExportCancelled(true);
      try {
        await cancelScript();
      } catch (error) {
        console.error("Failed to cancel:", error);
      }
    }
    setShowProgressDialog(false);
    setExportError(null);
  };

  const runOnnxExport = async (ver: ModelVersion, outputPath: string): Promise<void> => {
    const code = generateOnnxExportCode({
      modelPath: ver.file_path,
      outputPath,
      nFeatures: ver.n_features,
      featureNames: ver.feature_names ? JSON.parse(ver.feature_names) : undefined,
    });

    let errorMessage = "";

    const exitCode = await runScriptAndWait(code, "", (event: ScriptEvent) => {
      // Parse structured messages from log output
      if (event.type === "log") {
        const line = event.message;
        const emitMatch = line.match(/__EMIT__(.+?)__EMIT__/);
        if (emitMatch) {
          try {
            const msg = JSON.parse(emitMatch[1]);
            if (msg.type === "error") {
              errorMessage = msg.message;
            } else if (msg.type === "status") {
              setExportProgress(msg.message);
            }
          } catch {
            // Ignore parse errors
          }
        }
      } else if (event.type === "error") {
        errorMessage = event.message;
      }
    });

    if (exitCode !== 0 || errorMessage) {
      throw new Error(errorMessage || `Export failed with exit code ${exitCode}`);
    }
  };

  const runCoremlExport = async (onnxPath: string, outputPath: string): Promise<void> => {
    const code = generateCoremlExportCode({
      modelPath: "",
      outputPath,
      onnxPath,
    });

    let errorMessage = "";

    const exitCode = await runScriptAndWait(code, "", (event: ScriptEvent) => {
      // Parse structured messages from log output
      if (event.type === "log") {
        const line = event.message;
        const emitMatch = line.match(/__EMIT__(.+?)__EMIT__/);
        if (emitMatch) {
          try {
            const msg = JSON.parse(emitMatch[1]);
            if (msg.type === "error") {
              errorMessage = msg.message;
            } else if (msg.type === "status") {
              setExportProgress(msg.message);
            }
          } catch {
            // Ignore parse errors
          }
        }
      } else if (event.type === "error") {
        errorMessage = event.message;
      }
    });

    if (exitCode !== 0 || errorMessage) {
      throw new Error(errorMessage || `Export failed with exit code ${exitCode}`);
    }
  };

  // Parse feature names from JSON
  const featureNames = version?.feature_names
    ? (() => {
        try {
          return JSON.parse(version.feature_names);
        } catch {
          return null;
        }
      })()
    : null;

  if (!version) return null;

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
              <Dialog.Panel className="w-full max-w-xl rounded-xl bg-background-surface border border-white/10 shadow-xl max-h-[85vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                  <div>
                    <Dialog.Title className="text-lg font-semibold text-text-primary">
                      {modelName || "Model"} v{version.version}
                    </Dialog.Title>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs mt-1",
                        getStageBadge(version.stage).className
                      )}
                    >
                      {getStageBadge(version.stage).icon}{" "}
                      {getStageBadge(version.stage).label}
                    </span>
                  </div>
                  <button
                    onClick={onClose}
                    className="p-1 rounded hover:bg-white/10 text-text-muted hover:text-text-primary"
                  >
                    <RiCloseLine className="w-5 h-5" />
                  </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
                  {/* Basic Info */}
                  <div>
                    <h3 className="text-sm font-medium text-text-secondary mb-2">
                      Basic Info
                    </h3>
                    <div className="bg-background rounded-lg p-3 text-sm space-y-2">
                      <div className="flex justify-between">
                        <span className="text-text-muted">ID</span>
                        <span className="text-text-secondary font-mono text-xs">
                          {version.id.slice(0, 12)}...
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-muted">Format</span>
                        <span className="text-text-secondary">{version.format}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-muted">Size</span>
                        <span className="text-text-secondary">
                          {formatFileSize(version.file_size)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-muted">Created</span>
                        <span className="text-text-secondary">
                          {formatDateTime(version.created_at)}
                        </span>
                      </div>
                      {version.promoted_at && (
                        <div className="flex justify-between">
                          <span className="text-text-muted">Promoted</span>
                          <span className="text-text-secondary">
                            {formatDateTime(version.promoted_at)}
                          </span>
                        </div>
                      )}
                      {version.run_id && (
                        <div className="flex justify-between">
                          <span className="text-text-muted">Run ID</span>
                          <span className="text-text-secondary font-mono text-xs">
                            {version.run_id.slice(0, 12)}...
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Feature Info */}
                  {(version.n_features || featureNames) && (
                    <div>
                      <h3 className="text-sm font-medium text-text-secondary mb-2">
                        Features
                      </h3>
                      <div className="bg-background rounded-lg p-3 text-sm">
                        {version.n_features && (
                          <div className="flex justify-between mb-2">
                            <span className="text-text-muted">Count</span>
                            <span className="text-text-secondary">
                              {version.n_features}
                            </span>
                          </div>
                        )}
                        {featureNames && featureNames.length > 0 && (
                          <div>
                            <span className="text-text-muted block mb-1">Names</span>
                            <div className="flex flex-wrap gap-1">
                              {featureNames.slice(0, 10).map((name: string) => (
                                <span
                                  key={name}
                                  className="px-1.5 py-0.5 rounded bg-white/5 text-text-secondary text-xs"
                                >
                                  {name}
                                </span>
                              ))}
                              {featureNames.length > 10 && (
                                <span className="text-text-muted text-xs">
                                  +{featureNames.length - 10} more
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Model File */}
                  <div>
                    <h3 className="text-sm font-medium text-text-secondary mb-2">
                      Model File
                    </h3>
                    <div className="bg-background rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-text-muted font-mono truncate flex-1 mr-2">
                          {version.file_path}
                        </span>
                        <button
                          onClick={() => handleCopyPath(version.file_path)}
                          className="btn-secondary py-1 px-2 text-xs flex items-center gap-1 whitespace-nowrap"
                        >
                          <RiFileCopyLine className="w-3.5 h-3.5" />
                          {copied ? "Copied!" : "Copy Path"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                      Description
                    </label>
                    <textarea
                      className="input w-full h-20 resize-none text-sm"
                      value={description}
                      onChange={(e) => {
                        setDescription(e.target.value);
                        setDirty(true);
                      }}
                      placeholder="Add a description..."
                    />
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                      Notes
                    </label>
                    <textarea
                      className="input w-full h-20 resize-none text-sm"
                      value={notes}
                      onChange={(e) => {
                        setNotes(e.target.value);
                        setDirty(true);
                      }}
                      placeholder="Add notes..."
                    />
                  </div>

                  {/* Tags */}
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                      Tags
                    </label>
                    <ModelTagsInput
                      versionId={version.id}
                      tags={tags}
                      onChange={setTags}
                    />
                  </div>

                  {/* Exports */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-medium text-text-secondary">
                        Exports
                      </h3>
                      <button
                        onClick={() => setShowExportDialog(true)}
                        disabled={exporting}
                        className="btn-secondary py-1 px-2 text-xs flex items-center gap-1"
                      >
                        <RiFileDownloadLine className="w-3.5 h-3.5" />
                        Export...
                      </button>
                    </div>
                    <div className="bg-background rounded-lg p-3 text-sm space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-text-primary">ONNX</span>
                          <span className="text-text-muted ml-2 text-xs">
                            {localVersion?.onnx_path ? "Exported" : "Not exported"}
                          </span>
                        </div>
                        {localVersion?.onnx_path ? (
                          <button
                            onClick={() => handleCopyPath(localVersion.onnx_path!)}
                            className="text-xs text-accent hover:text-accent-hover flex items-center gap-1"
                          >
                            <RiFileCopyLine className="w-3.5 h-3.5" />
                            Copy Path
                          </button>
                        ) : (
                          <span className="text-xs text-text-muted">-</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-text-primary">CoreML</span>
                          <span className="text-text-muted ml-2 text-xs">
                            {localVersion?.coreml_path ? "Exported" : "Not exported"}
                          </span>
                        </div>
                        {localVersion?.coreml_path ? (
                          <button
                            onClick={() => handleCopyPath(localVersion.coreml_path!)}
                            className="text-xs text-accent hover:text-accent-hover flex items-center gap-1"
                          >
                            <RiFileCopyLine className="w-3.5 h-3.5" />
                            Copy Path
                          </button>
                        ) : (
                          <span className="text-xs text-text-muted">-</span>
                        )}
                      </div>

                      {/* Export Progress */}
                      {exportProgress && (
                        <div className="mt-2 pt-2 border-t border-white/5">
                          <div className="flex items-center gap-2">
                            {exporting && (
                              <RiLoader4Line className="w-4 h-4 animate-spin text-accent" />
                            )}
                            <span className={cn(
                              "text-xs",
                              exportProgress.includes("failed") ? "text-state-error" : "text-text-muted"
                            )}>
                              {exportProgress}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Metrics from Run */}
                  {runMetrics.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-text-secondary mb-2">
                        Metrics (from run)
                      </h3>
                      <div className="bg-background rounded-lg p-3 text-sm">
                        <div className="grid grid-cols-2 gap-2">
                          {runMetrics
                            .filter((m) => m.value !== undefined && m.value !== null)
                            .map((metric) => (
                              <div
                                key={metric.name}
                                className="flex justify-between"
                              >
                                <span className="text-text-muted capitalize">
                                  {metric.name}
                                </span>
                                <span className="text-text-secondary">
                                  {typeof metric.value === "number"
                                    ? metric.value.toFixed(4)
                                    : "-"}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-white/5">
                  <button onClick={onClose} className="btn-secondary">
                    Close
                  </button>
                  {dirty && (
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
                  )}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>

      {/* Export Format Dialog */}
      <ExportFormatDialog
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        version={localVersion}
        modelName={modelName}
        onExport={handleExport}
        exporting={exporting}
      />

      {/* Export Progress Dialog */}
      <ExportProgressDialog
        isOpen={showProgressDialog}
        onCancel={handleCancelExport}
        format={exportFormat}
        modelName={modelName || "model"}
        version={localVersion?.version || 0}
        steps={exportSteps}
        error={exportError}
      />
    </Transition>
  );
}
