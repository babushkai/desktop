/**
 * LSP-based code chunking for semantic search.
 *
 * Uses Pyright's textDocument/documentSymbol to extract functions,
 * classes, and methods as separate chunks for more granular embedding.
 *
 * Handles:
 * - Gap detection: Captures imports, module-level code, and trailing code
 * - Nested symbols: Extracts methods within classes
 * - Temporary didOpen: Opens documents briefly for non-selected nodes
 * - Fallback: Returns whole code as single chunk if LSP unavailable
 */

import { useLspStore, getDocumentUri } from "@/stores/lspStore";
import type { LspDocumentSymbol } from "@/lib/tauri";

/**
 * A chunk of code extracted from a Script node.
 */
export interface CodeChunk {
  /** Unique identifier within the node, e.g., "func:train_model" or "toplevel:0" */
  chunkId: string;
  /** The actual code content */
  content: string;
  /** Function/class/method name, null for toplevel code */
  symbolName: string | null;
  /** Type of symbol */
  symbolType: "function" | "class" | "method" | "toplevel";
  /** 0-indexed start line */
  startLine: number;
  /** 0-indexed end line (inclusive) */
  endLine: number;
}

/** LSP SymbolKind constants */
const SYMBOL_KIND = {
  CLASS: 5,
  METHOD: 6,
  FUNCTION: 12,
  VARIABLE: 13,
} as const;

/**
 * Maps LSP SymbolKind to our chunk type.
 */
function mapSymbolKind(kind: number): CodeChunk["symbolType"] {
  switch (kind) {
    case SYMBOL_KIND.CLASS:
      return "class";
    case SYMBOL_KIND.METHOD:
      return "method";
    case SYMBOL_KIND.FUNCTION:
      return "function";
    default:
      return "toplevel";
  }
}

/**
 * Creates a toplevel chunk for the entire code.
 */
function createToplevelChunk(code: string): CodeChunk {
  const lines = code.split("\n");
  return {
    chunkId: "toplevel:0",
    content: code,
    symbolName: null,
    symbolType: "toplevel",
    startLine: 0,
    endLine: lines.length - 1,
  };
}

/**
 * Extracts chunks from LSP document symbols with gap handling.
 *
 * Gaps include:
 * - Imports and module-level variables before the first symbol
 * - Code between symbols
 * - Trailing code after the last symbol (e.g., if __name__ == "__main__")
 */
function extractChunksFromSymbols(
  code: string,
  symbols: LspDocumentSymbol[]
): CodeChunk[] {
  const lines = code.split("\n");
  const chunks: CodeChunk[] = [];

  // Sort symbols by start line
  const sortedSymbols = [...symbols].sort(
    (a, b) => a.range.start.line - b.range.start.line
  );

  let lastEndLine = 0;

  for (const symbol of sortedSymbols) {
    const symbolStart = symbol.range.start.line;
    const symbolEnd = symbol.range.end.line;

    // Capture gap BEFORE this symbol (imports, module-level vars, etc.)
    if (symbolStart > lastEndLine) {
      const gapContent = lines.slice(lastEndLine, symbolStart).join("\n").trim();
      if (gapContent) {
        chunks.push({
          chunkId: `toplevel:${lastEndLine}`,
          content: gapContent,
          symbolName: null,
          symbolType: "toplevel",
          startLine: lastEndLine,
          endLine: symbolStart - 1,
        });
      }
    }

    // Add symbol chunk
    const symbolType = mapSymbolKind(symbol.kind);
    chunks.push({
      chunkId: `${symbolType}:${symbol.name}`,
      content: lines.slice(symbolStart, symbolEnd + 1).join("\n"),
      symbolName: symbol.name,
      symbolType,
      startLine: symbolStart,
      endLine: symbolEnd,
    });

    // Handle nested symbols (methods inside classes)
    if (symbol.children?.length) {
      for (const child of symbol.children) {
        const childStart = child.range.start.line;
        const childEnd = child.range.end.line;
        chunks.push({
          chunkId: `method:${symbol.name}.${child.name}`,
          content: lines.slice(childStart, childEnd + 1).join("\n"),
          symbolName: `${symbol.name}.${child.name}`,
          symbolType: "method",
          startLine: childStart,
          endLine: childEnd,
        });
      }
    }

    lastEndLine = symbolEnd + 1;
  }

  // Capture TRAILING gap (if __name__ == "__main__", etc.)
  if (lastEndLine < lines.length) {
    const trailingContent = lines.slice(lastEndLine).join("\n").trim();
    if (trailingContent) {
      chunks.push({
        chunkId: `toplevel:${lastEndLine}`,
        content: trailingContent,
        symbolName: null,
        symbolType: "toplevel",
        startLine: lastEndLine,
        endLine: lines.length - 1,
      });
    }
  }

  return chunks;
}

