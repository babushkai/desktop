import { FolderOpen, FileCode2, Scissors, Brain, BarChart3, Package } from "lucide-react";
import { usePipelineStore } from "../stores/pipelineStore";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NodeButtonProps {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  colorClass: string;
}

function NodeButton({ onClick, icon, label, colorClass }: NodeButtonProps) {
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      className={cn(
        "w-full justify-start gap-2.5 mb-2 h-11",
        "glass-subtle glass-hover rounded-xl",
        "transition-premium hover:scale-[1.02] hover:shadow-premium-sm"
      )}
    >
      <span className={cn("p-1.5 rounded-lg", colorClass)}>
        {icon}
      </span>
      <span className="text-sm font-medium tracking-tight">{label}</span>
    </Button>
  );
}

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
        icon={<FolderOpen className="h-4 w-4 text-emerald-400" />}
        label="Data Loader"
        colorClass="bg-emerald-950/50"
      />

      <NodeButton
        onClick={handleAddScript}
        icon={<FileCode2 className="h-4 w-4 text-sky-400" />}
        label="Script"
        colorClass="bg-sky-950/50"
      />

      <NodeButton
        onClick={handleAddDataSplit}
        icon={<Scissors className="h-4 w-4 text-fuchsia-400" />}
        label="Data Split"
        colorClass="bg-fuchsia-950/50"
      />

      <NodeButton
        onClick={handleAddTrainer}
        icon={<Brain className="h-4 w-4 text-purple-400" />}
        label="Trainer"
        colorClass="bg-purple-950/50"
      />

      <NodeButton
        onClick={handleAddEvaluator}
        icon={<BarChart3 className="h-4 w-4 text-amber-400" />}
        label="Evaluator"
        colorClass="bg-amber-950/50"
      />

      <NodeButton
        onClick={handleAddModelExporter}
        icon={<Package className="h-4 w-4 text-cyan-400" />}
        label="Model Exporter"
        colorClass="bg-cyan-950/50"
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
