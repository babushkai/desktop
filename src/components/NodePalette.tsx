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
        "w-full justify-start gap-2 mb-2 h-10",
        "bg-slate-800/50 hover:bg-slate-700 border border-slate-700",
        "transition-all duration-150"
      )}
    >
      <span className={cn("p-1 rounded", colorClass)}>{icon}</span>
      {label}
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
    <div className="w-[200px] bg-slate-800 p-4 border-r border-slate-700">
      <h3 className="mb-4 text-sm font-medium text-slate-400">Nodes</h3>

      <NodeButton
        onClick={handleAddDataLoader}
        icon={<FolderOpen className="h-4 w-4 text-green-400" />}
        label="Data Loader"
        colorClass="bg-green-950"
      />

      <NodeButton
        onClick={handleAddScript}
        icon={<FileCode2 className="h-4 w-4 text-blue-400" />}
        label="Script"
        colorClass="bg-blue-950"
      />

      <NodeButton
        onClick={handleAddDataSplit}
        icon={<Scissors className="h-4 w-4 text-pink-400" />}
        label="Data Split"
        colorClass="bg-pink-950"
      />

      <NodeButton
        onClick={handleAddTrainer}
        icon={<Brain className="h-4 w-4 text-violet-400" />}
        label="Trainer"
        colorClass="bg-violet-950"
      />

      <NodeButton
        onClick={handleAddEvaluator}
        icon={<BarChart3 className="h-4 w-4 text-orange-400" />}
        label="Evaluator"
        colorClass="bg-orange-950"
      />

      <NodeButton
        onClick={handleAddModelExporter}
        icon={<Package className="h-4 w-4 text-teal-400" />}
        label="Model Exporter"
        colorClass="bg-teal-950"
      />

      <div className="mt-6 p-3 bg-slate-900 rounded-lg text-xs text-slate-400">
        <p className="mb-2">
          <strong className="text-slate-300">Tip:</strong> Build a pipeline with nodes.
        </p>
        <p className="text-[10px] leading-relaxed">
          DataLoader → DataSplit → Trainer → Evaluator → Model Exporter
        </p>
      </div>
    </div>
  );
}
