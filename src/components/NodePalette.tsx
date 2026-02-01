import { useCallback } from "react";
import { usePipelineStore } from "../stores/pipelineStore";
import {
  RiDatabase2Line,
  RiCodeLine,
  RiScissorsCutLine,
  RiBrainLine,
  RiBarChartBoxLine,
  RiBox3Line,
} from "@remixicon/react";
import { cn } from "@/lib/utils";

interface NodeButtonProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  colorClass: string;
}

function NodeButton({ icon: Icon, label, onClick, colorClass }: NodeButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full px-4 py-3 mb-2 rounded-lg",
        "flex items-center gap-3",
        "font-medium text-sm",
        "transition-all duration-150",
        "hover:scale-[1.02] hover:shadow-md",
        "active:scale-[0.98]",
        colorClass
      )}
    >
      <Icon className="w-5 h-5" />
      {label}
    </button>
  );
}

export function NodePalette() {
  const addNode = usePipelineStore((state) => state.addNode);

  const handleAddDataLoader = useCallback(() => {
    addNode("dataLoader", { x: 100, y: 100 + Math.random() * 100 });
  }, [addNode]);

  const handleAddScript = useCallback(() => {
    addNode("script", { x: 400, y: 100 + Math.random() * 100 });
  }, [addNode]);

  const handleAddDataSplit = useCallback(() => {
    addNode("dataSplit", { x: 250, y: 100 + Math.random() * 100 });
  }, [addNode]);

  const handleAddTrainer = useCallback(() => {
    addNode("trainer", { x: 400, y: 100 + Math.random() * 100 });
  }, [addNode]);

  const handleAddEvaluator = useCallback(() => {
    addNode("evaluator", { x: 700, y: 100 + Math.random() * 100 });
  }, [addNode]);

  const handleAddModelExporter = useCallback(() => {
    addNode("modelExporter", { x: 900, y: 100 + Math.random() * 100 });
  }, [addNode]);

  return (
    <div className="w-52 p-4 bg-background-surface border-r border-white/5">
      <h3 className="mb-4 text-sm font-medium text-text-muted uppercase tracking-wider">
        Nodes
      </h3>

      <NodeButton
        icon={RiDatabase2Line}
        label="Data Loader"
        onClick={handleAddDataLoader}
        colorClass="bg-node-dataloader/90 hover:bg-node-dataloader text-emerald-950"
      />

      <NodeButton
        icon={RiCodeLine}
        label="Script"
        onClick={handleAddScript}
        colorClass="bg-node-script/90 hover:bg-node-script text-sky-950"
      />

      <NodeButton
        icon={RiScissorsCutLine}
        label="Data Split"
        onClick={handleAddDataSplit}
        colorClass="bg-node-datasplit/90 hover:bg-node-datasplit text-fuchsia-950"
      />

      <NodeButton
        icon={RiBrainLine}
        label="Trainer"
        onClick={handleAddTrainer}
        colorClass="bg-node-trainer/90 hover:bg-node-trainer text-violet-950"
      />

      <NodeButton
        icon={RiBarChartBoxLine}
        label="Evaluator"
        onClick={handleAddEvaluator}
        colorClass="bg-node-evaluator/90 hover:bg-node-evaluator text-orange-950"
      />

      <NodeButton
        icon={RiBox3Line}
        label="Model Exporter"
        onClick={handleAddModelExporter}
        colorClass="bg-node-exporter/90 hover:bg-node-exporter text-teal-950"
      />

      <div className="mt-6 p-3 rounded-lg bg-background border border-white/5">
        <p className="text-xs text-text-muted mb-2">
          <span className="font-medium text-text-secondary">Tip:</span> Build a pipeline with
          nodes.
        </p>
        <p className="text-[10px] text-text-muted font-mono">
          DataLoader → DataSplit → Trainer → Evaluator → Exporter
        </p>
      </div>
    </div>
  );
}
