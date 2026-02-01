import { memo, ReactNode } from "react";
import { FolderOpen, FileCode2, Scissors, Brain, BarChart3, Package } from "lucide-react";
import { usePipelineStore } from "../stores/pipelineStore";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Rule: rendering-hoist-jsx - Hoist static JSX outside components
const ICONS = {
  dataLoader: <FolderOpen className="h-4 w-4 text-emerald-400" />,
  script: <FileCode2 className="h-4 w-4 text-sky-400" />,
  dataSplit: <Scissors className="h-4 w-4 text-fuchsia-400" />,
  trainer: <Brain className="h-4 w-4 text-purple-400" />,
  evaluator: <BarChart3 className="h-4 w-4 text-amber-400" />,
  modelExporter: <Package className="h-4 w-4 text-cyan-400" />,
} as const;

const COLORS = {
  dataLoader: "bg-emerald-950/50",
  script: "bg-sky-950/50",
  dataSplit: "bg-fuchsia-950/50",
  trainer: "bg-purple-950/50",
  evaluator: "bg-amber-950/50",
  modelExporter: "bg-cyan-950/50",
} as const;

interface NodeButtonProps {
  onClick: () => void;
  icon: ReactNode;
  label: string;
  colorClass: string;
}

// Rule: rerender-memo - Memoize pure presentational component
const NodeButton = memo(function NodeButton({
  onClick,
  icon,
  label,
  colorClass,
}: NodeButtonProps) {
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      className={cn(
        "w-full justify-start gap-2.5 mb-2 h-11",
        "glass-subtle glass-hover rounded-xl",
        "transition-button hover:shadow-premium-sm hover:-translate-y-px"
      )}
    >
      <span className={cn("p-1.5 rounded-lg", colorClass)}>{icon}</span>
      <span className="text-sm font-medium tracking-tight">{label}</span>
    </Button>
  );
});

export function NodePalette() {
  const addNode = usePipelineStore((state) => state.addNode);

  const handleAddDataLoader = () => {
    addNode("dataLoader", { x: 100, y: 100 + Math.random() * 100 });
  };

  const handleAddScript = () => {
    addNode("script", { x: 400, y: 100 + Math.random() * 100 });
  };

  const handleAddDataSplit = () => {
    addNode("dataSplit", { x: 250, y: 100 + Math.random() * 100 });
  };

  const handleAddTrainer = () => {
    addNode("trainer", { x: 400, y: 100 + Math.random() * 100 });
  };

  const handleAddEvaluator = () => {
    addNode("evaluator", { x: 700, y: 100 + Math.random() * 100 });
  };

  const handleAddModelExporter = () => {
    addNode("modelExporter", { x: 900, y: 100 + Math.random() * 100 });
  };

  return (
    <div className="w-[220px] glass-subtle border-r border-white/[0.08] p-4">
      <h3 className="mb-4 text-[11px] uppercase tracking-widest text-slate-500 font-medium">
        Nodes
      </h3>

      <NodeButton
        onClick={handleAddDataLoader}
        icon={ICONS.dataLoader}
        label="Data Loader"
        colorClass={COLORS.dataLoader}
      />

      <NodeButton
        onClick={handleAddScript}
        icon={ICONS.script}
        label="Script"
        colorClass={COLORS.script}
      />

      <NodeButton
        onClick={handleAddDataSplit}
        icon={ICONS.dataSplit}
        label="Data Split"
        colorClass={COLORS.dataSplit}
      />

      <NodeButton
        onClick={handleAddTrainer}
        icon={ICONS.trainer}
        label="Trainer"
        colorClass={COLORS.trainer}
      />

      <NodeButton
        onClick={handleAddEvaluator}
        icon={ICONS.evaluator}
        label="Evaluator"
        colorClass={COLORS.evaluator}
      />

      <NodeButton
        onClick={handleAddModelExporter}
        icon={ICONS.modelExporter}
        label="Model Exporter"
        colorClass={COLORS.modelExporter}
      />

      <div className="mt-6 p-3 glass-subtle rounded-xl text-xs text-slate-400">
        <p className="mb-2">
          <strong className="text-slate-300 font-medium">Tip:</strong> Build a pipeline with nodes.
        </p>
        <p className="text-[10px] leading-relaxed text-slate-500">
          DataLoader → DataSplit → Trainer → Evaluator → Model Exporter
        </p>
      </div>
    </div>
  );
}
