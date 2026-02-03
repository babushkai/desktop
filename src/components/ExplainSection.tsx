import { useState, Fragment } from "react";
import { Listbox, Transition, Disclosure } from "@headlessui/react";
import {
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiLightbulbLine,
  RiCheckLine,
} from "@remixicon/react";
import { cn } from "@/lib/utils";
import {
  ExplainData,
  ExplainStatus,
  ExplainProgressData,
  isClassificationExplainData,
  isClassificationShapData,
  isClassificationPDPData,
} from "@/lib/explainTypes";
import {
  FeatureImportanceChart,
  BeeswarmChart,
  PDPChart,
} from "./charts";

interface ExplainSectionProps {
  explainData: ExplainData | null;
  explainStatus: ExplainStatus;
  explainProgress: ExplainProgressData | null;
  onExplain: () => void;
  canExplain: boolean;
}

function ProgressBar({ progress }: { progress: ExplainProgressData }) {
  const stageLabels: Record<string, string> = {
    permutation_importance: "Computing Permutation Importance",
    shap: "Computing SHAP Values",
    pdp: "Computing Partial Dependence",
  };

  return (
    <div className="space-y-2 p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-secondary">{stageLabels[progress.stage]}</span>
        <span className="text-text-muted">{progress.percentComplete.toFixed(0)}%</span>
      </div>
      <div className="w-full bg-background-elevated rounded-full h-1.5">
        <div
          className="bg-accent h-1.5 rounded-full transition-all duration-300"
          style={{ width: `${progress.percentComplete}%` }}
        />
      </div>
    </div>
  );
}

interface SummaryInsight {
  type: "primary" | "secondary";
  text: string;
}

function generateSummary(data: ExplainData): SummaryInsight[] {
  const insights: SummaryInsight[] = [];
  const { featureImportance } = data;

  if (!featureImportance || featureImportance.features.length === 0) {
    return insights;
  }

  // Sort features by importance
  const sortedIndices = featureImportance.importances
    .map((imp, idx) => ({ imp: Math.abs(imp), idx }))
    .sort((a, b) => b.imp - a.imp)
    .map((x) => x.idx);

  const topFeatures = sortedIndices.slice(0, 3).map((i) => featureImportance.features[i]);
  const topImportances = sortedIndices.slice(0, 3).map((i) => featureImportance.importances[i]);

  // Calculate total importance for percentage
  const totalImportance = featureImportance.importances.reduce((sum, v) => sum + Math.abs(v), 0);
  const topThreeShare = topImportances.reduce((sum, v) => sum + Math.abs(v), 0) / totalImportance;

  // Primary insight: top features
  if (topFeatures.length > 0) {
    const topFeature = topFeatures[0];
    const topShare = Math.abs(topImportances[0]) / totalImportance;

    if (topShare > 0.4) {
      insights.push({
        type: "primary",
        text: `Your model relies heavily on "${topFeature}", which accounts for ${(topShare * 100).toFixed(0)}% of the prediction impact.`,
      });
    } else if (topFeatures.length >= 3 && topThreeShare > 0.6) {
      insights.push({
        type: "primary",
        text: `Your model's predictions are primarily driven by ${topFeatures.length} features: ${topFeatures.map(f => `"${f}"`).join(", ")}, together accounting for ${(topThreeShare * 100).toFixed(0)}% of the impact.`,
      });
    } else {
      insights.push({
        type: "primary",
        text: `The most influential feature is "${topFeature}". Your model uses multiple features relatively evenly, suggesting a balanced decision process.`,
      });
    }
  }

  // Secondary insight: model type context
  if (isClassificationExplainData(data)) {
    const numClasses = data.classNames.length;
    insights.push({
      type: "secondary",
      text: `This is a ${numClasses}-class classification model predicting: ${data.classNames.join(", ")}.`,
    });
  } else {
    insights.push({
      type: "secondary",
      text: `This is a regression model that predicts continuous numeric values.`,
    });
  }

  // Check for potentially concerning patterns
  const lowVarianceFeatures = featureImportance.features.filter((_, i) => {
    const imp = Math.abs(featureImportance.importances[i]);
    const std = featureImportance.stdDevs[i];
    return imp > 0.01 && std > imp * 0.5; // High variance relative to importance
  });

  if (lowVarianceFeatures.length > 0 && lowVarianceFeatures.length <= 2) {
    insights.push({
      type: "secondary",
      text: `Note: "${lowVarianceFeatures[0]}" shows high variability in importance, which may indicate instability or interaction effects.`,
    });
  }

  return insights;
}

interface ClassSelectorProps {
  classNames: string[];
  selectedClass: string;
  onSelect: (className: string) => void;
}

