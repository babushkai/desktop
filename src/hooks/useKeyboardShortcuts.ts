import { useEffect, useCallback, useMemo } from "react";

export interface ShortcutCallbacks {
  onSelectAll?: () => void;
  onDuplicate?: () => void;
  onDeselect?: () => void;
  onAlignLeft?: () => void;
  onAlignRight?: () => void;
  onAlignCenter?: () => void;
}

/**
 * Detect if the current platform is macOS
 */
function isMac(): boolean {
  return navigator.platform.toUpperCase().indexOf("MAC") >= 0;
}

/**
 * Check if the event target is an input field where we should skip shortcuts
 */
function isInputField(target: EventTarget | null): boolean {
  if (!target) return false;

  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true;
  }

  // Check for contenteditable elements
  if (target instanceof HTMLElement && target.isContentEditable) {
    return true;
  }

  // Check for Monaco Editor (has class containing "monaco")
  if (target instanceof HTMLElement) {
    const monacoEditor = target.closest(".monaco-editor");
    if (monacoEditor) {
      return true;
    }
  }

  return false;
}

/**
 * Check if the modifier key is pressed (Cmd on Mac, Ctrl on Windows/Linux)
 */
function isModifierPressed(event: KeyboardEvent): boolean {
  return isMac() ? event.metaKey : event.ctrlKey;
}

/**
 * Custom hook for keyboard shortcuts on the workflow canvas.
 *
 * Implements the following shortcuts:
 * - Ctrl/Cmd+A: Select all nodes
 * - Ctrl/Cmd+D: Duplicate selected nodes
 * - Escape: Deselect all
 * - Ctrl/Cmd+Shift+L: Align selected nodes left
 * - Ctrl/Cmd+Shift+R: Align selected nodes right
 * - Ctrl/Cmd+Shift+C: Align selected nodes center (horizontal)
 *
 * Note: Delete/Backspace and V/H mode shortcuts are handled elsewhere.
 */
export function useKeyboardShortcuts(callbacks: ShortcutCallbacks): void {
  const {
    onSelectAll,
    onDuplicate,
    onDeselect,
    onAlignLeft,
    onAlignRight,
    onAlignCenter,
  } = callbacks;

  // Memoize callback references to avoid unnecessary re-renders
  const stableCallbacks = useMemo(
    () => ({
      onSelectAll,
      onDuplicate,
      onDeselect,
      onAlignLeft,
      onAlignRight,
      onAlignCenter,
    }),
    [onSelectAll, onDuplicate, onDeselect, onAlignLeft, onAlignRight, onAlignCenter]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Skip shortcuts when typing in input fields
      if (isInputField(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const modifier = isModifierPressed(event);
      const shift = event.shiftKey;

      // Escape: Deselect all
      if (key === "escape") {
        event.preventDefault();
        stableCallbacks.onDeselect?.();
        return;
      }

      // Modifier key combinations
      if (modifier) {
        // Ctrl/Cmd+Shift combinations (alignment)
        if (shift) {
          switch (key) {
            case "l":
              event.preventDefault();
              stableCallbacks.onAlignLeft?.();
              return;
            case "r":
              event.preventDefault();
              stableCallbacks.onAlignRight?.();
              return;
            case "c":
              event.preventDefault();
              stableCallbacks.onAlignCenter?.();
              return;
          }
        }

        // Ctrl/Cmd only combinations
        switch (key) {
          case "a":
            event.preventDefault();
            stableCallbacks.onSelectAll?.();
            return;
          case "d":
            event.preventDefault();
            stableCallbacks.onDuplicate?.();
            return;
        }
      }
    },
    [stableCallbacks]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);
}
