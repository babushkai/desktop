import { useMemo } from "react";
import { RiStarFill, RiCheckLine, RiLoader4Line, RiCloseLine } from "@remixicon/react";
import { usePipelineStore } from "@/stores/pipelineStore";
import { TrialResult } from "@/lib/tuningTypes";
import { cn } from "@/lib/utils";

function formatDuration(ms?: number): string {
  if (!ms) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatScore(score: number): string {
  // If it looks like a percentage metric (0-1 range)
  if (score >= 0 && score <= 1) {
    return `${(score * 100).toFixed(1)}%`;
  }
  // Negative metrics (neg_mse, etc)
  if (score < 0) {
    return score.toFixed(4);
  }
  return score.toFixed(4);
}

function formatParamValue(value: unknown): string {
  if (value === null) return "None";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "number") {
    if (Number.isInteger(value)) return value.toString();
    return value.toFixed(4);
  }
  return String(value);
}

export function TrialsPanel() {
  const tuningTrials = usePipelineStore((s) => s.tuningTrials);
  const tuningStatus = usePipelineStore((s) => s.tuningStatus);
  const tuningNodeId = usePipelineStore((s) => s.tuningNodeId);

  const bestTrialNumber = useMemo(() => {
    if (tuningTrials.length === 0) return null;
    const completed = tuningTrials.filter((t) => t.status === "completed");
    if (completed.length === 0) return null;
    const best = completed.reduce((a, b) => (a.score > b.score ? a : b));
    return best.trialNumber;
  }, [tuningTrials]);

  const paramNames = useMemo(() => {
    if (tuningTrials.length === 0) return [];
    const firstTrial = tuningTrials.find((t) => Object.keys(t.params).length > 0);
    return firstTrial ? Object.keys(firstTrial.params) : [];
  }, [tuningTrials]);

  if (tuningTrials.length === 0 && !tuningNodeId) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-sm p-4">
        <p>No tuning trials yet. Start tuning from a Trainer node in Tune mode.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Summary bar */}
      {tuningTrials.length > 0 && (
        <div className="flex items-center gap-4 px-4 py-2 bg-background border-b border-white/5 text-xs">
          <span className="text-text-muted">
            Trials:{" "}
            <span className="text-text-primary font-medium">
              {tuningTrials.filter((t) => t.status === "completed").length}/{tuningTrials.length}
            </span>
          </span>
          {bestTrialNumber !== null && (
            <span className="text-text-muted">
              Best:{" "}
              <span className="text-accent font-medium">
                #{bestTrialNumber} ({formatScore(
                  tuningTrials.find((t) => t.trialNumber === bestTrialNumber)?.score || 0
                )})
              </span>
            </span>
          )}
          {tuningStatus === "running" && (
            <span className="flex items-center gap-1 text-accent">
              <RiLoader4Line className="w-3 h-3 animate-spin" />
              Running...
            </span>
          )}
        </div>
      )}

      {/* Trials table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-background-elevated sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-text-muted w-16">Trial</th>
              {paramNames.map((param) => (
                <th key={param} className="px-3 py-2 text-left font-medium text-text-muted">
                  {param}
                </th>
              ))}
              <th className="px-3 py-2 text-left font-medium text-text-muted w-24">Score</th>
              <th className="px-3 py-2 text-left font-medium text-text-muted w-20">Duration</th>
              <th className="px-3 py-2 text-left font-medium text-text-muted w-24">Status</th>
            </tr>
          </thead>
          <tbody>
            {[...tuningTrials]
              .sort((a, b) => b.trialNumber - a.trialNumber)
              .map((trial) => (
                <TrialRow
                  key={trial.trialNumber}
                  trial={trial}
                  isBest={trial.trialNumber === bestTrialNumber}
                  paramNames={paramNames}
                />
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface TrialRowProps {
  trial: TrialResult;
  isBest: boolean;
  paramNames: string[];
}

function TrialRow({ trial, isBest, paramNames }: TrialRowProps) {
  return (
    <tr
      className={cn(
        "border-b border-white/5 hover:bg-background-elevated transition-colors",
        isBest && "bg-accent/5"
      )}
    >
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          {isBest && <RiStarFill className="w-3 h-3 text-accent" />}
          <span className={cn("font-medium", isBest ? "text-accent" : "text-text-primary")}>
            {trial.trialNumber}
          </span>
        </div>
      </td>
      {paramNames.map((param) => (
        <td key={param} className="px-3 py-2 text-text-secondary font-mono">
          {formatParamValue(trial.params[param])}
        </td>
      ))}
      <td className="px-3 py-2">
        <span
          className={cn(
            "font-medium",
            isBest ? "text-accent" : "text-text-primary"
          )}
        >
          {formatScore(trial.score)}
        </span>
      </td>
      <td className="px-3 py-2 text-text-muted">{formatDuration(trial.durationMs)}</td>
      <td className="px-3 py-2">
        <TrialStatus status={trial.status} isBest={isBest} />
      </td>
    </tr>
  );
}

function TrialStatus({ status, isBest }: { status: TrialResult["status"]; isBest: boolean }) {
  switch (status) {
    case "completed":
      return (
        <span
          className={cn(
            "flex items-center gap-1",
            isBest ? "text-accent" : "text-state-success"
          )}
        >
          <RiCheckLine className="w-3 h-3" />
          {isBest ? "Best" : "Complete"}
        </span>
      );
    case "running":
      return (
        <span className="flex items-center gap-1 text-accent">
          <RiLoader4Line className="w-3 h-3 animate-spin" />
          Running
        </span>
      );
    case "pending":
      return <span className="text-text-muted">Pending</span>;
    case "failed":
      return (
        <span className="flex items-center gap-1 text-state-error">
          <RiCloseLine className="w-3 h-3" />
          Failed
        </span>
      );
    case "pruned":
      return <span className="text-text-muted">Pruned</span>;
    default:
      return <span className="text-text-muted">{status}</span>;
  }
}
