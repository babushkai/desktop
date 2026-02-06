// Monaco InlineCompletionsProvider for Ollama LLM-powered code suggestions
// Provides ghost text previews with Tab to accept, Esc to dismiss

import type { Monaco } from "@monaco-editor/react";
import type {
  IDisposable,
  languages,
  editor,
  CancellationToken,
} from "monaco-editor";
import { useOllamaStore } from "@/stores/ollamaStore";

export interface OllamaContext {
  columns: string[];
}

// Debounce delay for automatic suggestions (user stops typing)
const DEBOUNCE_DELAY = 800; // 800ms - faster than before

// Minimum characters on line before triggering suggestions
const MIN_CHARS_FOR_SUGGESTION = 3;

export function registerOllamaInlineCompletions(
  monaco: Monaco,
  editorInstance: editor.IStandaloneCodeEditor,
  context: OllamaContext
): IDisposable {
  console.log("[Ollama] Registering inline completions provider", { columns: context.columns });

  // Debounce state
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingResolve: ((value: languages.InlineCompletions) => void) | null =
    null;

  const provider: languages.InlineCompletionsProvider = {
    provideInlineCompletions: async (
      model: editor.ITextModel,
      position: typeof monaco.Position.prototype,
      triggerContext: languages.InlineCompletionContext,
      token: CancellationToken
    ): Promise<languages.InlineCompletions> => {
      const store = useOllamaStore.getState();

      console.log("[Ollama] provideInlineCompletions called", {
        isAvailable: store.isAvailable,
        selectedModel: store.selectedModel,
        isGenerating: store.isGenerating,
        triggerKind: triggerContext.triggerKind,
      });

      // Skip if not available or no model
      if (!store.isAvailable || !store.selectedModel) {
        console.log("[Ollama] Skipping - not available or no model");
        return { items: [] };
      }

      // Skip if already generating
      if (store.isGenerating) {
        console.log("[Ollama] Skipping - already generating");
        return { items: [] };
      }

      // Get cursor line content before cursor
      const cursorLine = model
        .getLineContent(position.lineNumber)
        .substring(0, position.column - 1);

      // Don't suggest on empty lines, pure whitespace, or comments
      const trimmedLine = cursorLine.trim();
      if (!trimmedLine || trimmedLine.startsWith("#")) {
        console.log("[Ollama] Skipping - empty or comment line");
        return { items: [] };
      }

      // Don't suggest if line is too short
      if (trimmedLine.length < MIN_CHARS_FOR_SUGGESTION) {
        console.log("[Ollama] Skipping - line too short:", trimmedLine.length);
        return { items: [] };
      }

      console.log("[Ollama] Will generate for:", cursorLine);

      // Get context (last 30 lines before cursor)
      const startLine = Math.max(1, position.lineNumber - 30);
      const codeContext = model.getValueInRange({
        startLineNumber: startLine,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });

      // Cancel previous pending request
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        if (pendingResolve) {
          pendingResolve({ items: [] });
          pendingResolve = null;
        }
      }

      // Check if this is an explicit trigger (Ctrl+Space)
      const isExplicit =
        triggerContext.triggerKind ===
        monaco.languages.InlineCompletionTriggerKind.Explicit;

      // Return promise that resolves after debounce (or immediately for explicit)
      return new Promise((resolve) => {
        pendingResolve = resolve;

        const doGenerate = async () => {
          // Check cancellation
          if (token.isCancellationRequested) {
            console.log("[Ollama] Cancelled before generate");
            resolve({ items: [] });
            return;
          }

          try {
            console.log("[Ollama] Starting generation...");
            const suggestion = await store.generate(
              codeContext,
              cursorLine,
              context.columns
            );

            console.log("[Ollama] Got suggestion:", suggestion);

            // Check cancellation again after async operation
            if (token.isCancellationRequested) {
              console.log("[Ollama] Cancelled after generate");
              resolve({ items: [] });
              return;
            }

            // Don't show if suggestion is empty or just whitespace
            if (!suggestion.trim()) {
              console.log("[Ollama] Empty suggestion");
              resolve({ items: [] });
              return;
            }

            // Strip the prefix if the suggestion starts with what's already typed
            let insertText = suggestion;
            const trimmedCursor = cursorLine.trim();

            // Check if suggestion starts with the cursor line content
            if (insertText.startsWith(trimmedCursor)) {
              insertText = insertText.slice(trimmedCursor.length);
            } else if (insertText.startsWith(cursorLine)) {
              insertText = insertText.slice(cursorLine.length);
            }

            // Also try to find partial match at the end of cursorLine
            // e.g., cursorLine="def calc", suggestion="calculate():" -> "ulate():"
            if (insertText === suggestion) {
              for (let i = Math.min(cursorLine.length, suggestion.length); i > 0; i--) {
                const suffix = cursorLine.slice(-i);
                if (suggestion.startsWith(suffix)) {
                  insertText = suggestion.slice(i);
                  break;
                }
              }
            }

            // Don't show if nothing left after stripping prefix
            if (!insertText.trim()) {
              console.log("[Ollama] Empty after prefix strip");
              resolve({ items: [] });
              return;
            }

            console.log("[Ollama] Returning completion:", insertText);
            resolve({
              items: [
                {
                  insertText: insertText,
                  range: new monaco.Range(
                    position.lineNumber,
                    position.column,
                    position.lineNumber,
                    position.column
                  ),
                },
              ],
            });
          } catch (e) {
            // Generation failed or was cancelled
            console.log("[Ollama] Generation error:", e);
            resolve({ items: [] });
          }
        };

        if (isExplicit) {
          // Immediate for explicit trigger (Ctrl+Space)
          console.log("[Ollama] Explicit trigger - generating immediately");
          doGenerate();
        } else {
          // Debounced for automatic suggestions
          console.log("[Ollama] Setting debounce timer:", DEBOUNCE_DELAY, "ms");
          debounceTimer = setTimeout(doGenerate, DEBOUNCE_DELAY);
        }
      });
    },

    disposeInlineCompletions: () => {
      // Called when completions are disposed
      // Cancel any pending debounced request
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
    },
  };

  // Register the inline completions provider for Python
  const providerDisposable = monaco.languages.registerInlineCompletionsProvider(
    "python",
    provider
  );

  // Register Ctrl+Space keyboard shortcut for explicit trigger
  const commandDisposable = editorInstance.addAction({
    id: "ollama.triggerInlineSuggestion",
    label: "Trigger AI Suggestion",
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space],
    run: () => {
      editorInstance.trigger(
        "keyboard",
        "editor.action.inlineSuggest.trigger",
        null
      );
    },
  });

  // Return combined disposable
  return {
    dispose: () => {
      providerDisposable.dispose();
      commandDisposable.dispose();
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    },
  };
}
