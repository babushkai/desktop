import { Fragment } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { RiAlertLine } from "@remixicon/react";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
}: ConfirmDialogProps) {
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
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-state-warning/20 flex items-center justify-center">
                    <RiAlertLine className="w-5 h-5 text-state-warning" />
                  </div>
                  <div className="flex-1">
                    <Dialog.Title className="text-lg font-semibold text-text-primary">
                      {title}
                    </Dialog.Title>
                    <p className="mt-2 text-sm text-text-secondary">{message}</p>
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <button onClick={onClose} className="btn-secondary">
                    {cancelLabel}
                  </button>
                  <button
                    onClick={() => {
                      onConfirm();
                      onClose();
                    }}
                    className={
                      variant === "destructive" ? "btn-destructive" : "btn-primary"
                    }
                  >
                    {confirmLabel}
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
