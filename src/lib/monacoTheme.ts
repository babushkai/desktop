import type { Monaco } from "@monaco-editor/react";

// GitHub Dark theme colors
export const githubDarkTheme = {
  base: "vs-dark" as const,
  inherit: true,
  rules: [
    { token: "", foreground: "e6edf3" },
    { token: "comment", foreground: "8b949e", fontStyle: "italic" },
    { token: "keyword", foreground: "ff7b72" },
    { token: "keyword.control", foreground: "ff7b72" },
    { token: "keyword.operator", foreground: "ff7b72" },
    { token: "string", foreground: "a5d6ff" },
    { token: "string.escape", foreground: "79c0ff" },
    { token: "number", foreground: "79c0ff" },
    { token: "constant", foreground: "79c0ff" },
    { token: "variable", foreground: "ffa657" },
    { token: "variable.parameter", foreground: "e6edf3" },
    { token: "type", foreground: "ffa657" },
    { token: "type.identifier", foreground: "ffa657" },
    { token: "class", foreground: "ffa657" },
    { token: "function", foreground: "d2a8ff" },
    { token: "function.declaration", foreground: "d2a8ff" },
    { token: "method", foreground: "d2a8ff" },
    { token: "operator", foreground: "ff7b72" },
    { token: "punctuation", foreground: "e6edf3" },
    { token: "delimiter", foreground: "e6edf3" },
    { token: "tag", foreground: "7ee787" },
    { token: "attribute.name", foreground: "79c0ff" },
    { token: "attribute.value", foreground: "a5d6ff" },
    { token: "regexp", foreground: "7ee787" },
    { token: "annotation", foreground: "ffa657" },
    { token: "decorator", foreground: "ffa657" },
  ],
  colors: {
    "editor.background": "#0d1117",
    "editor.foreground": "#e6edf3",
    "editor.lineHighlightBackground": "#161b22",
    "editor.selectionBackground": "#264f78",
    "editor.inactiveSelectionBackground": "#264f7855",
    "editorLineNumber.foreground": "#6e7681",
    "editorLineNumber.activeForeground": "#e6edf3",
    "editorCursor.foreground": "#58a6ff",
    "editor.selectionHighlightBackground": "#3fb95040",
    "editorBracketMatch.background": "#3fb95040",
    "editorBracketMatch.border": "#3fb950",
    "editorIndentGuide.background": "#21262d",
    "editorIndentGuide.activeBackground": "#30363d",
    "editorWhitespace.foreground": "#484f58",
    "editorGutter.background": "#0d1117",
    "scrollbarSlider.background": "#484f5833",
    "scrollbarSlider.hoverBackground": "#484f5866",
    "scrollbarSlider.activeBackground": "#484f58aa",
  },
};

export function defineGithubDarkTheme(monaco: Monaco) {
  monaco.editor.defineTheme("github-dark", githubDarkTheme);
}