function ClassSelector({ classNames, selectedClass, onSelect }: ClassSelectorProps) {
  return (
    <Listbox value={selectedClass} onChange={onSelect}>
      <div className="relative">
        <Listbox.Button className="flex items-center gap-1.5 px-2 py-1 text-xs rounded bg-background-elevated hover:bg-white/10 transition-colors">
          <span className="text-text-secondary">Class: {selectedClass}</span>
          <RiArrowDownSLine className="w-3 h-3 text-text-muted" />
        </Listbox.Button>

        <Transition
          as={Fragment}
          enter="transition ease-out duration-100"
          enterFrom="transform opacity-0 scale-95"
          enterTo="transform opacity-100 scale-100"
          leave="transition ease-in duration-75"
          leaveFrom="transform opacity-100 scale-100"
          leaveTo="transform opacity-0 scale-95"
        >
          <Listbox.Options className="absolute z-50 mt-1 w-32 origin-top-left rounded-lg bg-background-surface border border-white/10 shadow-lg focus:outline-none max-h-48 overflow-y-auto">
            <div className="py-1">
              {classNames.map((className) => (
                <Listbox.Option
                  key={className}
                  value={className}
                  className={({ active }) =>
                    cn(
                      "px-3 py-1.5 text-xs cursor-pointer flex items-center justify-between",
                      active && "bg-background-elevated"
                    )
                  }
                >
                  {({ selected }) => (
                    <>
                      <span className={cn(selected && "text-accent")}>{className}</span>
                      {selected && <RiCheckLine className="w-3 h-3 text-accent" />}
                    </>
                  )}
                </Listbox.Option>
              ))}
            </div>
          </Listbox.Options>
        </Transition>
      </div>
    </Listbox>
  );
}

