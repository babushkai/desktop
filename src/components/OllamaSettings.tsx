import { useState, useEffect, Fragment } from "react";
import { Dialog, Transition, Listbox } from "@headlessui/react";
import {
  RiSettings4Line,
  RiRefreshLine,
  RiCloseLine,
  RiArrowDownSLine,
  RiCheckLine,
} from "@remixicon/react";
import { useOllamaStore } from "@/stores/ollamaStore";
import { cn } from "@/lib/utils";

interface OllamaSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function OllamaSettings({ isOpen, onClose }: OllamaSettingsProps) {
  const {
    host,
    models,
    selectedModel,
    isAvailable,
    isChecking,
    error,
    setHost,
    setSelectedModel,
    checkStatus,
    clearError,
  } = useOllamaStore();

  const [hostInput, setHostInput] = useState(host);

  // Sync hostInput with store when dialog opens
  useEffect(() => {
    if (isOpen) {
      setHostInput(host);
    }
  }, [isOpen, host]);

  const handleSaveHost = () => {
    if (hostInput.trim() && hostInput !== host) {
      setHost(hostInput.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveHost();
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
              <Dialog.Panel className="w-full max-w-md rounded-xl bg-background-surface border border-white/10 shadow-xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                  <Dialog.Title className="text-sm font-medium text-text-primary flex items-center gap-2">
                    <RiSettings4Line className="w-4 h-4" />
                    Ollama Settings
                  </Dialog.Title>
                  <button onClick={onClose} className="btn-icon-sm">
                    <RiCloseLine className="w-5 h-5" />
                  </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
                  {/* Status */}
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "w-2 h-2 rounded-full",
                        isAvailable ? "bg-state-success" : "bg-state-error"
                      )}
                    />
                    <span className="text-sm text-text-secondary">
                      {isChecking
                        ? "Checking..."
                        : isAvailable
                          ? "Connected"
                          : "Not connected"}
                    </span>
                    <button
                      onClick={checkStatus}
                      className="btn-icon-sm ml-auto"
                      disabled={isChecking}
                      title="Refresh status"
                    >
                      <RiRefreshLine
                        className={cn("w-4 h-4", isChecking && "animate-spin")}
                      />
                    </button>
                  </div>

                  {/* Error */}
                  {error && (
                    <div className="p-2 bg-state-error/10 border border-state-error/30 rounded text-xs text-state-error flex items-start justify-between gap-2">
                      <span>{error}</span>
                      <button
                        onClick={clearError}
                        className="text-state-error hover:text-state-error/80 underline flex-shrink-0"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}

                  {/* Host URL */}
                  <div>
                    <label className="block text-xs text-text-muted mb-1.5">
                      Host URL
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={hostInput}
                        onChange={(e) => setHostInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={handleSaveHost}
                        className="input flex-1"
                        placeholder="http://localhost:11434"
                      />
                    </div>
                  </div>

                  {/* Model Selection */}
                  <div>
                    <label className="block text-xs text-text-muted mb-1.5">
                      Model
                    </label>
                    {models.length === 0 ? (
                      <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-400">
                        <p className="font-medium mb-1">No models found</p>
                        <p className="text-amber-400/80">
                          Install a code model with:
                        </p>
                        <code className="block mt-1 px-2 py-1 bg-black/20 rounded font-mono">
                          ollama pull deepseek-coder:6.7b
                        </code>
                      </div>
                    ) : (
                      <>
                        <Listbox value={selectedModel} onChange={setSelectedModel}>
                          <div className="relative">
                            <Listbox.Button className="input w-full text-left flex items-center justify-between">
                              <span
                                className={cn(
                                  "truncate",
                                  !selectedModel && "text-text-muted"
                                )}
                              >
                                {selectedModel || "Select a model..."}
                              </span>
                              <RiArrowDownSLine className="w-4 h-4 text-text-muted flex-shrink-0" />
                            </Listbox.Button>
                            <Transition
                              as={Fragment}
                              leave="transition ease-in duration-100"
                              leaveFrom="opacity-100"
                              leaveTo="opacity-0"
                            >
                              <Listbox.Options className="absolute z-10 mt-1 w-full max-h-60 overflow-auto rounded-lg bg-background-surface border border-white/10 shadow-lg focus:outline-none">
                                {models.map((model) => {
                                  const isCodeModel = /code|deepseek|starcoder|wizard|qwen.*coder|codellama/i.test(model);
                                  return (
                                    <Listbox.Option
                                      key={model}
                                      value={model}
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
                                              "truncate",
                                              selected
                                                ? "font-medium text-text-primary"
                                                : "text-text-secondary"
                                            )}
                                          >
                                            {model}
                                            {isCodeModel && (
                                              <span className="ml-1.5 text-xs text-state-success">
                                                (code)
                                              </span>
                                            )}
                                          </span>
                                          {selected && (
                                            <RiCheckLine className="w-4 h-4 text-accent" />
                                          )}
                                        </div>
                                      )}
                                    </Listbox.Option>
                                  );
                                })}
                              </Listbox.Options>
                            </Transition>
                          </div>
                        </Listbox>
                        {selectedModel && !/code|deepseek|starcoder|wizard|qwen.*coder|codellama/i.test(selectedModel) && (
                          <p className="mt-1.5 text-xs text-amber-400/80">
                            Tip: Code models like <span className="font-mono">deepseek-coder</span> or <span className="font-mono">qwen2.5-coder</span> work best
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  {/* Help */}
                  <div className="pt-2 border-t border-white/5 text-xs text-text-muted space-y-1.5">
                    <p>
                      Ghost text suggestions appear as you type in the Script
                      editor.
                    </p>
                    <div className="flex gap-4">
                      <span>
                        <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-text-secondary">
                          Tab
                        </kbd>{" "}
                        Accept
                      </span>
                      <span>
                        <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-text-secondary">
                          Esc
                        </kbd>{" "}
                        Dismiss
                      </span>
                      <span>
                        <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-text-secondary">
                          Ctrl+Space
                        </kbd>{" "}
                        Trigger
                      </span>
                    </div>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
