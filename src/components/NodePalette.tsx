import { useCallback } from "react";
import { usePipelineStore } from "../stores/pipelineStore";
import {
  RiDatabase2Line,
  RiCodeLine,
  RiScissorsCutLine,
  RiBrainLine,
  RiBarChartBoxLine,
  RiBox3Line,
  RiDragMove2Line,
  RiDeleteBinLine,
  RiArrowLeftSLine,
} from "@remixicon/react";
import { cn } from "@/lib/utils";

interface NodeCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  onClick: () => void;
  accentColor: string;
  iconBg: string;
}

function NodeCard({
  icon: Icon,
  label,
  description,
  onClick,
  accentColor,
  iconBg,
}: NodeCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full p-3 rounded-lg text-left",
        "bg-background-elevated/50 hover:bg-background-elevated",
        "border border-white/5 hover:border-white/10",
        "transition-all duration-150",
        "hover:shadow-lg hover:shadow-black/20",
        "group"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex-shrink-0 w-9 h-9 rounded-lg",
            "flex items-center justify-center",
            "transition-transform duration-150",
            "group-hover:scale-110",
            iconBg
          )}
        >
          <Icon className={cn("w-5 h-5", accentColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className={cn("text-sm font-medium", accentColor)}>{label}</div>
          <div className="text-xs text-text-secondary mt-0.5 leading-snug">
            {description}
          </div>
        </div>
      </div>
    </button>
  );
}

interface NodeGroupProps {
  title: string;
  children: React.ReactNode;
}

function NodeGroup({ title, children }: NodeGroupProps) {
  return (
    <div className="mb-4">
      <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2 px-1">
        {title}
      </h4>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

interface NodePaletteProps {
  onCollapse?: () => void;
}

export function NodePalette({ onCollapse }: NodePaletteProps) {
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
    <div className="w-56 flex flex-col h-full bg-background-sidebar shadow-panel-r border-r border-white/10">
      <div className="p-4 border-b border-white/5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Components</h3>
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="p-1 rounded hover:bg-white/10 text-text-muted hover:text-text-primary transition-colors"
              title="Collapse panel (Ctrl+B)"
            >
              <RiArrowLeftSLine className="w-4 h-4" />
            </button>
          )}
        </div>
        <p className="text-[11px] text-text-muted mt-1">
          Click to add to canvas
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <NodeGroup title="Data">
          <NodeCard
            icon={RiDatabase2Line}
            label="Data Loader"
            description="Load CSV, JSON, or Parquet files"
            onClick={handleAddDataLoader}
            accentColor="text-node-dataloader"
            iconBg="bg-node-dataloader/20"
          />
          <NodeCard
            icon={RiScissorsCutLine}
            label="Data Split"
            description="Split data into train/test sets"
            onClick={handleAddDataSplit}
            accentColor="text-node-datasplit"
            iconBg="bg-node-datasplit/20"
          />
        </NodeGroup>

        <NodeGroup title="Machine Learning">
          <NodeCard
            icon={RiBrainLine}
            label="Trainer"
            description="Train ML models with scikit-learn"
            onClick={handleAddTrainer}
            accentColor="text-node-trainer"
            iconBg="bg-node-trainer/20"
          />
          <NodeCard
            icon={RiBarChartBoxLine}
            label="Evaluator"
            description="Compute metrics and confusion matrix"
            onClick={handleAddEvaluator}
            accentColor="text-node-evaluator"
            iconBg="bg-node-evaluator/20"
          />
        </NodeGroup>

        <NodeGroup title="Output">
          <NodeCard
            icon={RiBox3Line}
            label="Model Exporter"
            description="Export to joblib, pickle, or ONNX"
            onClick={handleAddModelExporter}
            accentColor="text-node-exporter"
            iconBg="bg-node-exporter/20"
          />
          <NodeCard
            icon={RiCodeLine}
            label="Script"
            description="Run custom Python code"
            onClick={handleAddScript}
            accentColor="text-node-script"
            iconBg="bg-node-script/20"
          />
        </NodeGroup>
      </div>

      <div className="p-4 border-t border-white/5 bg-background/50">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[11px] text-text-muted">
            <RiDragMove2Line className="w-3.5 h-3.5 text-text-secondary" />
            <span>Drag nodes to reposition</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-text-muted">
            <RiDeleteBinLine className="w-3.5 h-3.5 text-text-secondary" />
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-background-elevated text-text-secondary text-[10px] font-mono">
                Del
              </kbd>{" "}
              to remove selected
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