export function ExplainSection({
  explainData,
  explainStatus,
  explainProgress,
  onExplain,
  canExplain,
}: ExplainSectionProps) {
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [selectedPdpFeature, setSelectedPdpFeature] = useState<string | null>(null);

  // Get class names if classification
  const classNames = explainData && isClassificationExplainData(explainData)
    ? explainData.classNames
    : [];

  // Initialize selected class
  const activeClass = selectedClass || classNames[0] || "";

  // Get available PDP features
  const pdpFeatures = explainData?.pdp?.map((p) => p.feature) || [];
  const activePdpFeature = selectedPdpFeature || pdpFeatures[0] || "";
  const activePdp = explainData?.pdp?.find((p) => p.feature === activePdpFeature);

  const isRunning = explainStatus === "running";
  const hasData = explainData !== null;

  return (
    <Disclosure defaultOpen={hasData}>
      {({ open }) => (
        <div className="border-t border-white/5">
          <Disclosure.Button className="flex items-center justify-between w-full px-3 py-2 text-left hover:bg-white/5 transition-colors">
            <div className="flex items-center gap-2">
              {open ? (
                <RiArrowDownSLine className="w-4 h-4 text-text-muted" />
              ) : (
                <RiArrowRightSLine className="w-4 h-4 text-text-muted" />
              )}
              <RiLightbulbLine className="w-4 h-4 text-accent" />
              <span className="text-xs font-medium text-text-primary">Model Explainability</span>
            </div>

            {!hasData && !isRunning && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onExplain();
                }}
                disabled={!canExplain}
                className={cn(
                  "px-2 py-1 text-xs rounded transition-colors",
                  canExplain
                    ? "bg-accent/20 text-accent hover:bg-accent/30"
                    : "bg-background-elevated text-text-muted cursor-not-allowed"
                )}
              >
                Explain
              </button>
            )}
          </Disclosure.Button>

          <Disclosure.Panel>
            {/* Progress */}
            {isRunning && explainProgress && <ProgressBar progress={explainProgress} />}

            {/* Empty state */}
            {!hasData && !isRunning && (
              <div className="flex flex-col items-center justify-center py-6 text-text-muted px-4">
                <RiLightbulbLine className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-xs mb-1">Click "Explain" to analyze model predictions</p>
                <p className="text-[10px] text-center leading-relaxed max-w-sm">
                  Understand which features drive your model's predictions and how each feature
                  affects the output. Useful for debugging, building trust, and meeting regulatory requirements.
                </p>
              </div>
            )}

            {/* Explain Results */}
            {hasData && (
              <div className="space-y-4 p-3">
                {/* Summary Insights */}
                {(() => {
                  const insights = generateSummary(explainData);
                  if (insights.length === 0) return null;

                  return (
                    <div className="bg-accent/10 border border-accent/20 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <RiLightbulbLine className="w-4 h-4 text-accent mt-0.5 shrink-0" />
                        <div className="space-y-2">
                          <h4 className="text-xs font-medium text-accent">Summary</h4>
                          {insights.map((insight, i) => (
                            <p
                              key={i}
                              className={cn(
                                "text-xs leading-relaxed",
                                insight.type === "primary"
                                  ? "text-text-primary"
                                  : "text-text-secondary"
                              )}
                            >
                              {insight.text}
                            </p>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Class selector for classification */}
                {classNames.length > 1 && (
                  <div className="flex items-center gap-2">
                    <ClassSelector
                      classNames={classNames}
                      selectedClass={activeClass}
                      onSelect={setSelectedClass}
                    />
                  </div>
                )}

                {/* Feature Importance */}
                {explainData.featureImportance && (
                  <div className="bg-background-elevated rounded-lg p-2">
                    <h4 className="text-xs font-medium text-text-secondary mb-1 px-2">
                      Feature Importance (Permutation)
                    </h4>
                    <p className="text-[10px] text-text-muted px-2 mb-2 leading-relaxed">
                      Shows how much each feature contributes to model predictions. Longer bars mean
                      the feature has more impact. Error bars show variability across multiple tests.
                    </p>
                    <div className="h-64">
                      <FeatureImportanceChart
                        data={explainData.featureImportance}
                        maxFeatures={10}
                      />
                    </div>
                  </div>
                )}

                {/* SHAP Beeswarm */}
                {explainData.shap && (
                  <div className="bg-background-elevated rounded-lg p-2">
                    <h4 className="text-xs font-medium text-text-secondary mb-1 px-2">
                      SHAP Summary
                    </h4>
                    <p className="text-[10px] text-text-muted px-2 mb-2 leading-relaxed">
                      Each dot is a sample. Position shows impact on prediction: right = pushes prediction
                      higher, left = pushes it lower. Color shows feature value: <span className="text-red-400">red</span> = high
                      value, <span className="text-blue-400">blue</span> = low value. Features are sorted by overall importance.
                    </p>
                    <div className="h-64">
                      <BeeswarmChart
                        data={explainData.shap}
                        selectedClass={
                          isClassificationShapData(explainData.shap) ? activeClass : undefined
                        }
                        maxFeatures={10}
                      />
                    </div>
                  </div>
                )}

                {/* Partial Dependence */}
                {explainData.pdp && explainData.pdp.length > 0 && (
                  <div className="bg-background-elevated rounded-lg p-2">
                    <div className="flex items-center justify-between mb-1 px-2">
                      <h4 className="text-xs font-medium text-text-secondary">
                        Partial Dependence
                      </h4>
                      {pdpFeatures.length > 1 && (
                        <Listbox value={activePdpFeature} onChange={setSelectedPdpFeature}>
                          <div className="relative">
                            <Listbox.Button className="flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-background hover:bg-white/10 transition-colors">
                              <span className="text-text-secondary">{activePdpFeature}</span>
                              <RiArrowDownSLine className="w-3 h-3 text-text-muted" />
                            </Listbox.Button>

                            <Transition
                              as={Fragment}
                              enter="transition ease-out duration-100"
                              enterFrom="transform opacity-0 scale-95"
                              enterTo="transform opacity-100 scale-100"
                              leave="transition ease-in duration-75"
                              leaveFrom="transform opacity-100 scale-100"
                              leaveTo="transform opacity-0 scale-95"
                            >
                              <Listbox.Options className="absolute z-50 right-0 mt-1 w-40 origin-top-right rounded-lg bg-background-surface border border-white/10 shadow-lg focus:outline-none max-h-48 overflow-y-auto">
                                <div className="py-1">
                                  {pdpFeatures.map((feature) => (
                                    <Listbox.Option
                                      key={feature}
                                      value={feature}
                                      className={({ active }) =>
                                        cn(
                                          "px-3 py-1.5 text-xs cursor-pointer flex items-center justify-between",
                                          active && "bg-background-elevated"
                                        )
                                      }
                                    >
                                      {({ selected }) => (
                                        <>
                                          <span className={cn(selected && "text-accent")}>
                                            {feature}
                                          </span>
                                          {selected && (
                                            <RiCheckLine className="w-3 h-3 text-accent" />
                                          )}
                                        </>
                                      )}
                                    </Listbox.Option>
                                  ))}
                                </div>
                              </Listbox.Options>
                            </Transition>
                          </div>
                        </Listbox>
                      )}
                    </div>
                    <p className="text-[10px] text-text-muted px-2 mb-2 leading-relaxed">
                      Shows how changing this feature affects predictions on average, while keeping other features constant.
                      An upward slope means higher values of this feature lead to higher predictions.
                      {activePdp && !isClassificationPDPData(activePdp) && " Faint lines show individual sample responses (ICE curves)."}
                    </p>
                    <div className="h-48">
                      {activePdp && (
                        <PDPChart
                          data={activePdp}
                          showICE={!isClassificationPDPData(activePdp)}
                        />
                      )}
                    </div>
                  </div>
                )}

                {/* Re-run button */}
                <div className="flex justify-end">
                  <button
                    onClick={onExplain}
                    disabled={!canExplain || isRunning}
                    className={cn(
                      "px-3 py-1.5 text-xs rounded transition-colors",
                      canExplain && !isRunning
                        ? "bg-background text-text-secondary hover:bg-white/10"
                        : "bg-background text-text-muted cursor-not-allowed"
                    )}
                  >
                    Re-run Explain
                  </button>
                </div>
              </div>
            )}
          </Disclosure.Panel>
        </div>
      )}
    </Disclosure>
  );
}
