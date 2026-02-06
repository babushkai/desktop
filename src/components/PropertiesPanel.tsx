import { lazy, Suspense, useCallback, useState, useRef, useEffect } from "react";
import { Dialog } from "@headlessui/react";
import { usePipelineStore, NodeData } from "../stores/pipelineStore";
import {
  RiCodeLine,
  RiDeleteBinLine,
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiFullscreenLine,
  RiCloseLine,
} from "@remixicon/react";
import { defineGithubDarkTheme } from "@/lib/monacoTheme";
import {
  registerPythonCompletions,
  PipelineContext,
} from "@/lib/monacoCompletions";
import { registerLspProviders } from "@/lib/lspClient";
import { providerManager } from "@/lib/completionProviderManager";
import { useLspStore, getDocumentUri } from "@/stores/lspStore";
import { listenToLspRestarted } from "@/lib/tauri";
import type { Monaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";

const Editor = lazy(() => import("@monaco-editor/react"));

function EditorSkeleton() {
  return (
    <div className="flex-1 flex items-center justify-center bg-background">
      <div className="flex items-center gap-2 text-text-muted">
        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Loading editor...</span>
      </div>
    </div>
  );
}

// Hook to get context from connected DataLoader
function useScriptContext(scriptNodeId: string | null): PipelineContext {
  const nodes = usePipelineStore((s) => s.nodes);
  const edges = usePipelineStore((s) => s.edges);
  const dataProfiles = usePipelineStore((s) => s.dataProfiles);

  if (!scriptNodeId) return {};

  const incomingEdge = edges.find((e) => e.target === scriptNodeId);
  const sourceNode = nodes.find((n) => n.id === incomingEdge?.source);

  // Get profile from DataLoader or any profiled source
  const sourceNodeId = sourceNode?.id;
  const profile = sourceNodeId ? dataProfiles[sourceNodeId] : null;
  const filePath = (sourceNode?.data as NodeData)?.filePath;

  return {
    inputFilePath: filePath || profile?.filePath,
    columns: profile?.columns.map((c) => c.name),
    dataTypes: profile?.columns.reduce(
      (acc, c) => {
        acc[c.name] = c.dataType;
        return acc;
      },
      {} as Record<string, string>
    ),
  };
}

// Shared editor options
const editorOptions = {
  minimap: { enabled: false },
  fontSize: 13,
  lineNumbers: "on" as const,
  scrollBeyondLastLine: false,
  automaticLayout: true,
  padding: { top: 8, bottom: 8 },
  wordWrap: "on" as const,
  tabSize: 4,
  insertSpaces: true,
  suggestOnTriggerCharacters: true,
  quickSuggestions: { other: true, comments: false, strings: true },
  acceptSuggestionOnEnter: "on" as const,
  tabCompletion: "on" as const,
  // Enable inline suggestions (ghost text)
  inlineSuggest: {
    enabled: true,
    showToolbar: "onHover" as const,
  },
};

// Context Panel Component
function ContextPanel({
  context,
  expanded,
  onToggle,
}: {
  context: PipelineContext;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasContext = context.inputFilePath || (context.columns?.length ?? 0) > 0;

  if (!hasContext) return null;

  return (
    <div className="border-b border-white/5">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-2 text-xs text-text-muted hover:text-text-primary transition-colors"
      >
        {expanded ? (
          <RiArrowDownSLine className="w-4 h-4" />
        ) : (
          <RiArrowRightSLine className="w-4 h-4" />
        )}
        Context
      </button>
      {expanded && (
        <div className="px-4 pb-3 space-y-2 text-xs">
          {context.inputFilePath && (
            <div>
              <span className="text-text-muted">Input: </span>
              <span className="text-text-secondary font-mono truncate block">
                {context.inputFilePath.split("/").pop()}
              </span>
            </div>
          )}
          {context.columns && context.columns.length > 0 && (
            <div>
              <span className="text-text-muted">Columns: </span>
              <span className="text-text-secondary">
                {context.columns.slice(0, 4).join(", ")}
                {context.columns.length > 4 &&
                  ` (+${context.columns.length - 4})`}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Status Bar Component
function StatusBar({
  cursorPos,
  charCount,
}: {
  cursorPos: { line: number; col: number };
  charCount: number;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 text-xs text-text-muted border-t border-white/5">
      <span>
        Ln {cursorPos.line}, Col {cursorPos.col}
      </span>
      <div className="flex items-center gap-3">
        <span>{charCount} chars</span>
        <span className="text-node-script">Python</span>
      </div>
    </div>
  );
}

// Full Screen Editor Modal
function EditorModal({
  isOpen,
  onClose,
  code,
  onCodeChange,
  context,
}: {
  isOpen: boolean;
  onClose: () => void;
  code: string;
  onCodeChange: (value: string | undefined) => void;
  context: PipelineContext;
}) {
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [charCount, setCharCount] = useState(code.length);
  const [contextExpanded, setContextExpanded] = useState(true);
  const [editorReady, setEditorReady] = useState(false);
  const monacoRef = useRef<Monaco | null>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const lspConnected = useLspStore((s) => s.isConnected);

  const handleEditorMount = useCallback(
    (editorInstance: editor.IStandaloneCodeEditor, monaco: Monaco) => {
      monacoRef.current = monaco;
      editorRef.current = editorInstance;

      // Create model with custom URI for LSP
      const nodeId = usePipelineStore.getState().selectedNodeId;
      if (nodeId) {
        const uri = monaco.Uri.parse(getDocumentUri(nodeId));
        let model = monaco.editor.getModel(uri);

        if (!model) {
          model = monaco.editor.createModel(code, "python", uri);
        }

        editorInstance.setModel(model);
      }

      editorInstance.onDidChangeCursorPosition((e) => {
        setCursorPos({ line: e.position.lineNumber, col: e.position.column });
      });

      setCharCount(editorInstance.getValue().length);
      setEditorReady(true);

      // Focus the editor
      editorInstance.focus();
    },
    [code]
  );

  // Register providers using the provider manager
  useEffect(() => {
    if (!editorReady || !monacoRef.current || !editorRef.current) return;

    const pipelineState = usePipelineStore.getState();
    // Use stable context key without pipelineId - it's fetched at call time
    const contextKey = `modal:${pipelineState.selectedNodeId}`;

    // Register static Python completions
    providerManager.register("static", contextKey, () =>
      registerPythonCompletions(monacoRef.current!, context)
    );

    // Register LSP providers
    if (lspConnected) {
      providerManager.register("lsp", contextKey, () =>
        registerLspProviders(monacoRef.current!, editorRef.current!)
      );
    }

    // Ollama inline completions disabled - too slow and low quality with local models
  }, [editorReady, context.columns, context.inputFilePath, lspConnected]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      setEditorReady(false);
    };
  }, []);

  const handleChange = useCallback(
    (value: string | undefined) => {
      onCodeChange(value);
      setCharCount(value?.length || 0);
    },
    [onCodeChange]
  );

  const handleClear = useCallback(() => {
    onCodeChange("");
    setCharCount(0);
  }, [onCodeChange]);

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60" aria-hidden="true" />

      {/* Modal */}
      <div className="fixed inset-4 flex items-center justify-center">
        <Dialog.Panel className="w-full h-full max-w-6xl max-h-[90vh] flex flex-col bg-background-surface rounded-lg border border-white/10 shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <div className="flex items-center gap-2">
              <RiCodeLine className="w-4 h-4 text-node-script" />
              <Dialog.Title className="text-sm font-medium text-node-script">
                Script Editor
              </Dialog.Title>
            </div>
            <button
              onClick={onClose}
              className="btn-icon-sm"
              title="Close (Esc)"
            >
              <RiCloseLine className="w-5 h-5" />
            </button>
          </div>

          {/* Context Panel */}
          <ContextPanel
            context={context}
            expanded={contextExpanded}
            onToggle={() => setContextExpanded(!contextExpanded)}
          />

          {/* Toolbar */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-white/5">
            <div className="flex-1" />
            <button
              onClick={handleClear}
              className="btn-icon-sm"
              title="Clear Code"
            >
              <RiDeleteBinLine className="w-4 h-4" />
            </button>
          </div>

          {/* Editor */}
          <div className="flex-1 min-h-0">
            <Suspense fallback={<EditorSkeleton />}>
              <Editor
                height="100%"
                language="python"
                theme="github-dark"
                value={code}
                onChange={handleChange}
                onMount={handleEditorMount}
                beforeMount={defineGithubDarkTheme}
                options={{
                  ...editorOptions,
                  minimap: { enabled: true },
                }}
              />
            </Suspense>
          </div>

          {/* Status Bar */}
          <StatusBar cursorPos={cursorPos} charCount={charCount} />
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}

export function PropertiesPanel() {
  const nodes = usePipelineStore((s) => s.nodes);
  const selectedNodeId = usePipelineStore((s) => s.selectedNodeId);
  const updateNodeData = usePipelineStore((s) => s.updateNodeData);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const nodeData = selectedNode?.data as NodeData | undefined;
  const context = useScriptContext(selectedNodeId);

  // Editor state
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [charCount, setCharCount] = useState(0);
  const [contextExpanded, setContextExpanded] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editorReady, setEditorReady] = useState(false);

  // Refs for Monaco instance
  const monacoRef = useRef<Monaco | null>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  // LSP state
  const lspStore = useLspStore();
  const documentVersion = useRef(0);
  const changeDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check pyright on mount
  useEffect(() => {
    console.log("[LSP] PropertiesPanel mount - isPyrightInstalled:", lspStore.isPyrightInstalled);
    if (lspStore.isPyrightInstalled === null) {
      lspStore.checkPyright();
    }
  }, []);

  // Start LSP when Script node selected and pyright is available
  useEffect(() => {
    console.log("[LSP] Start effect - nodeId:", selectedNodeId, "pyright:", lspStore.isPyrightInstalled, "connected:", lspStore.isConnected, "initializing:", lspStore.isInitializing);
    const init = async () => {
      if (selectedNodeId && lspStore.isPyrightInstalled && !lspStore.isConnected && !lspStore.isInitializing) {
        console.log("[LSP] Conditions met - starting LSP server");
        await lspStore.start();
      }
    };
    init();
  }, [selectedNodeId, lspStore.isPyrightInstalled, lspStore.isConnected, lspStore.isInitializing]);

  // Open/close document when node selection changes
  useEffect(() => {
    if (!selectedNodeId || !lspStore.isConnected) return;

    const uri = getDocumentUri(selectedNodeId);
    const code = nodeData?.code || "";
    documentVersion.current++;

    lspStore.openDocument(uri, code, documentVersion.current);

    // Cleanup: close document on deselect
    return () => {
      lspStore.closeDocument(uri);
    };
  }, [selectedNodeId, lspStore.isConnected]);

  // Listen for LSP restart events
  useEffect(() => {
    const setupListener = async () => {
      const unlisten = await listenToLspRestarted(() => {
        // Re-send didOpen for current document
        if (selectedNodeId && lspStore.isConnected) {
          const uri = getDocumentUri(selectedNodeId);
          documentVersion.current++;
          lspStore.openDocument(uri, nodeData?.code || "", documentVersion.current);
        }
      });
      return unlisten;
    };

    const promise = setupListener();
    return () => {
      promise.then((unlisten) => unlisten());
    };
  }, [selectedNodeId, nodeData?.code, lspStore.isConnected]);

  const handleCodeChange = useCallback(
    (value: string | undefined) => {
      if (selectedNodeId) {
        updateNodeData(selectedNodeId, { code: value || "" });
        setCharCount(value?.length || 0);

        // Debounce LSP notification
        if (changeDebounceTimer.current) {
          clearTimeout(changeDebounceTimer.current);
        }

        changeDebounceTimer.current = setTimeout(() => {
          documentVersion.current++;
          const uri = getDocumentUri(selectedNodeId);
          useLspStore.getState().changeDocument(uri, value || "", documentVersion.current);
        }, 400); // 400ms debounce
      }
    },
    [selectedNodeId, updateNodeData]
  );

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (changeDebounceTimer.current) {
        clearTimeout(changeDebounceTimer.current);
      }
    };
  }, []);

  const handleEditorMount = useCallback(
    (editorInstance: editor.IStandaloneCodeEditor, monaco: Monaco) => {
      monacoRef.current = monaco;
      editorRef.current = editorInstance;

      // Create model with custom URI for LSP
      const nodeId = usePipelineStore.getState().selectedNodeId;
      if (nodeId) {
        const uri = monaco.Uri.parse(getDocumentUri(nodeId));
        let model = monaco.editor.getModel(uri);

        if (!model) {
          const nodeData = usePipelineStore.getState().nodes.find(n => n.id === nodeId)?.data as NodeData | undefined;
          model = monaco.editor.createModel(
            nodeData?.code || "",
            "python",
            uri
          );
        }

        editorInstance.setModel(model);
      }

      editorInstance.onDidChangeCursorPosition((e) => {
        setCursorPos({ line: e.position.lineNumber, col: e.position.column });
      });

      setCharCount(editorInstance.getValue().length);

      // Signal that editor is ready - this triggers useEffect to register providers
      setEditorReady(true);
    },
    []
  );

  // Register providers using the provider manager
  useEffect(() => {
    // Wait for editor to be ready
    if (!editorReady || !monacoRef.current || !editorRef.current) return;

    // Context key only includes node ID - pipelineId is fetched at call time from store
    const contextKey = `panel:${selectedNodeId}`;

    // Register static Python completions
    providerManager.register("static", contextKey, () =>
      registerPythonCompletions(monacoRef.current!, context)
    );

    // Register LSP providers
    if (lspStore.isConnected) {
      providerManager.register("lsp", contextKey, () =>
        registerLspProviders(monacoRef.current!, editorRef.current!)
      );
    }

    // Ollama inline completions disabled - too slow and low quality with local models
    // To re-enable in future with better models, uncomment below:
    // if (ollamaAvailable) {
    //   providerManager.register("ollama", contextKey, () =>
    //     registerOllamaInlineCompletions(monacoRef.current!, editorRef.current!, {
    //       columns: context.columns || [],
    //       pipelineId: undefined,
    //       currentNodeId: selectedNodeId ?? undefined,
    //     })
    //   );
    // }
  }, [editorReady, context.columns, context.inputFilePath, lspStore.isConnected, selectedNodeId]);

  // Cleanup on unmount or when node changes
  useEffect(() => {
    return () => {
      providerManager.dispose();
      setEditorReady(false);
    };
  }, [selectedNodeId]);

  const handleClear = useCallback(() => {
    if (selectedNodeId) {
      updateNodeData(selectedNodeId, { code: "" });
      setCharCount(0);
    }
  }, [selectedNodeId, updateNodeData]);

  if (!selectedNode || selectedNode.type !== "script") {
    return null;
  }

  return (
    <>
      <div className="w-96 flex flex-col panel-sidebar-right border-l border-white/5 animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <RiCodeLine className="w-4 h-4 text-node-script" />
            <span className="text-sm font-medium text-node-script">
              Script Editor
            </span>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="btn-icon-sm"
            title="Expand Editor"
          >
            <RiFullscreenLine className="w-4 h-4" />
          </button>
        </div>

        {/* Context Panel */}
        <ContextPanel
          context={context}
          expanded={contextExpanded}
          onToggle={() => setContextExpanded(!contextExpanded)}
        />

        {/* Toolbar */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-white/5">
          <div className="flex-1" />
          <button
            onClick={handleClear}
            className="btn-icon-sm"
            title="Clear Code"
          >
            <RiDeleteBinLine className="w-4 h-4" />
          </button>
        </div>

        {/* Editor */}
        <div className="flex-1 min-h-0">
          <Suspense fallback={<EditorSkeleton />}>
            <Editor
              height="100%"
              language="python"
              theme="github-dark"
              value={nodeData?.code || ""}
              onChange={handleCodeChange}
              onMount={handleEditorMount}
              beforeMount={defineGithubDarkTheme}
              options={editorOptions}
            />
          </Suspense>
        </div>

        {/* Status Bar */}
        <StatusBar cursorPos={cursorPos} charCount={charCount} />
      </div>

      {/* Full Screen Modal */}
      <EditorModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        code={nodeData?.code || ""}
        onCodeChange={handleCodeChange}
        context={context}
      />
    </>
  );
}
