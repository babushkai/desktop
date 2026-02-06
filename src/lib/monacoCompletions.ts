// Monaco completion provider for Python in the Script Editor
// Provides context-aware autocomplete for pandas, numpy, and sklearn

import type { Monaco } from "@monaco-editor/react";
import type { IDisposable, languages, editor, Position } from "monaco-editor";
import {
  pandasMethods,
  numpyFunctions,
  sklearnImports,
  CompletionKind,
} from "./pythonCompletionData";

export interface PipelineContext {
  inputFilePath?: string;
  columns?: string[];
  dataTypes?: Record<string, string>;
}

// Map string kinds to Monaco CompletionItemKind
function getMonacoKind(
  monaco: Monaco,
  kind: CompletionKind
): languages.CompletionItemKind {
  const kindMap: Record<
    CompletionKind,
    keyof typeof monaco.languages.CompletionItemKind
  > = {
    Method: "Method",
    Property: "Property",
    Function: "Function",
    Class: "Class",
    Module: "Module",
  };
  return monaco.languages.CompletionItemKind[kindMap[kind]];
}

export function registerPythonCompletions(
  monaco: Monaco,
  context: PipelineContext
): IDisposable {
  return monaco.languages.registerCompletionItemProvider("python", {
    triggerCharacters: [".", "[", '"', "'"],
    provideCompletionItems: (model: editor.ITextModel, position: Position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const lineContent = model.getLineContent(position.lineNumber);
      const textBefore = lineContent.substring(0, position.column - 1);

      const suggestions: languages.CompletionItem[] = [];

      // After df. or similar DataFrame variable names
      if (/\b(df|data|frame|dataset|train|test|X|y)\.$/i.test(textBefore)) {
        suggestions.push(
          ...pandasMethods.map((m) => ({
            label: m.label,
            kind: getMonacoKind(monaco, m.kind),
            insertText: m.insertText,
            insertTextRules:
              monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: m.documentation,
            range,
          }))
        );
      }

      // After np.
      if (/\bnp\.$/i.test(textBefore)) {
        suggestions.push(
          ...numpyFunctions.map((f) => ({
            label: f.label,
            kind: getMonacoKind(monaco, f.kind),
            insertText: f.insertText,
            insertTextRules:
              monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: f.documentation,
            range,
          }))
        );
      }

      // sklearn imports - after "from sklearn" or at line start for imports
      if (
        /^\s*from\s+sklearn/i.test(textBefore) ||
        /^\s*(from|import)\s*$/i.test(textBefore)
      ) {
        suggestions.push(
          ...sklearnImports.map((s) => ({
            label: s.label,
            kind: getMonacoKind(monaco, s.kind),
            insertText: s.insertText,
            documentation: s.documentation,
            range: {
              ...range,
              startColumn: 1,
              endColumn: position.column,
            },
          }))
        );
      }

      // Column names ONLY in DataFrame indexing context: df[', df[", data[', etc.
      // Also support df.loc[row, ' and df.iloc patterns
      if (
        context.columns?.length &&
        /\b(df|data|frame|dataset|train|test|X)\[['"][^'"]*$/i.test(textBefore)
      ) {
        suggestions.push(
          ...context.columns.map((col) => ({
            label: col,
            kind: monaco.languages.CompletionItemKind.Field,
            insertText: col,
            documentation: context.dataTypes?.[col]
              ? `Column (${context.dataTypes[col]})`
              : "Column",
            range,
          }))
        );
      }

      // Column names in .loc/.iloc context with quotes: df.loc[:, '
      if (
        context.columns?.length &&
        /\.(loc|iloc)\[[^\]]*,\s*['"][^'"]*$/i.test(textBefore)
      ) {
        suggestions.push(
          ...context.columns.map((col) => ({
            label: col,
            kind: monaco.languages.CompletionItemKind.Field,
            insertText: col,
            documentation: context.dataTypes?.[col]
              ? `Column (${context.dataTypes[col]})`
              : "Column",
            range,
          }))
        );
      }

      return { suggestions };
    },
  });
}
