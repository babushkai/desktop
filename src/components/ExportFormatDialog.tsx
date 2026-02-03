import { useState, useEffect, Fragment } from "react";
import { Dialog, Transition, RadioGroup } from "@headlessui/react";
import {
  RiCloseLine,
  RiLoader4Line,
  RiCheckLine,
  RiAlertLine,
  RiRefreshLine,
} from "@remixicon/react";
import { checkPythonPackage, ModelVersion } from "@/lib/tauri";
import { cn } from "@/lib/utils";

interface ExportFormatDialogProps {
  isOpen: boolean;
  onClose: () => void;
  version: ModelVersion | null;
  modelName?: string;
  onExport: (format: "onnx" | "coreml") => void;
  exporting: boolean;
}

interface ExportOption {
  value: "onnx" | "coreml";
  label: string;
  extension: string;
  description: string;
  platforms: string;
  packages: string[];
}

const EXPORT_OPTIONS: ExportOption[] = [
  {
    value: "onnx",
    label: "ONNX",
    extension: ".onnx",
    description: "Cross-platform inference with ONNX Runtime",
    platforms: "Python, C++, C#, Java, JavaScript",
    packages: ["skl2onnx"],
  },
  {
    value: "coreml",
    label: "CoreML",
    extension: ".mlmodel",
    description: "Native Apple platform deployment",
    platforms: "iOS, macOS, watchOS, tvOS",
    packages: ["skl2onnx", "coremltools"],
  },
];

export function ExportFormatDialog({
  isOpen,
  onClose,
  version,
  modelName,
  onExport,
  exporting,
}: ExportFormatDialogProps) {
  const [selectedFormat, setSelectedFormat] = useState<"onnx" | "coreml">("onnx");
  const [dependencies, setDependencies] = useState<Record<string, boolean>>({});
  const [checkingDeps, setCheckingDeps] = useState(false);

  const checkDependencies = async () => {
    setCheckingDeps(true);
    try {
      const [skl2onnx, coremltools] = await Promise.all([
        checkPythonPackage("skl2onnx"),
        checkPythonPackage("coremltools"),
      ]);
      setDependencies({ skl2onnx, coremltools });
    } catch (error) {
      console.error("Failed to check dependencies:", error);
    } finally {
      setCheckingDeps(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      checkDependencies();
    }
  }, [isOpen]);

  const getOptionStatus = (option: ExportOption): { ready: boolean; missing: string[] } => {
    const missing = option.packages.filter((pkg) => !dependencies[pkg]);
    return { ready: missing.length === 0, missing };
  };

  const handleExport = () => {
    const status = getOptionStatus(
      EXPORT_OPTIONS.find((o) => o.value === selectedFormat)!
    );
    if (status.ready) {
      onExport(selectedFormat);
    }
  };

  // Check if the selected format has already been exported
  const hasExistingExport = (): boolean => {
    if (!version) return false;
    if (selectedFormat === "onnx" && version.onnx_path) return true;
    if (selectedFormat === "coreml" && version.coreml_path) return true;
    return false;
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
              <Dialog.Panel className="w-full max-w-md rounded-xl bg-background-surface border border-white/10 shadow-xl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                  <Dialog.Title className="text-lg font-semibold text-text-primary">
                    Export Model
                  </Dialog.Title>
                  <button
                    onClick={onClose}
                    disabled={exporting}
                    className="p-1 rounded hover:bg-white/10 text-text-muted hover:text-text-primary disabled:opacity-50"
                  >
                    <RiCloseLine className="w-5 h-5" />
                  </button>
                </div>

                {/* Content */}
                <div className="px-6 py-4">
                  <p className="text-sm text-text-muted mb-4">
                    Choose export format for: <span className="text-text-primary">{modelName || "model"} v{version?.version}</span>
                  </p>

                  {checkingDeps ? (
                    <div className="flex items-center justify-center py-8">
                      <RiLoader4Line className="w-5 h-5 animate-spin text-text-muted" />
                      <span className="ml-2 text-text-muted text-sm">Checking dependencies...</span>
                    </div>
                  ) : (
                    <RadioGroup value={selectedFormat} onChange={setSelectedFormat} className="space-y-3">
                      {EXPORT_OPTIONS.map((option) => {
                        const status = getOptionStatus(option);
                        return (
                          <RadioGroup.Option
                            key={option.value}
                            value={option.value}
                            disabled={!status.ready}
                            className={({ checked }) =>
                              cn(
                                "relative flex cursor-pointer rounded-lg border p-4 focus:outline-none transition-colors",
                                checked
                                  ? "border-accent bg-accent/10"
                                  : "border-white/10 hover:border-white/20",
                                !status.ready && "opacity-60 cursor-not-allowed"
                              )
                            }
                          >
                            {({ checked }) => (
                              <>
                                <div className="flex w-full items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <RadioGroup.Label
                                        as="p"
                                        className={cn(
                                          "font-medium",
                                          checked ? "text-accent" : "text-text-primary"
                                        )}
                                      >
                                        {option.label} ({option.extension})
                                      </RadioGroup.Label>
                                      {status.ready ? (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-state-success/20 text-state-success">
                                          <RiCheckLine className="w-3 h-3" />
                                          Ready
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-state-warning/20 text-state-warning">
                                          <RiAlertLine className="w-3 h-3" />
                                          Missing
                                        </span>
                                      )}
                                    </div>
                                    <RadioGroup.Description
                                      as="span"
                                      className="block text-xs text-text-muted mt-1"
                                    >
                                      {option.description}
                                    </RadioGroup.Description>
                                    <RadioGroup.Description
                                      as="span"
                                      className="block text-xs text-text-secondary mt-0.5"
                                    >
                                      Supported by: {option.platforms}
                                    </RadioGroup.Description>

                                    {!status.ready && (
                                      <div className="mt-2 text-xs">
                                        <span className="text-state-warning">
                                          Requires: pip install {status.missing.join(" ")}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                  <div
                                    className={cn(
                                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                                      checked
                                        ? "border-accent bg-accent"
                                        : "border-white/30 bg-transparent"
                                    )}
                                  >
                                    {checked && <RiCheckLine className="w-3 h-3 text-white" />}
                                  </div>
                                </div>
                              </>
                            )}
                          </RadioGroup.Option>
                        );
                      })}
                    </RadioGroup>
                  )}

                  {!checkingDeps && (
                    <button
                      onClick={checkDependencies}
                      className="mt-4 text-xs text-accent hover:text-accent-hover flex items-center gap-1"
                    >
                      <RiRefreshLine className="w-3.5 h-3.5" />
                      Check Again
                    </button>
                  )}

                  {selectedFormat === "coreml" && (
                    <p className="mt-4 text-xs text-text-muted">
                      Note: CoreML export will auto-create ONNX first if needed.
                    </p>
                  )}

                  {hasExistingExport() && (
                    <div className="mt-4 p-3 rounded-lg bg-state-warning/10 border border-state-warning/20">
                      <p className="text-sm text-state-warning">
                        {selectedFormat === "onnx" ? "ONNX" : "CoreML"} export already exists. Exporting again will replace the existing file.
                      </p>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-white/5">
                  <button
                    onClick={onClose}
                    disabled={exporting}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleExport}
                    disabled={
                      exporting ||
                      checkingDeps ||
                      !getOptionStatus(EXPORT_OPTIONS.find((o) => o.value === selectedFormat)!).ready
                    }
                    className="btn-primary"
                  >
                    {exporting ? (
                      <>
                        <RiLoader4Line className="w-4 h-4 animate-spin mr-2" />
                        Exporting...
                      </>
                    ) : (
                      "Export"
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
