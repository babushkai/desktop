/**
 * Singleton manager for Monaco completion providers.
 *
 * Prevents duplicate provider registration when context changes
 * (node selection, pipeline change, Ollama/LSP availability).
 *
 * Uses a generation counter to handle race conditions when users
 * rapidly switch between nodes (A → B → A in 100ms).
 *
 * Manages three provider types:
 * - static: Python completions (pandas, numpy, etc.)
 * - lsp: Pyright language server completions
 * - ollama: AI-powered inline completions with RAG
 */

import type { IDisposable } from "monaco-editor";

type ProviderKey = "static" | "lsp" | "ollama";

class CompletionProviderManager {
  private static instance: CompletionProviderManager | null = null;
  private generation = 0;
  private disposables: Map<ProviderKey, IDisposable> = new Map();
  private contextKeys: Map<ProviderKey, string> = new Map();

  private constructor() {
    // Private constructor for singleton
  }

  static getInstance(): CompletionProviderManager {
    if (!this.instance) {
      this.instance = new CompletionProviderManager();
    }
    return this.instance;
  }

  /**
   * Register a completion provider.
   *
   * @param key - Provider type (static, lsp, ollama)
   * @param contextKey - Unique key for current context (e.g., nodeId:pipelineId)
   * @param factory - Function that creates and returns the disposable provider
   *
   * If the provider is already registered for the same context, this is a no-op.
   * If context changed, disposes the old provider and registers a new one.
   *
   * Uses a generation counter to prevent race conditions during rapid context
   * switches. If another registration starts while factory() is executing,
   * the stale registration is discarded.
   */
  register(
    key: ProviderKey,
    contextKey: string,
    factory: () => IDisposable
  ): void {
    // Increment generation for this registration attempt
    const myGeneration = ++this.generation;

    // Skip if already registered for same context
    if (this.contextKeys.get(key) === contextKey && this.disposables.has(key)) {
      console.log(
        `[ProviderManager] Skipping ${key} - already registered for context ${contextKey}`
      );
      return;
    }

    // Dispose previous
    const existing = this.disposables.get(key);
    if (existing) {
      console.log(`[ProviderManager] Disposing previous ${key} provider`);
      existing.dispose();
    }
    this.disposables.delete(key);
    this.contextKeys.delete(key);

    // Create new provider
    console.log(`[ProviderManager] Registering ${key} provider for context ${contextKey}`);
    const disposable = factory();

    // Verify we're still the active registration (handles A→B→A race)
    if (this.generation !== myGeneration) {
      console.log(`[ProviderManager] Discarding stale ${key} registration (generation ${myGeneration} vs ${this.generation})`);
      disposable.dispose();
      return;
    }

    this.disposables.set(key, disposable);
    this.contextKeys.set(key, contextKey);
  }

  /**
   * Unregister a specific provider type.
   */
  unregister(key: ProviderKey): void {
    const existing = this.disposables.get(key);
    if (existing) {
      console.log(`[ProviderManager] Unregistering ${key} provider`);
      existing.dispose();
      this.disposables.delete(key);
      this.contextKeys.delete(key);
    }
  }

  /**
   * Check if a provider is registered for a specific context.
   */
  isRegistered(key: ProviderKey, contextKey?: string): boolean {
    if (!this.disposables.has(key)) return false;
    if (contextKey === undefined) return true;
    return this.contextKeys.get(key) === contextKey;
  }

  /**
   * Get the current context key for a provider.
   */
  getContextKey(key: ProviderKey): string | undefined {
    return this.contextKeys.get(key);
  }

  /**
   * Dispose all providers. Call on component unmount or when
   * completely switching away from editor context.
   */
  dispose(): void {
    console.log("[ProviderManager] Disposing all providers");
    for (const [key, disposable] of this.disposables.entries()) {
      console.log(`[ProviderManager] Disposing ${key}`);
      disposable.dispose();
    }
    this.disposables.clear();
    this.contextKeys.clear();
  }

  /**
   * Reset the singleton instance. Useful for testing.
   */
  static reset(): void {
    if (this.instance) {
      this.instance.dispose();
      this.instance = null;
    }
  }
}

export const providerManager = CompletionProviderManager.getInstance();
export type { ProviderKey };
