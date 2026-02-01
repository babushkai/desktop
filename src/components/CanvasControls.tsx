import { useEffect, useCallback, useState } from "react";
import { RiCursorLine, RiDragMoveLine } from "@remixicon/react";
import { cn } from "@/lib/utils";

export type CanvasMode = "pointer" | "hand";

interface CanvasControlsProps {
  onModeChange?: (mode: CanvasMode) => void;
}

export function CanvasControls({ onModeChange }: CanvasControlsProps) {
  const [mode, setMode] = useState<CanvasMode>("pointer");

  const handleModeChange = useCallback(
    (newMode: CanvasMode) => {
      setMode(newMode);
      onModeChange?.(newMode);
    },
    [onModeChange]
  );

  // Keyboard shortcuts: V for pointer, H for hand mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input field
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.key.toLowerCase() === "v") {
        handleModeChange("pointer");
      } else if (e.key.toLowerCase() === "h") {
        handleModeChange("hand");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleModeChange]);

  return (
    <div
      className={cn(
        "absolute left-4 top-1/2 -translate-y-1/2 z-10",
        "flex flex-col",
        "bg-background-elevated/90 backdrop-blur-sm",
        "border border-white/10 rounded-lg shadow-lg",
        "p-1 space-y-1"
      )}
    >
      {/* Mode toggle buttons */}
      <button
        onClick={() => handleModeChange("pointer")}
        className={cn(
          "p-2 rounded-md transition-colors",
          "hover:bg-white/5",
          mode === "pointer"
            ? "bg-accent/20 text-accent"
            : "text-text-muted hover:text-text-primary"
        )}
        title="Pointer (V)"
        aria-label="Pointer mode"
      >
        <RiCursorLine className="w-4 h-4" />
      </button>

      <button
        onClick={() => handleModeChange("hand")}
        className={cn(
          "p-2 rounded-md transition-colors",
          "hover:bg-white/5",
          mode === "hand"
            ? "bg-accent/20 text-accent"
            : "text-text-muted hover:text-text-primary"
        )}
        title="Hand/Pan (H)"
        aria-label="Hand/Pan mode"
      >
        <RiDragMoveLine className="w-4 h-4" />
      </button>

    </div>
  );
}
