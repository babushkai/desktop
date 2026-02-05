import { RiDatabase2Line, RiArrowRightSLine } from "@remixicon/react";
import { PipelineTemplate, TemplateDifficulty } from "@/lib/templates";
import { TemplatePreview } from "./TemplatePreview";
import { cn } from "@/lib/utils";

interface TemplateCardProps {
  template: PipelineTemplate;
  isFocused?: boolean;
  onSelect: () => void;
}

const DIFFICULTY_COLORS: Record<TemplateDifficulty, string> = {
  beginner: "bg-state-success/20 text-state-success",
  intermediate: "bg-state-warning/20 text-state-warning",
  advanced: "bg-accent/20 text-accent",
};

const DIFFICULTY_LABELS: Record<TemplateDifficulty, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export function TemplateCard({
  template,
  isFocused,
  onSelect,
}: TemplateCardProps) {
  const nodeCount = template.nodes.length;

  return (
    <div
      className={cn(
        "group rounded-lg border bg-background-elevated p-4 transition-all cursor-pointer",
        "hover:border-accent/50 hover:bg-background-elevated/80",
        isFocused
          ? "border-accent ring-2 ring-accent/30"
          : "border-white/10"
      )}
      onClick={onSelect}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {/* Mini preview */}
      <div className="mb-3 rounded-md overflow-hidden bg-background border border-white/5">
        <TemplatePreview nodes={template.nodes} edges={template.edges} />
      </div>

      {/* Title and description */}
      <h3 className="font-medium text-text-primary group-hover:text-accent transition-colors">
        {template.name}
      </h3>
      <p className="mt-1 text-xs text-text-muted line-clamp-2">
        {template.description}
      </p>

      {/* Metadata row */}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Difficulty badge */}
          <span
            className={cn(
              "px-2 py-0.5 text-xs font-medium rounded-full",
              DIFFICULTY_COLORS[template.difficulty]
            )}
          >
            {DIFFICULTY_LABELS[template.difficulty]}
          </span>

          {/* Dataset if bundled */}
          {template.datasetName && (
            <span className="flex items-center gap-1 text-xs text-text-muted">
              <RiDatabase2Line className="w-3 h-3" />
              {template.datasetName.replace(".csv", "")}
            </span>
          )}
        </div>

        {/* Node count */}
        <span className="text-xs text-text-muted">{nodeCount} nodes</span>
      </div>

      {/* Use template button - appears on hover */}
      <button
        className={cn(
          "mt-3 w-full btn-primary text-sm opacity-0 group-hover:opacity-100 transition-opacity",
          isFocused && "opacity-100"
        )}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        Use Template
        <RiArrowRightSLine className="w-4 h-4 ml-1" />
      </button>
    </div>
  );
}
