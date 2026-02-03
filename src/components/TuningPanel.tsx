import { useCallback, useMemo, useState, useEffect } from "react";
import {
  RiSettings3Line,
  RiCloseLine,
  RiPlayFill,
  RiAlertLine,
  RiLoader4Line,
  RiRefreshLine,
} from "@remixicon/react";
import { checkPythonPackage } from "@/lib/tauri";
import { usePipelineStore } from "@/stores/pipelineStore";
import { TuningConfig, TuningSampler, getValidMetrics } from "@/lib/tuningTypes";
import { getDefaultSearchSpace, getDefaultMetric } from "@/lib/searchSpaceDefaults";
import {
  validateTuningConfig,
  calculateGridCombinations,
  formatGridWarning,
  canTune,
} from "@/lib/tuningValidation";
import { SearchSpaceEditor } from "./SearchSpaceEditor";
import { cn } from "@/lib/utils";

interface TuningPanelProps {
  nodeId: string;
  onStartTuning: (config: TuningConfig) => void;
  onClose: () => void;
}

export function TuningPanel({ nodeId, onStartTuning, onClose }: TuningPanelProps) {
  const nodes = usePipelineStore((s) => s.nodes);
  const updateNodeData = usePipelineStore((s) => s.updateNodeData);
  const executionStatus = usePipelineStore((s) => s.executionStatus);
  const tuningNodeId = usePipelineStore((s) => s.tuningNodeId);
  const profilingNodeId = usePipelineStore((s) => s.profilingNodeId);
  const optunaInstalled = usePipelineStore((s) => s.optunaInstalled);
  const setOptunaInstalled = usePipelineStore((s) => s.setOptunaInstalled);
  const [checkingOptuna, setCheckingOptuna] = useState(false);

  const handleCheckOptuna = useCallback(async () => {
    setCheckingOptuna(true);
    try {
      const installed = await checkPythonPackage("optuna");
      setOptunaInstalled(installed);
    } finally {
      setCheckingOptuna(false);
    }
  }, [setOptunaInstalled]);

  const node = nodes.find((n) => n.id === nodeId);
  const nodeData = node?.data;
  const modelType = nodeData?.modelType || "random_forest";

  // Initialize config from node data or defaults
  const [config, setConfig] = useState<TuningConfig>(() => {
    if (nodeData?.tuningConfig) {
      return nodeData.tuningConfig;
    }
    return {
      sampler: "bayesian",
      nTrials: 50,
      cvFolds: 3,
      scoringMetric: getDefaultMetric(modelType),
      searchSpace: getDefaultSearchSpace(modelType),
    };
  });

  // Reset search space when model type changes
  useEffect(() => {
    if (modelType) {
      setConfig((prev) => ({
        ...prev,
        scoringMetric: getDefaultMetric(modelType),
        searchSpace: getDefaultSearchSpace(modelType),
      }));
    }
  }, [modelType]);

  // Save config to node data on change
  useEffect(() => {
    updateNodeData(nodeId, { tuningConfig: config });
  }, [config, nodeId, updateNodeData]);

  const validMetrics = useMemo(() => getValidMetrics(modelType), [modelType]);

  const availableParams = useMemo(() => {
    const defaultSpace = getDefaultSearchSpace(modelType);
    return Object.keys(defaultSpace);
  }, [modelType]);

  const validationErrors = useMemo(
    () => validateTuningConfig(config, modelType),
    [config, modelType]
  );

  const gridWarning = useMemo(() => {
    if (config.sampler !== "grid") return null;
    return formatGridWarning(config.searchSpace, config.cvFolds);
  }, [config.sampler, config.searchSpace, config.cvFolds]);

  const gridCombinations = useMemo(() => {
    if (config.sampler !== "grid") return null;
    return calculateGridCombinations(config.searchSpace);
  }, [config.sampler, config.searchSpace]);

  const { valid: canTuneResult, reason: cannotTuneReason } = useMemo(
    () => canTune(nodeData || {}),
    [nodeData]
  );

  const isDisabled =
    executionStatus === "running" ||
    tuningNodeId !== null ||
    profilingNodeId !== null ||
    !canTuneResult;

  const handleSamplerChange = useCallback((sampler: TuningSampler) => {
    setConfig((prev) => ({ ...prev, sampler }));
  }, []);

  const handleTrialsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setConfig((prev) => ({ ...prev, nTrials: parseInt(e.target.value) || 10 }));
  }, []);

  const handleFoldsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setConfig((prev) => ({ ...prev, cvFolds: parseInt(e.target.value) || 3 }));
  }, []);

  const handleMetricChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setConfig((prev) => ({ ...prev, scoringMetric: e.target.value }));
  }, []);

  const handleSearchSpaceChange = useCallback(
    (searchSpace: TuningConfig["searchSpace"]) => {
      setConfig((prev) => ({ ...prev, searchSpace }));
    },
    []
  );

  const handleStartTuning = useCallback(() => {
    if (validationErrors.length === 0) {
      onStartTuning(config);
    }
  }, [config, validationErrors, onStartTuning]);

  if (!node) return null;

  return (
    <div className="w-80 flex flex-col bg-background-surface border-l border-white/10 max-h-screen overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <RiSettings3Line className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium text-text-primary">
            Hyperparameter Tuning
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-white/10 text-text-muted hover:text-text-primary"
        >
          <RiCloseLine className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Optuna warning */}
        {!optunaInstalled && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <div className="flex items-start gap-2">
              <RiAlertLine className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-400 flex-1">
                <p className="font-medium">Optuna not installed</p>
                <p className="mt-1 text-amber-400/80">
                  Run: <code className="bg-black/20 px-1 rounded">pip install optuna</code>
                </p>
              </div>
            </div>
            <button
              onClick={handleCheckOptuna}
              disabled={checkingOptuna}
              className="mt-2 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 rounded transition-colors disabled:opacity-50"
            >
              {checkingOptuna ? (
                <RiLoader4Line className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RiRefreshLine className="w-3.5 h-3.5" />
              )}
              Check Again
            </button>
          </div>
        )}

        {/* Cannot tune warning */}
        {!canTuneResult && cannotTuneReason && (
          <div className="flex items-start gap-2 p-3 bg-state-error/10 border border-state-error/20 rounded-lg">
            <RiAlertLine className="w-4 h-4 text-state-error shrink-0 mt-0.5" />
            <p className="text-xs text-state-error">{cannotTuneReason}</p>
          </div>
        )}

        {/* Sampler Selection */}
        <div>
          <label className="text-xs font-medium text-text-secondary block mb-2">
            Search Strategy
          </label>
          <div className="flex gap-1 p-0.5 bg-background rounded-md">
            {(["bayesian", "random", "grid"] as const).map((sampler) => (
              <button
                key={sampler}
                onClick={() => handleSamplerChange(sampler)}
                disabled={isDisabled}
                className={cn(
                  "flex-1 px-3 py-1.5 text-xs rounded transition-colors capitalize",
                  config.sampler === sampler
                    ? "bg-accent/20 text-accent"
                    : "text-text-muted hover:text-text-secondary"
                )}
              >
                {sampler === "bayesian" ? "Bayesian (TPE)" : sampler}
              </button>
            ))}
          </div>
        </div>

        {/* Trials / CV Folds */}
        <div className="grid grid-cols-2 gap-3">
          {config.sampler !== "grid" && (
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1.5">
                Trials
              </label>
              <input
                type="number"
                value={config.nTrials}
                onChange={handleTrialsChange}
                disabled={isDisabled}
                min={1}
                max={1000}
                className="input text-sm h-8"
              />
            </div>
          )}

          {config.sampler === "grid" && gridCombinations !== Infinity && (
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1.5">
                Trials (auto)
              </label>
              <div className="h-8 flex items-center px-3 bg-background rounded-md text-sm text-text-muted">
                {gridCombinations}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1.5">
              CV Folds
            </label>
            <input
              type="number"
              value={config.cvFolds}
              onChange={handleFoldsChange}
              disabled={isDisabled}
              min={2}
              max={10}
              className="input text-sm h-8"
            />
          </div>
        </div>

        {/* Metric */}
        <div>
          <label className="text-xs font-medium text-text-secondary block mb-1.5">
            Scoring Metric
          </label>
          <select
            value={config.scoringMetric}
            onChange={handleMetricChange}
            disabled={isDisabled}
            className="input text-sm h-8"
          >
            {validMetrics.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* Grid warning */}
        {gridWarning && (
          <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <RiAlertLine className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-400">{gridWarning}</p>
          </div>
        )}

        {/* Search Space */}
        <div>
          <label className="text-xs font-medium text-text-secondary block mb-2">
            Search Space
          </label>
          <SearchSpaceEditor
            searchSpace={config.searchSpace}
            onChange={handleSearchSpaceChange}
            availableParams={availableParams}
            disabled={isDisabled}
          />
        </div>

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <div className="p-3 bg-state-error/10 border border-state-error/20 rounded-lg">
            <p className="text-xs font-medium text-state-error mb-1">Validation Errors</p>
            <ul className="text-xs text-state-error/80 space-y-0.5">
              {validationErrors.map((error, i) => (
                <li key={i}>• {error}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-white/5">
        <button
          onClick={handleStartTuning}
          disabled={isDisabled || validationErrors.length > 0 || !optunaInstalled}
          className="w-full btn-primary flex items-center justify-center gap-2"
        >
          {tuningNodeId === nodeId ? (
            <>
              <RiLoader4Line className="w-4 h-4 animate-spin" />
              Tuning...
            </>
          ) : (
            <>
              <RiPlayFill className="w-4 h-4" />
              Start Tuning
            </>
          )}
        </button>
      </div>
    </div>
  );
}
