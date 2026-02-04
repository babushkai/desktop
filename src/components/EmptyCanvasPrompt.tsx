import { RiLayoutGridLine, RiAddLine, RiDragDropLine } from "@remixicon/react";

interface EmptyCanvasPromptProps {
  onBrowseTemplates: () => void;
  onNewBlankCanvas?: () => void;
}

export function EmptyCanvasPrompt({
  onBrowseTemplates,
  onNewBlankCanvas,
}: EmptyCanvasPromptProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="flex flex-col items-center gap-6 max-w-md text-center pointer-events-auto">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center">
          <RiLayoutGridLine className="w-8 h-8 text-accent" />
        </div>

        <div>
          <h2 className="text-xl font-semibold text-text-primary">
            Start Building Your Pipeline
          </h2>
          <p className="mt-2 text-text-muted">
            Choose a template to get started quickly, or build from scratch
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={onBrowseTemplates} className="btn-primary">
            <RiLayoutGridLine className="w-4 h-4 mr-2" />
            Browse Templates
          </button>
          {onNewBlankCanvas && (
            <button onClick={onNewBlankCanvas} className="btn-secondary">
              <RiAddLine className="w-4 h-4 mr-2" />
              Blank Canvas
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-text-muted">
          <RiDragDropLine className="w-4 h-4" />
          <span>or drag nodes from the sidebar</span>
        </div>
      </div>
    </div>
  );
}
