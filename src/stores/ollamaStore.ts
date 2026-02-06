import { create } from "zustand";
import {
  checkOllama,
  listOllamaModels,
  generateCompletion,
  cancelCompletion,
} from "@/lib/tauri";

// Local storage keys
const OLLAMA_HOST_KEY = "ollama_host";
const OLLAMA_MODEL_KEY = "ollama_model";

interface OllamaState {
  // Connection
  host: string;
  isAvailable: boolean;
  isChecking: boolean;

  // Models
  models: string[];
  selectedModel: string | null;

  // Generation
  isGenerating: boolean;
  currentRequestId: string | null;
  error: string | null;

  // Actions
  checkStatus: () => Promise<void>;
  loadModels: () => Promise<void>;
  setHost: (host: string) => void;
  setSelectedModel: (model: string) => void;
  generate: (
    context: string,
    cursorLine: string,
    columns: string[]
  ) => Promise<string>;
  cancel: () => void;
  clearError: () => void;
}

// Load persisted settings
const loadPersistedHost = (): string => {
  try {
    return localStorage.getItem(OLLAMA_HOST_KEY) || "http://localhost:11434";
  } catch {
    return "http://localhost:11434";
  }
};

const loadPersistedModel = (): string | null => {
  try {
    return localStorage.getItem(OLLAMA_MODEL_KEY);
  } catch {
    return null;
  }
};

export const useOllamaStore = create<OllamaState>((set, get) => ({
  host: loadPersistedHost(),
  isAvailable: false,
  isChecking: false,
  models: [],
  selectedModel: loadPersistedModel(),
  isGenerating: false,
  currentRequestId: null,
  error: null,

  checkStatus: async () => {
    set({ isChecking: true, error: null });
    try {
      const { host } = get();
      const available = await checkOllama(host);
      set({ isAvailable: available });
      if (available) {
        await get().loadModels();
      }
    } catch (e) {
      set({
        isAvailable: false,
        error: e instanceof Error ? e.message : "Connection failed",
      });
    } finally {
      set({ isChecking: false });
    }
  },

  loadModels: async () => {
    try {
      const { host, selectedModel } = get();
      const models = await listOllamaModels(host);

      // Prefer code models
      const codeModels = models.filter((m) =>
        /code|deepseek|starcoder|wizard|qwen.*coder/i.test(m)
      );

      // Use saved preference if still available, otherwise pick a code model
      const savedModel = loadPersistedModel();
      const defaultModel =
        savedModel && models.includes(savedModel)
          ? savedModel
          : codeModels[0] || models[0] || null;

      set({
        models,
        selectedModel: selectedModel && models.includes(selectedModel)
          ? selectedModel
          : defaultModel,
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to load models" });
    }
  },

  setHost: (host: string) => {
    set({ host });
    try {
      localStorage.setItem(OLLAMA_HOST_KEY, host);
    } catch {
      // Ignore localStorage errors
    }
    // Re-check status with new host
    get().checkStatus();
  },

  setSelectedModel: (model: string) => {
    set({ selectedModel: model });
    try {
      localStorage.setItem(OLLAMA_MODEL_KEY, model);
    } catch {
      // Ignore localStorage errors
    }
  },

  generate: async (
    context: string,
    cursorLine: string,
    columns: string[]
  ): Promise<string> => {
    const { host, selectedModel } = get();
    if (!selectedModel) {
      throw new Error("No model selected");
    }

    const requestId = crypto.randomUUID();
    set({ isGenerating: true, currentRequestId: requestId, error: null });

    try {
      const result = await generateCompletion(
        requestId,
        host,
        selectedModel,
        context,
        cursorLine,
        columns
      );
      return result;
    } catch (e) {
      // Tauri errors come as strings, not Error objects
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error("[Ollama] Generation error:", e);
      // Don't set error for cancellation
      if (errorMessage !== "cancelled") {
        set({ error: errorMessage });
      }
      throw e;
    } finally {
      set({ isGenerating: false, currentRequestId: null });
    }
  },

  cancel: () => {
    const { currentRequestId } = get();
    if (currentRequestId) {
      cancelCompletion(currentRequestId);
      set({ isGenerating: false, currentRequestId: null });
    }
  },

  clearError: () => set({ error: null }),
}));
