import { Fragment } from "react";
import { Dialog, Transition } from "@headlessui/react";
import {
  RiLoader4Line,
  RiCheckLine,
  RiCloseLine,
  RiErrorWarningLine,
} from "@remixicon/react";
import { cn } from "@/lib/utils";

interface ExportProgressDialogProps {
  isOpen: boolean;
  onCancel: () => void;
  format: "onnx" | "coreml";
  modelName: string;
  version: number;
  steps: {
    label: string;
    status: "pending" | "in_progress" | "completed" | "error";
  }[];
  error?: string | null;
}

export function ExportProgressDialog({
  isOpen,
  onCancel,
  format,
  modelName,
  version,
  steps,
  error,
}: ExportProgressDialogProps) {
  const hasError = error || steps.some((s) => s.status === "error");
  const isComplete = steps.every((s) => s.status === "completed");
  const isRunning = steps.some((s) => s.status === "in_progress");

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog
        as="div"
        className="relative z-[60]"
        onClose={() => {
          // Only allow close if not running
          if (!isRunning) {
            onCancel();
          }
        }}
      >
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
              <Dialog.Panel className="w-full max-w-sm rounded-xl bg-background-surface border border-white/10 shadow-xl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                  <Dialog.Title className="text-lg font-semibold text-text-primary">
                    {hasError
                      ? "Export Failed"
                      : isComplete
                      ? "Export Complete"
                      : `Exporting to ${format.toUpperCase()}`}
                  </Dialog.Title>
                  {!isRunning && (
                    <button
                      onClick={onCancel}
                      className="p-1 rounded hover:bg-white/10 text-text-muted hover:text-text-primary"
                    >
                      <RiCloseLine className="w-5 h-5" />
                    </button>
                  )}
                </div>

                {/* Content */}
                <div className="px-6 py-4 space-y-4">
                  {/* Steps */}
                  <div className="space-y-3">
                    {steps.map((step, index) => (
                      <div key={index} className="flex items-center gap-3">
                        <div className="w-6 h-6 flex items-center justify-center">
                          {step.status === "pending" && (
                            <div className="w-2 h-2 rounded-full bg-white/20" />
                          )}
                          {step.status === "in_progress" && (
                            <RiLoader4Line className="w-5 h-5 animate-spin text-accent" />
                          )}
                          {step.status === "completed" && (
                            <RiCheckLine className="w-5 h-5 text-state-success" />
                          )}
                          {step.status === "error" && (
                            <RiErrorWarningLine className="w-5 h-5 text-state-error" />
                          )}
                        </div>
                        <span
                          className={cn(
                            "text-sm",
                            step.status === "completed"
                              ? "text-text-secondary"
                              : step.status === "in_progress"
                              ? "text-text-primary"
                              : step.status === "error"
                              ? "text-state-error"
                              : "text-text-muted"
                          )}
                        >
                          {step.label}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Model Info */}
                  <div className="text-xs text-text-muted pt-2 border-t border-white/5">
                    Model: {modelName} v{version}
                  </div>

                  {/* Error message */}
                  {error && (
                    <div className="p-3 rounded-lg bg-state-error/10 border border-state-error/20">
                      <p className="text-sm text-state-error">{error}</p>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 px-6 py-4 border-t border-white/5">
                  {isRunning ? (
                    <button onClick={onCancel} className="btn-destructive">
                      Cancel
                    </button>
                  ) : (
                    <button onClick={onCancel} className="btn-secondary">
                      {isComplete ? "Done" : "Close"}
                    </button>
                  )}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
