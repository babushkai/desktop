import { useEffect, useRef } from "react";
import type { Node as ReactFlowNode } from "@xyflow/react";
import {
  RiAlignLeft,
  RiAlignCenter,
  RiAlignRight,
  RiAlignTop,
  RiAlignVertically,
  RiAlignBottom,
  RiLayoutColumnLine,
  RiLayoutRowLine,
  RiDeleteBinLine,
} from "@remixicon/react";
import { cn } from "@/lib/utils";

export type AlignType = "left" | "center" | "right" | "top" | "middle" | "bottom";

interface SelectionContextMenuProps {
  position: { x: number; y: number };
  selectedNodes: ReactFlowNode[];
  onAlign: (type: AlignType) => void;
  onDistribute: (direction: "horizontal" | "vertical") => void;
  onDelete: () => void;
  onClose: () => void;
}

interface MenuItemProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  variant?: "default" | "danger";
}

function MenuItem({ icon: Icon, label, onClick, variant = "default" }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded-md transition-colors",
        variant === "default" && "text-text-secondary hover:text-text-primary hover:bg-white/5",
        variant === "danger" && "text-red-400 hover:text-red-300 hover:bg-red-400/10"
      )}
    >
      <Icon className="w-4 h-4" />
      <span>{label}</span>
    </button>
  );
}

function MenuDivider() {
  return <div className="h-px bg-white/10 my-1" />;
}

function MenuSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <div className="px-3 py-1.5 text-[10px] font-medium text-text-muted uppercase tracking-wider">
        {title}
      </div>
      {children}
    </div>
  );
}

export function SelectionContextMenu({
  position,
  selectedNodes,
  onAlign,
  onDistribute,
  onDelete,
  onClose,
}: SelectionContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as globalThis.Node)) {
        onClose();
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  const nodeCount = selectedNodes.length;
  const canDistribute = nodeCount >= 3;

  return (
    <div
      ref={menuRef}
      className={cn(
        "absolute z-50 min-w-[200px]",
        "bg-background-elevated rounded-lg shadow-xl border border-white/10",
        "animate-fade-in"
      )}
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      {/* Alignment Section */}
      <MenuSection title="Alignment">
        <div className="px-2 grid grid-cols-3 gap-1">
          <button
            onClick={() => onAlign("left")}
            className="flex flex-col items-center gap-1 p-2 rounded-md text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
            title="Align Left"
          >
            <RiAlignLeft className="w-4 h-4" />
            <span className="text-[10px]">Left</span>
          </button>
          <button
            onClick={() => onAlign("center")}
            className="flex flex-col items-center gap-1 p-2 rounded-md text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
            title="Align Center"
          >
            <RiAlignCenter className="w-4 h-4" />
            <span className="text-[10px]">Center</span>
          </button>
          <button
            onClick={() => onAlign("right")}
            className="flex flex-col items-center gap-1 p-2 rounded-md text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
            title="Align Right"
          >
            <RiAlignRight className="w-4 h-4" />
            <span className="text-[10px]">Right</span>
          </button>
          <button
            onClick={() => onAlign("top")}
            className="flex flex-col items-center gap-1 p-2 rounded-md text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
            title="Align Top"
          >
            <RiAlignTop className="w-4 h-4" />
            <span className="text-[10px]">Top</span>
          </button>
          <button
            onClick={() => onAlign("middle")}
            className="flex flex-col items-center gap-1 p-2 rounded-md text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
            title="Align Middle"
          >
            <RiAlignVertically className="w-4 h-4" />
            <span className="text-[10px]">Middle</span>
          </button>
          <button
            onClick={() => onAlign("bottom")}
            className="flex flex-col items-center gap-1 p-2 rounded-md text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
            title="Align Bottom"
          >
            <RiAlignBottom className="w-4 h-4" />
            <span className="text-[10px]">Bottom</span>
          </button>
        </div>
      </MenuSection>

      <MenuDivider />

      {/* Distribution Section */}
      <MenuSection title="Distribution">
        <div className="px-2">
          <MenuItem
            icon={RiLayoutColumnLine}
            label="Distribute Horizontally"
            onClick={() => onDistribute("horizontal")}
          />
          <MenuItem
            icon={RiLayoutRowLine}
            label="Distribute Vertically"
            onClick={() => onDistribute("vertical")}
          />
          {!canDistribute && (
            <div className="px-3 py-1 text-[10px] text-text-muted">
              Select 3+ nodes to distribute
            </div>
          )}
        </div>
      </MenuSection>

      <MenuDivider />

      {/* Actions Section */}
      <div className="p-2">
        <MenuItem
          icon={RiDeleteBinLine}
          label={`Delete Selected (${nodeCount})`}
          onClick={onDelete}
          variant="danger"
        />
      </div>
    </div>
  );
}
