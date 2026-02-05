import { Fragment, useState, useCallback, useEffect, useRef } from "react";
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild, Tab, TabGroup, TabList } from "@headlessui/react";
import { RiCloseLine } from "@remixicon/react";
import { usePipelineStore } from "@/stores/pipelineStore";
import {
  TEMPLATES,
  PipelineTemplate,
  TemplateCategory,
} from "@/lib/templates";
import { TemplateCard } from "./TemplateCard";
import { ConfirmDialog } from "./ConfirmDialog";
import { cn } from "@/lib/utils";

interface TemplateGalleryProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORIES: { label: string; value: TemplateCategory | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Classification", value: "classification" },
  { label: "Regression", value: "regression" },
  { label: "Advanced", value: "advanced" },
];

export function TemplateGallery({ isOpen, onClose }: TemplateGalleryProps) {
  const { isDirty, loadTemplateWithAnimation } = usePipelineStore();
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | "all">("all");
  const [pendingTemplate, setPendingTemplate] = useState<PipelineTemplate | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);

  const filteredTemplates =
    selectedCategory === "all"
      ? TEMPLATES
      : TEMPLATES.filter((t) => t.category === selectedCategory);

  // Reset focus when category changes
  useEffect(() => {
    setFocusedIndex(0);
  }, [selectedCategory]);

  const handleTemplateSelect = useCallback(
    async (template: PipelineTemplate) => {
      if (isDirty) {
        setPendingTemplate(template);
      } else {
        try {
          await loadTemplateWithAnimation(template);
        } catch (error) {
          console.error("Failed to load template:", error);
        }
        onClose();
      }
    },
    [isDirty, loadTemplateWithAnimation, onClose]
  );

  const handleConfirmLoad = useCallback(async () => {
    if (pendingTemplate) {
      await loadTemplateWithAnimation(pendingTemplate);
      setPendingTemplate(null);
      onClose();
    }
  }, [pendingTemplate, loadTemplateWithAnimation, onClose]);

  const handleCancelLoad = useCallback(() => {
    setPendingTemplate(null);
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const cols = 2; // 2 columns in the grid
      const total = filteredTemplates.length;

      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          setFocusedIndex((prev) => Math.min(prev + 1, total - 1));
          break;
        case "ArrowLeft":
          e.preventDefault();
          setFocusedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex((prev) => Math.min(prev + cols, total - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex((prev) => Math.max(prev - cols, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (filteredTemplates[focusedIndex]) {
            handleTemplateSelect(filteredTemplates[focusedIndex]);
          }
          break;
        case "1":
          e.preventDefault();
          setSelectedCategory("all");
          break;
        case "2":
          e.preventDefault();
          setSelectedCategory("classification");
          break;
        case "3":
          e.preventDefault();
          setSelectedCategory("regression");
          break;
        case "4":
          e.preventDefault();
          setSelectedCategory("advanced");
          break;
      }
    },
    [filteredTemplates, focusedIndex, handleTemplateSelect]
  );

  return (
    <>
      <Transition appear show={isOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-50"
          onClose={onClose}
          onKeyDown={handleKeyDown}
        >
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
          </TransitionChild>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <TransitionChild
                as={Fragment}
                enter="ease-out duration-200"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-150"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <DialogPanel className="w-full max-w-3xl rounded-xl bg-background-surface border border-white/10 shadow-xl overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                    <DialogTitle className="text-lg font-semibold text-text-primary">
                      Pipeline Templates
                    </DialogTitle>
                    <button
                      onClick={onClose}
                      className="btn-ghost h-8 w-8 p-0"
                    >
                      <RiCloseLine className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Category tabs */}
                  <TabGroup
                    selectedIndex={CATEGORIES.findIndex(
                      (c) => c.value === selectedCategory
                    )}
                    onChange={(index) =>
                      setSelectedCategory(CATEGORIES[index].value)
                    }
                  >
                    <TabList className="flex gap-1 px-6 py-3 border-b border-white/5">
                      {CATEGORIES.map((category, index) => (
                        <Tab
                          key={category.value}
                          className={({ selected }) =>
                            cn(
                              "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                              "focus:outline-none focus:ring-2 focus:ring-accent/50",
                              selected
                                ? "bg-accent/20 text-accent"
                                : "text-text-secondary hover:text-text-primary hover:bg-white/5"
                            )
                          }
                        >
                          {category.label}
                          <span className="ml-1.5 text-xs text-text-muted">
                            {index + 1}
                          </span>
                        </Tab>
                      ))}
                    </TabList>
                  </TabGroup>

                  {/* Template grid */}
                  <div
                    ref={gridRef}
                    className="p-6 max-h-[60vh] overflow-y-auto"
                  >
                    <div className="grid grid-cols-2 gap-4">
                      {filteredTemplates.map((template, index) => (
                        <TemplateCard
                          key={template.id}
                          template={template}
                          isFocused={index === focusedIndex}
                          onSelect={() => handleTemplateSelect(template)}
                        />
                      ))}
                    </div>

                    {filteredTemplates.length === 0 && (
                      <div className="text-center py-12 text-text-muted">
                        No templates in this category
                      </div>
                    )}
                  </div>

                  {/* Footer hint */}
                  <div className="px-6 py-3 border-t border-white/5 text-xs text-text-muted">
                    Use arrow keys to navigate, Enter to select, 1-4 to switch
                    categories
                  </div>
                </DialogPanel>
              </TransitionChild>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* Confirmation dialog for dirty state */}
      <ConfirmDialog
        isOpen={pendingTemplate !== null}
        onClose={handleCancelLoad}
        onConfirm={handleConfirmLoad}
        title="Unsaved Changes"
        message="Loading a template will replace your current pipeline. Continue?"
        confirmLabel="Load Template"
        cancelLabel="Cancel"
      />
    </>
  );
}
