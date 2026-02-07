import { create } from "zustand";
import {
  checkPyright,
  startLspServer,
  stopLspServer,
  lspRequest,
  lspNotify,
  getLspStatus,
  listenToLspDiagnostics,
  listenToLspRestarted,
  listenToLspFailed,
  LspDiagnostic,
  LspHoverResult,
  LspCompletionList,
  LspLocation,
} from "@/lib/tauri";

// Virtual document URI scheme
export function getDocumentUri(nodeId: string): string {
  return `inmemory://script/${nodeId}`;
}

interface LspState {
  // Pyright status
  isPyrightInstalled: boolean | null; // null = checking
  pyrightVersion: string | null;

  // Connection status
  isConnected: boolean;
  isInitializing: boolean;
  restartCount: number;
  error: string | null;

  // Diagnostics per document
  diagnostics: Map<string, LspDiagnostic[]>; // uri -> diagnostics

  // Open documents tracking
  openDocuments: Set<string>; // Set of URIs

  // Actions
  checkPyright: () => Promise<void>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  clearError: () => void;

  // Document lifecycle
  openDocument: (uri: string, content: string, version: number) => Promise<void>;
  changeDocument: (uri: string, content: string, version: number) => Promise<void>;
  closeDocument: (uri: string) => Promise<void>;

  // LSP requests
  hover: (
    uri: string,
    line: number,
    character: number
  ) => Promise<LspHoverResult | null>;
  completion: (
    uri: string,
    line: number,
    character: number
  ) => Promise<LspCompletionList | null>;
  definition: (
    uri: string,
    line: number,
    character: number
  ) => Promise<LspLocation[] | null>;
}

// Initialize diagnostics listener
let diagnosticsListenerInitialized = false;
let restartedListenerInitialized = false;
let failedListenerInitialized = false;

export const useLspStore = create<LspState>((set, get) => ({
  isPyrightInstalled: null,
  pyrightVersion: null,
  isConnected: false,
  isInitializing: false,
  restartCount: 0,
  error: null,
  diagnostics: new Map(),
  openDocuments: new Set(),

  checkPyright: async () => {
    console.log("[LSP] Checking pyright installation...");
    try {
      const info = await checkPyright();
      console.log("[LSP] Pyright check result:", info);
      set({
        isPyrightInstalled: info.installed,
        pyrightVersion: info.version,
      });
    } catch (e) {
      console.error("[LSP] Pyright check failed:", e);
      set({
        isPyrightInstalled: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  start: async () => {
    const { isConnected, isInitializing } = get();
    if (isConnected || isInitializing) {
      console.log("[LSP] Start skipped - already connected or initializing");
      return;
    }

    console.log("[LSP] Starting LSP server...");
    set({ isInitializing: true, error: null });

    try {
      await startLspServer();
      console.log("[LSP] LSP server started");

      // Initialize listeners if not already done
      if (!diagnosticsListenerInitialized) {
        diagnosticsListenerInitialized = true;
        console.log("[LSP] Setting up diagnostics listener");
        listenToLspDiagnostics((params) => {
          console.log("[LSP] Received diagnostics for", params.uri, ":", params.diagnostics.length, "items");
          set((state) => ({
            diagnostics: new Map(state.diagnostics).set(params.uri, params.diagnostics),
          }));
        });
      }

      if (!restartedListenerInitialized) {
        restartedListenerInitialized = true;
        listenToLspRestarted(() => {
          console.log("[LSP] Server restarted");
          set({ diagnostics: new Map(), openDocuments: new Set() });
        });
      }

      if (!failedListenerInitialized) {
        failedListenerInitialized = true;
        listenToLspFailed((message) => {
          console.error("[LSP] Server failed:", message);
          set({ isConnected: false, error: message });
        });
      }

      const status = await getLspStatus();
      console.log("[LSP] Server status:", status);
      set({
        isConnected: status.running && status.initialized,
        isInitializing: false,
        restartCount: status.restart_count,
      });
    } catch (e) {
      console.error("[LSP] Start failed:", e);
      set({
        isConnected: false,
        isInitializing: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  stop: async () => {
    try {
      await stopLspServer();
      set({
        isConnected: false,
        diagnostics: new Map(),
        openDocuments: new Set(),
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  clearError: () => set({ error: null }),

  openDocument: async (uri: string, content: string, version: number) => {
    const { isConnected, openDocuments } = get();
    if (!isConnected) {
      console.log("[LSP] openDocument skipped - not connected");
      return;
    }

    // Don't re-open already open documents
    if (openDocuments.has(uri)) {
      console.log("[LSP] openDocument skipped - already open:", uri);
      return;
    }

    console.log("[LSP] Opening document:", uri, "version:", version);
    try {
      await lspNotify("textDocument/didOpen", {
        textDocument: {
          uri,
          languageId: "python",
          version,
          text: content,
        },
      });

      set({ openDocuments: new Set([...openDocuments, uri]) });
      console.log("[LSP] Document opened successfully");
    } catch (e) {
      console.error("[LSP] Failed to open document:", e);
    }
  },

  changeDocument: async (uri: string, content: string, version: number) => {
    const { isConnected, openDocuments } = get();
    if (!isConnected || !openDocuments.has(uri)) return;

    try {
      // Full document sync (simpler than incremental)
      await lspNotify("textDocument/didChange", {
        textDocument: { uri, version },
        contentChanges: [{ text: content }],
      });
    } catch (e) {
      console.error("[LSP] Failed to change document:", e);
    }
  },

  closeDocument: async (uri: string) => {
    const { isConnected, openDocuments } = get();
    if (!isConnected) return;

    try {
      await lspNotify("textDocument/didClose", {
        textDocument: { uri },
      });

      const newOpenDocs = new Set(openDocuments);
      newOpenDocs.delete(uri);

      // Clear diagnostics for closed document
      const newDiagnostics = new Map(get().diagnostics);
      newDiagnostics.delete(uri);

      set({ openDocuments: newOpenDocs, diagnostics: newDiagnostics });
    } catch (e) {
      console.error("[LSP] Failed to close document:", e);
    }
  },

  hover: async (
    uri: string,
    line: number,
    character: number
  ): Promise<LspHoverResult | null> => {
    const { isConnected } = get();
    if (!isConnected) return null;

    try {
      const result = await lspRequest<LspHoverResult | null>(
        "textDocument/hover",
        {
          textDocument: { uri },
          position: { line, character },
        }
      );
      return result;
    } catch (e) {
      console.error("[LSP] Hover request failed:", e);
      return null;
    }
  },

  completion: async (
    uri: string,
    line: number,
    character: number
  ): Promise<LspCompletionList | null> => {
    const { isConnected } = get();
    if (!isConnected) return null;

    try {
      const result = await lspRequest<LspCompletionList | null>(
        "textDocument/completion",
        {
          textDocument: { uri },
          position: { line, character },
        }
      );
      return result;
    } catch (e) {
      console.error("[LSP] Completion request failed:", e);
      return null;
    }
  },

  definition: async (
    uri: string,
    line: number,
    character: number
  ): Promise<LspLocation[] | null> => {
    const { isConnected } = get();
    if (!isConnected) return null;

    try {
      const result = await lspRequest<LspLocation | LspLocation[] | null>(
        "textDocument/definition",
        {
          textDocument: { uri },
          position: { line, character },
        }
      );

      if (!result) return null;
      return Array.isArray(result) ? result : [result];
    } catch (e) {
      console.error("[LSP] Definition request failed:", e);
      return null;
    }
  },
}));