/**
 * Extracts code chunks using LSP documentSymbol.
 *
 * For non-selected nodes, temporarily opens the document for LSP analysis,
 * then closes it to minimize memory usage in Pyright.
 *
 * @param nodeId - The Script node ID
 * @param code - The Python code content
 * @returns Array of code chunks
 */
export async function extractChunksWithLsp(
  nodeId: string,
  code: string
): Promise<CodeChunk[]> {
  const lsp = useLspStore.getState();
  const uri = getDocumentUri(nodeId);

  // Fallback if LSP not available
  if (!lsp.isConnected) {
    console.log("[Chunker] LSP not connected, using fallback");
    return [createToplevelChunk(code)];
  }

  // Check if document is already open (selected node)
  const wasOpen = lsp.openDocuments.has(uri);

  // Temporarily open document if not already open
  if (!wasOpen) {
    await lsp.openDocument(uri, code, 1);
  }

  try {
    const symbols = await lsp.documentSymbol(uri);

    if (!symbols || symbols.length === 0) {
      console.log(`[Chunker] No symbols found for ${nodeId}, using toplevel`);
      return [createToplevelChunk(code)];
    }

    console.log(`[Chunker] Found ${symbols.length} symbols for ${nodeId}`);
    return extractChunksFromSymbols(code, symbols);
  } catch (e) {
    console.warn(`[Chunker] documentSymbol failed for ${nodeId}:`, e);
    return [createToplevelChunk(code)];
  } finally {
    // Close if we opened it (keep selected node open)
    if (!wasOpen) {
      await lsp.closeDocument(uri);
    }
  }
}

/**
 * Simple regex-based fallback for when LSP is unavailable.
 *
 * Less accurate than LSP but provides basic function detection.
 */
export function extractChunksWithRegex(code: string): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  const lines = code.split("\n");

  // Match function and class definitions
  const defPattern = /^(async\s+)?def\s+(\w+)/;
  const classPattern = /^class\s+(\w+)/;

  let currentChunk: { type: "function" | "class" | "toplevel"; name: string | null; startLine: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const indent = line.match(/^(\s*)/)?.[1].length ?? 0;

    const funcMatch = line.match(defPattern);
    const classMatch = line.match(classPattern);

    // Check if we're starting a new top-level definition
    if ((funcMatch || classMatch) && indent === 0) {
      // Close previous chunk
      if (currentChunk) {
        const content = lines.slice(currentChunk.startLine, i).join("\n").trim();
        if (content) {
          chunks.push({
            chunkId: currentChunk.name
              ? `${currentChunk.type}:${currentChunk.name}`
              : `toplevel:${currentChunk.startLine}`,
            content,
            symbolName: currentChunk.name,
            symbolType: currentChunk.type,
            startLine: currentChunk.startLine,
            endLine: i - 1,
          });
        }
      } else if (i > 0) {
        // Capture any toplevel code before first definition
        const content = lines.slice(0, i).join("\n").trim();
        if (content) {
          chunks.push({
            chunkId: "toplevel:0",
            content,
            symbolName: null,
            symbolType: "toplevel",
            startLine: 0,
            endLine: i - 1,
          });
        }
      }

      // Start new chunk
      if (funcMatch) {
        currentChunk = { type: "function", name: funcMatch[2], startLine: i };
      } else if (classMatch) {
        currentChunk = { type: "class", name: classMatch[1], startLine: i };
      }
    }
  }

  // Close final chunk
  if (currentChunk) {
    const content = lines.slice(currentChunk.startLine).join("\n").trim();
    if (content) {
      chunks.push({
        chunkId: currentChunk.name
          ? `${currentChunk.type}:${currentChunk.name}`
          : `toplevel:${currentChunk.startLine}`,
        content,
        symbolName: currentChunk.name,
        symbolType: currentChunk.type,
        startLine: currentChunk.startLine,
        endLine: lines.length - 1,
      });
    }
  } else {
    // No definitions found, return whole code as toplevel
    return [createToplevelChunk(code)];
  }

  // Capture trailing code after last definition
  if (chunks.length > 0) {
    const lastChunk = chunks[chunks.length - 1];
    if (lastChunk.endLine < lines.length - 1) {
      const trailingContent = lines.slice(lastChunk.endLine + 1).join("\n").trim();
      if (trailingContent) {
        chunks.push({
          chunkId: `toplevel:${lastChunk.endLine + 1}`,
          content: trailingContent,
          symbolName: null,
          symbolType: "toplevel",
          startLine: lastChunk.endLine + 1,
          endLine: lines.length - 1,
        });
      }
    }
  }

  return chunks;
}
