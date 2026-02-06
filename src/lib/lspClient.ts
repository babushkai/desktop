/**
 * LSP Client for Monaco Editor integration.
 * Provides direct Monaco providers for diagnostics, hover, and completions.
 */

import type { Monaco } from "@monaco-editor/react";
import type { editor, IDisposable, CancellationToken, Position, IRange } from "monaco-editor";
import { useLspStore } from "@/stores/lspStore";
import type { LspDiagnostic } from "@/lib/tauri";

// Monaco types we need to reference from the monaco namespace
type ITextModel = editor.ITextModel;
type IMarkdownString = { value: string; isTrusted?: boolean };
type MarkerSeverity = number;

/**
 * Register LSP hover provider for Python
 */
export function registerLspHoverProvider(monaco: Monaco): IDisposable {
  return monaco.languages.registerHoverProvider("python", {
    provideHover: async (
      model: ITextModel,
      position: Position,
      token: CancellationToken
    ) => {
      const lspStore = useLspStore.getState();
      if (!lspStore.isConnected) return null;

      const uri = model.uri.toString();

      try {
        const result = await lspStore.hover(
          uri,
          position.lineNumber - 1, // LSP is 0-indexed
          position.column - 1
        );

        if (token.isCancellationRequested || !result) return null;

        // Convert LSP hover contents to Monaco format
        const contents: IMarkdownString[] = [];

        if (result.contents) {
          const contentArray = Array.isArray(result.contents)
            ? result.contents
            : [result.contents];

          for (const content of contentArray) {
            if (typeof content === "string") {
              contents.push({ value: content, isTrusted: true });
            } else if (content && typeof content === "object" && "value" in content) {
              // MarkedString with language
              const languageId = (content as { language?: string }).language || "";
              const value = (content as { value: string }).value;
              if (languageId) {
                contents.push({
                  value: `\`\`\`${languageId}\n${value}\n\`\`\``,
                  isTrusted: true,
                });
              } else {
                contents.push({ value, isTrusted: true });
              }
            }
          }
        }

        if (contents.length === 0) return null;

        return {
          contents,
          range: result.range
            ? new monaco.Range(
                result.range.start.line + 1,
                result.range.start.character + 1,
                result.range.end.line + 1,
                result.range.end.character + 1
              )
            : undefined,
        };
      } catch {
        return null;
      }
    },
  });
}

/**
 * Register LSP diagnostics adapter for Monaco.
 * Subscribes to diagnostics updates and sets Monaco markers.
 */
export function registerLspDiagnostics(
  monaco: Monaco,
  editorInstance: editor.IStandaloneCodeEditor
): IDisposable {
  const model = editorInstance.getModel();
  if (!model) return { dispose: () => {} };

  const uri = model.uri.toString();

  // Update markers from current diagnostics
  const updateMarkers = () => {
    const currentModel = editorInstance.getModel();
    if (!currentModel) return;

    const diagnostics = useLspStore.getState().diagnostics.get(uri) || [];
    console.log("[LSP] Updating markers for", uri, "- diagnostics:", diagnostics.length);
    const markers = diagnosticsToMarkers(monaco, diagnostics);
    monaco.editor.setModelMarkers(currentModel, "pyright", markers);
  };

  // Initial update
  updateMarkers();

  // Subscribe to store changes - simpler approach without selector
  const unsubscribe = useLspStore.subscribe(() => {
    updateMarkers();
  });

  return { dispose: unsubscribe };
}

/**
 * Convert LSP diagnostics to Monaco markers
 */
function diagnosticsToMarkers(
  monaco: Monaco,
  diagnostics: LspDiagnostic[]
): editor.IMarkerData[] {
  return diagnostics.map((d) => ({
    severity: lspSeverityToMonaco(monaco, d.severity),
    startLineNumber: d.range.start.line + 1,
    startColumn: d.range.start.character + 1,
    endLineNumber: d.range.end.line + 1,
    endColumn: d.range.end.character + 1,
    message: d.message,
    source: d.source || "pyright",
    code: d.code?.toString(),
  }));
}

/**
 * Convert LSP severity to Monaco severity
 */
function lspSeverityToMonaco(
  monaco: Monaco,
  severity?: number
): MarkerSeverity {
  switch (severity) {
    case 1:
      return monaco.MarkerSeverity.Error;
    case 2:
      return monaco.MarkerSeverity.Warning;
    case 3:
      return monaco.MarkerSeverity.Info;
    case 4:
      return monaco.MarkerSeverity.Hint;
    default:
      return monaco.MarkerSeverity.Error;
  }
}

