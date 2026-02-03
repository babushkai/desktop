import { Fragment, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { RiCloseLine, RiAlertLine, RiAddLine, RiDeleteBinLine } from "@remixicon/react";
import { cn } from "@/lib/utils";
import { HttpServerConfig } from "@/lib/tauri";

interface ServerConfigDialogProps {
  open: boolean;
  onClose: () => void;
  config: Partial<HttpServerConfig>;
  onConfigChange: (config: Partial<HttpServerConfig>) => void;
  onnxAvailable: boolean;
}

function validatePort(port: number): string | null {
  if (!Number.isInteger(port)) return "Port must be an integer";
  if (port < 1 || port > 65535) return "Port must be between 1 and 65535";
  if (port < 1024) return "Ports below 1024 require admin privileges";
  return null;
}

function validateOrigin(origin: string): string | null {
  if (!origin) return "Origin cannot be empty";
  try {
    const url = new URL(origin);
    if (!["http:", "https:"].includes(url.protocol)) {
      return "Origin must start with http:// or https://";
    }
    return null;
  } catch {
    return "Invalid URL format";
  }
}

export function ServerConfigDialog({
  open,
  onClose,
  config,
  onConfigChange,
  onnxAvailable: _onnxAvailable,
}: ServerConfigDialogProps) {
  const [localConfig, setLocalConfig] = useState<Partial<HttpServerConfig>>(config);
  const [portError, setPortError] = useState<string | null>(null);
  const [showNetworkWarning, setShowNetworkWarning] = useState(false);
  const [corsEnabled, setCorsEnabled] = useState(
    (config.cors_origins?.length ?? 0) > 0
  );
  const [corsAllowAll, setCorsAllowAll] = useState(
    config.cors_origins?.includes("*") ?? false
  );
  const [corsOrigins, setCorsOrigins] = useState<string[]>(
    config.cors_origins?.filter((o) => o !== "*") ?? []
  );
  const [newOrigin, setNewOrigin] = useState("");
  const [originError, setOriginError] = useState<string | null>(null);

  const handleHostChange = (host: string) => {
    setLocalConfig((prev) => ({ ...prev, host }));
    // Show warning if changing to network-accessible address
    if (host === "0.0.0.0" && config.host !== "0.0.0.0") {
      setShowNetworkWarning(true);
    }
  };

  const handlePortChange = (portStr: string) => {
    const port = parseInt(portStr, 10);
    if (isNaN(port)) {
      setPortError("Port must be a number");
      return;
    }
    const error = validatePort(port);
    setPortError(error);
    if (!error) {
      setLocalConfig((prev) => ({ ...prev, port }));
    }
  };

  const handleAddOrigin = () => {
    const error = validateOrigin(newOrigin);
    if (error) {
      setOriginError(error);
      return;
    }
    setOriginError(null);
    setCorsOrigins((prev) => [...prev, newOrigin]);
    setNewOrigin("");
  };

  const handleRemoveOrigin = (index: number) => {
    setCorsOrigins((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    let cors_origins: string[] | undefined;
    if (corsEnabled) {
      if (corsAllowAll) {
        cors_origins = ["*"];
      } else if (corsOrigins.length > 0) {
        cors_origins = corsOrigins;
      }
    }

    onConfigChange({
      ...localConfig,
      cors_origins,
    });
    onClose();
  };

  const handleNetworkWarningConfirm = () => {
    setShowNetworkWarning(false);
  };

  const handleNetworkWarningCancel = () => {
    setShowNetworkWarning(false);
    setLocalConfig((prev) => ({ ...prev, host: "127.0.0.1" }));
  };

  return (
    <>
      <Transition appear show={open} as={Fragment}>
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
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
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
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-xl bg-background-elevated border border-white/10 shadow-xl transition-all">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                    <Dialog.Title className="text-sm font-medium text-text-primary">
                      Server Configuration
                    </Dialog.Title>
                    <button
                      onClick={onClose}
                      className="p-1 rounded hover:bg-white/10 text-text-muted hover:text-text-primary transition-colors"
                    >
                      <RiCloseLine className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="p-4 space-y-4">
                    {/* Host/Port */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-text-muted mb-1">
                          Host
                        </label>
                        <select
                          value={localConfig.host ?? "127.0.0.1"}
                          onChange={(e) => handleHostChange(e.target.value)}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-white/10 bg-background hover:border-white/20 focus:border-accent focus:outline-none"
                        >
                          <option value="127.0.0.1">
                            127.0.0.1 (localhost only)
                          </option>
                          <option value="0.0.0.0">
                            0.0.0.0 (all interfaces)
                          </option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-text-muted mb-1">
                          Port
                        </label>
                        <input
                          type="number"
                          value={localConfig.port ?? 8080}
                          onChange={(e) => handlePortChange(e.target.value)}
                          className={cn(
                            "w-full px-3 py-2 text-sm rounded-lg border bg-background focus:outline-none",
                            portError
                              ? "border-state-error focus:border-state-error"
                              : "border-white/10 hover:border-white/20 focus:border-accent"
                          )}
                        />
                        {portError && (
                          <p className="text-xs text-state-error mt-1">
                            {portError}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* CORS Settings */}
                    <div className="space-y-3">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={corsEnabled}
                          onChange={(e) => setCorsEnabled(e.target.checked)}
                          className="rounded border-white/20"
                        />
                        <span className="text-sm text-text-secondary">
                          Enable Cross-Origin Requests (CORS)
                        </span>
                      </label>

                      {corsEnabled && (
                        <div className="ml-6 space-y-3">
                          <label className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="cors-mode"
                              checked={!corsAllowAll}
                              onChange={() => setCorsAllowAll(false)}
                              className="rounded-full border-white/20"
                            />
                            <span className="text-sm text-text-secondary">
                              Allow specific origins
                            </span>
                          </label>

                          {!corsAllowAll && (
                            <div className="ml-6 space-y-2">
                              {corsOrigins.map((origin, i) => (
                                <div
                                  key={i}
                                  className="flex items-center gap-2"
                                >
                                  <code className="flex-1 px-2 py-1 bg-background rounded text-xs truncate">
                                    {origin}
                                  </code>
                                  <button
                                    onClick={() => handleRemoveOrigin(i)}
                                    className="p-1 rounded hover:bg-state-error/20 text-state-error"
                                  >
                                    <RiDeleteBinLine className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={newOrigin}
                                  onChange={(e) => {
                                    setNewOrigin(e.target.value);
                                    setOriginError(null);
                                  }}
                                  placeholder="http://localhost:3000"
                                  className="flex-1 px-2 py-1 text-xs rounded border border-white/10 bg-background focus:border-accent focus:outline-none"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      handleAddOrigin();
                                    }
                                  }}
                                />
                                <button
                                  onClick={handleAddOrigin}
                                  className="p-1 rounded hover:bg-accent/20 text-accent"
                                >
                                  <RiAddLine className="w-4 h-4" />
                                </button>
                              </div>
                              {originError && (
                                <p className="text-xs text-state-error">
                                  {originError}
                                </p>
                              )}
                            </div>
                          )}

                          <label className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="cors-mode"
                              checked={corsAllowAll}
                              onChange={() => setCorsAllowAll(true)}
                              className="rounded-full border-white/20"
                            />
                            <span className="text-sm text-text-secondary">
                              Allow all origins
                            </span>
                          </label>

                          {corsAllowAll && (
                            <div className="ml-6 bg-state-warning/10 border border-state-warning/30 rounded p-2">
                              <p className="text-xs text-state-warning">
                                Any website can access your model predictions.
                                Only use for testing.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="bg-background rounded-lg p-3 text-xs text-text-muted">
                      <p>
                        <strong>Note:</strong> This server is for local
                        development only. It has no authentication and should
                        not be exposed to untrusted networks.
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 px-4 py-3 border-t border-white/10">
                    <button onClick={onClose} className="btn-ghost h-8 px-3">
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={!!portError}
                      className={cn(
                        "btn-primary h-8 px-3",
                        portError && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      Save
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* Network Warning Dialog */}
      <Transition appear show={showNetworkWarning} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-50"
          onClose={handleNetworkWarningCancel}
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
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
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
                <Dialog.Panel className="w-full max-w-sm transform overflow-hidden rounded-xl bg-background-elevated border border-state-warning/30 shadow-xl transition-all">
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-state-warning/20 flex items-center justify-center shrink-0">
                        <RiAlertLine className="w-5 h-5 text-state-warning" />
                      </div>
                      <div>
                        <Dialog.Title className="text-sm font-medium text-text-primary">
                          Security Warning
                        </Dialog.Title>
                        <p className="text-xs text-text-secondary mt-1">
                          Binding to 0.0.0.0 exposes this server to your
                          network. This server has:
                        </p>
                        <ul className="text-xs text-text-secondary mt-2 space-y-1 list-disc list-inside">
                          <li>No authentication</li>
                          <li>No encryption (HTTP only)</li>
                          <li>Limited rate limiting</li>
                        </ul>
                        <p className="text-xs text-text-secondary mt-2">
                          Only proceed if you trust your network.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 px-4 py-3 border-t border-white/10">
                    <button
                      onClick={handleNetworkWarningCancel}
                      className="btn-ghost h-8 px-3"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleNetworkWarningConfirm}
                      className="btn-primary h-8 px-3 bg-state-warning text-black hover:bg-state-warning/90"
                    >
                      I Understand, Proceed
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
