import * as React from "react";
import { Handle, Position } from "@xyflow/react";
import { RiLoader4Line, RiCheckLine, RiCloseLine, RiPlayLine, RiDeleteBinLine } from "@remixicon/react";
import { cn } from "@/lib/utils";

export type NodeVariant =
  | "dataloader"
  | "datasplit"
  | "trainer"
  | "evaluator"
  | "exporter"
  | "script";

export type ExecutionState = "idle" | "running" | "success" | "failed";

interface BaseNodeProps {
  variant: NodeVariant;
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  executionState?: ExecutionState;
  isRunning?: boolean;
  isSelected?: boolean;
  hasInput?: boolean;
  hasOutput?: boolean;
  minWidth?: number;
  children: React.ReactNode;
  className?: string;
  onRun?: () => void;
  onDelete?: () => void;
}

// Node variant styles with black backgrounds
// Uses Tailwind classes for text/ring, keeps rgba for shadows (hex colors don't support opacity modifiers)
const variantStyles: Record<NodeVariant, { bg: string; text: string; glow: string; selectedRing: string; selectedGlow: string }> = {
  dataloader: {
    bg: "bg-[#0d1117]/95",
    text: "text-node-dataloader",
    glow: "shadow-[0_0_20px_rgba(63,185,80,0.12)]",
    selectedRing: "ring-node-dataloader",
    selectedGlow: "shadow-[0_0_30px_rgba(63,185,80,0.35)]",
  },
  datasplit: {
    bg: "bg-[#0d1117]/95",
    text: "text-node-datasplit",
    glow: "shadow-[0_0_20px_rgba(163,113,247,0.12)]",
    selectedRing: "ring-node-datasplit",
    selectedGlow: "shadow-[0_0_30px_rgba(163,113,247,0.35)]",
  },
  trainer: {
    bg: "bg-[#0d1117]/95",
    text: "text-node-trainer",
    glow: "shadow-[0_0_20px_rgba(219,97,162,0.12)]",
    selectedRing: "ring-node-trainer",
    selectedGlow: "shadow-[0_0_30px_rgba(219,97,162,0.35)]",
  },
  evaluator: {
    bg: "bg-[#0d1117]/95",
    text: "text-node-evaluator",
    glow: "shadow-[0_0_20px_rgba(240,136,62,0.12)]",
    selectedRing: "ring-node-evaluator",
    selectedGlow: "shadow-[0_0_30px_rgba(240,136,62,0.35)]",
  },
  exporter: {
    bg: "bg-[#0d1117]/95",
    text: "text-node-exporter",
    glow: "shadow-[0_0_20px_rgba(121,192,255,0.12)]",
    selectedRing: "ring-node-exporter",
    selectedGlow: "shadow-[0_0_30px_rgba(121,192,255,0.35)]",
  },
  script: {
    bg: "bg-[#0d1117]/95",
    text: "text-node-script",
    glow: "shadow-[0_0_20px_rgba(88,166,255,0.12)]",
    selectedRing: "ring-node-script",
    selectedGlow: "shadow-[0_0_30px_rgba(88,166,255,0.35)]",
  },
};

// Execution state styles
const executionStateStyles: Record<ExecutionState, { border: string; icon: React.ReactNode | null }> = {
  idle: {
    border: "",
    icon: null,
  },
  running: {
    border: "ring-2 ring-accent",
    icon: <RiLoader4Line className="w-3.5 h-3.5 text-accent animate-spin" />,
  },
  success: {
    border: "ring-2 ring-state-success",
    icon: <RiCheckLine className="w-3.5 h-3.5 text-state-success" />,
  },
  failed: {
    border: "ring-2 ring-state-error",
    icon: <RiCloseLine className="w-3.5 h-3.5 text-state-error" />,
  },
};