/**
 * Register LSP completion provider for Python.
 * This uses CompletionItemProvider (dropdown menu), not InlineCompletionsProvider.
 */
export function registerLspCompletions(monaco: Monaco): IDisposable {
  return monaco.languages.registerCompletionItemProvider("python", {
    triggerCharacters: [".", "(", "[", ",", " ", "@", '"', "'"],

    provideCompletionItems: async (
      model: ITextModel,
      position: Position,
      _context: unknown,
      token: CancellationToken
    ) => {
      const lspStore = useLspStore.getState();
      if (!lspStore.isConnected) return null;

      const uri = model.uri.toString();

      try {
        const result = await lspStore.completion(
          uri,
          position.lineNumber - 1,
          position.column - 1
        );

        if (token.isCancellationRequested || !result) return null;

        // Get the word at position for the range
        const word = model.getWordUntilPosition(position);
        const range: IRange = {
          startLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endLineNumber: position.lineNumber,
          endColumn: word.endColumn,
        };

        const suggestions = result.items.map((item) => {
          // Convert documentation
          let documentation: IMarkdownString | string | undefined;
          if (item.documentation) {
            if (typeof item.documentation === "string") {
              documentation = item.documentation;
            } else if (
              item.documentation.kind === "markdown" ||
              item.documentation.kind === "plaintext"
            ) {
              documentation = {
                value: item.documentation.value,
                isTrusted: true,
              };
            }
          }

          return {
            label: item.label,
            kind: lspCompletionKindToMonaco(monaco, item.kind),
            detail: item.detail,
            documentation,
            insertText: item.insertText || item.label,
            insertTextRules:
              item.insertTextFormat === 2
                ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                : undefined,
            range,
          };
        });

        return {
          suggestions,
          incomplete: result.isIncomplete,
        };
      } catch {
        return null;
      }
    },
  });
}

/**
 * Convert LSP completion kind to Monaco completion kind
 */
function lspCompletionKindToMonaco(
  monaco: Monaco,
  kind?: number
): number {
  // LSP CompletionItemKind to Monaco CompletionItemKind mapping
  const kindMap: Record<number, number> = {
    1: monaco.languages.CompletionItemKind.Text,
    2: monaco.languages.CompletionItemKind.Method,
    3: monaco.languages.CompletionItemKind.Function,
    4: monaco.languages.CompletionItemKind.Constructor,
    5: monaco.languages.CompletionItemKind.Field,
    6: monaco.languages.CompletionItemKind.Variable,
    7: monaco.languages.CompletionItemKind.Class,
    8: monaco.languages.CompletionItemKind.Interface,
    9: monaco.languages.CompletionItemKind.Module,
    10: monaco.languages.CompletionItemKind.Property,
    11: monaco.languages.CompletionItemKind.Unit,
    12: monaco.languages.CompletionItemKind.Value,
    13: monaco.languages.CompletionItemKind.Enum,
    14: monaco.languages.CompletionItemKind.Keyword,
    15: monaco.languages.CompletionItemKind.Snippet,
    16: monaco.languages.CompletionItemKind.Color,
    17: monaco.languages.CompletionItemKind.File,
    18: monaco.languages.CompletionItemKind.Reference,
    19: monaco.languages.CompletionItemKind.Folder,
    20: monaco.languages.CompletionItemKind.EnumMember,
    21: monaco.languages.CompletionItemKind.Constant,
    22: monaco.languages.CompletionItemKind.Struct,
    23: monaco.languages.CompletionItemKind.Event,
    24: monaco.languages.CompletionItemKind.Operator,
    25: monaco.languages.CompletionItemKind.TypeParameter,
  };

  return kind ? kindMap[kind] || monaco.languages.CompletionItemKind.Text : monaco.languages.CompletionItemKind.Text;
}

/**
 * Register all LSP providers for an editor instance.
 * Returns a disposable that cleans up all providers.
 */
export function registerLspProviders(
  monaco: Monaco,
  editorInstance: editor.IStandaloneCodeEditor
): IDisposable {
  console.log("[LSP] Registering LSP providers");
  const disposables: IDisposable[] = [
    registerLspHoverProvider(monaco),
    registerLspDiagnostics(monaco, editorInstance),
    registerLspCompletions(monaco),
  ];
  console.log("[LSP] LSP providers registered");

  return {
    dispose: () => {
      console.log("[LSP] Disposing LSP providers");
      for (const d of disposables) {
        d.dispose();
      }
    },
  };
}