export function BaseNode({
  variant,
  title,
  icon: Icon,
  executionState = "idle",
  isRunning,
  isSelected,
  hasInput = false,
  hasOutput = false,
  minWidth = 200,
  children,
  className,
  onRun,
  onDelete,
}: BaseNodeProps) {
  const styles = variantStyles[variant];
  const execStyles = executionStateStyles[executionState];

  // Determine the ring style based on priority: execution state > selected > running
  const getRingStyle = () => {
    if (executionState !== "idle") {
      return execStyles.border;
    }
    if (isSelected) {
      return `ring-2 ${styles.selectedRing}`;
    }
    if (isRunning) {
      return "ring-2 ring-state-warning/50";
    }
    return "";
  };

  return (
    <div className="group relative">
      {/* Hover Control Bar */}
      <div
        className={cn(
          "absolute -top-10 left-1/2 -translate-x-1/2 z-10",
          "flex items-center gap-1 px-2 py-1.5",
          "bg-background-surface/95 backdrop-blur-md",
          "rounded-lg shadow-lg border border-white/10",
          "opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0",
          "transition-all duration-200 ease-out"
        )}
      >
        {onRun && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRun();
            }}
            className="nodrag btn-icon-success"
            title="Run node"
          >
            <RiPlayLine className="w-4 h-4" />
          </button>
        )}
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="nodrag btn-icon-error"
            title="Delete node"
          >
            <RiDeleteBinLine className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Node Content */}
      <div
        className={cn(
          "node-base transition-shadow duration-200",
          styles.bg,
          isSelected ? styles.selectedGlow : styles.glow,
          getRingStyle(),
          className
        )}
        style={{ minWidth }}
      >
        {hasInput && (
          <Handle
            type="target"
            position={Position.Left}
            className="!w-3 !h-3 !bg-background-elevated !border-2 !border-text-muted hover:!border-accent transition-colors"
          />
        )}

        {hasOutput && (
          <Handle
            type="source"
            position={Position.Right}
            className="!w-3 !h-3 !bg-background-elevated !border-2 !border-text-muted hover:!border-accent transition-colors"
          />
        )}

        <div className={cn("flex items-center gap-2 mb-3 text-xs font-medium", styles.text)}>
          {Icon && <Icon className="w-4 h-4" />}
          <span>{title}</span>
          {execStyles.icon && (
            <span className="ml-auto">{execStyles.icon}</span>
          )}
          {executionState === "idle" && isRunning && (
            <span className="ml-auto w-2 h-2 rounded-full bg-state-warning animate-pulse" />
          )}
        </div>

        <div className="space-y-2">{children}</div>
      </div>
    </div>
  );
}

// Reusable node form components
interface NodeLabelProps {
  children: React.ReactNode;
  className?: string;
}

export function NodeLabel({ children, className }: NodeLabelProps) {
  return (
    <label className={cn("block text-xs text-text-secondary mb-1", className)}>
      {children}
    </label>
  );
}

interface NodeInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string;
}

export function NodeInput({ className, ...props }: NodeInputProps) {
  return (
    <input
      className={cn(
        "nodrag w-full px-2 py-1.5 text-xs rounded-md",
        "bg-black/30 text-text-primary",
        "border border-white/10",
        "focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent",
        "placeholder:text-text-muted",
        className
      )}
      {...props}
    />
  );
}

interface NodeSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: { value: string; label: string }[];
  className?: string;
}

export function NodeSelect({ options, className, ...props }: NodeSelectProps) {
  return (
    <select
      className={cn(
        "nodrag w-full px-2 py-1.5 text-xs rounded-md appearance-none",
        "bg-black/30 text-text-primary",
        "border border-white/10",
        "focus:outline-none focus:ring-1 focus:ring-accent",
        className
      )}
      {...props}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

interface NodeSliderProps extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string;
}

export function NodeSlider({ className, ...props }: NodeSliderProps) {
  return (
    <input
      type="range"
      className={cn(
        "nodrag w-full h-1.5 rounded-full appearance-none cursor-pointer",
        "bg-white/10",
        "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3",
        "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent",
        "[&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:transition-transform",
        "[&::-webkit-slider-thumb]:hover:scale-110",
        className
      )}
      {...props}
    />
  );
}

interface NodeCheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function NodeCheckbox({ label, className, ...props }: NodeCheckboxProps) {
  return (
    <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer hover:text-text-primary transition-colors">
      <input
        type="checkbox"
        className={cn(
          "nodrag w-3.5 h-3.5 rounded",
          "bg-black/30 border border-white/10",
          "checked:bg-accent checked:border-accent",
          "focus:ring-1 focus:ring-accent focus:ring-offset-0",
          className
        )}
        {...props}
      />
      {label}
    </label>
  );
}

interface NodeTextProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
}

export function NodeText({ children, className, title }: NodeTextProps) {
  return <div className={cn("text-xs text-text-secondary", className)} title={title}>{children}</div>;
}

interface NodeButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string;
}

export function NodeButton({ className, children, ...props }: NodeButtonProps) {
  return (
    <button
      className={cn(
        "nodrag w-full px-3 py-2 text-xs text-left rounded-md",
        "bg-black/30 text-text-secondary",
        "border border-white/10",
        "hover:bg-white/5 hover:text-text-primary hover:border-accent/50",
        "transition-colors duration-150",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

interface OptionGroup {
  label: string;
  options: { value: string; label: string }[];
}

interface NodeSelectGroupedProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  groups: OptionGroup[];
  className?: string;
}

export function NodeSelectGrouped({ groups, className, ...props }: NodeSelectGroupedProps) {
  return (
    <select
      className={cn(
        "nodrag w-full px-2 py-1.5 text-xs rounded-md appearance-none",
        "bg-black/30 text-text-primary",
        "border border-white/10",
        "focus:outline-none focus:ring-1 focus:ring-accent",
        className
      )}
      {...props}
    >
      {groups.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
