import { usePipelineStore } from "@/stores/pipelineStore";
import { DataProfile, DataQualityIssue, ColumnStatistics } from "@/lib/dataProfileTypes";
import { cn } from "@/lib/utils";
import {
  RiAlertLine,
  RiErrorWarningLine,
  RiInformationLine,
  RiDatabase2Line,
} from "@remixicon/react";

interface DatasetOverviewProps {
  profile: DataProfile;
}

function DatasetOverview({ profile }: DatasetOverviewProps) {
  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="mb-4 p-3 bg-background rounded-lg border border-white/10">
      <div className="flex items-center gap-2 mb-2">
        <RiDatabase2Line className="w-4 h-4 text-node-dataloader" />
        <span className="font-medium text-text-primary">{profile.fileName}</span>
        {profile.sampled && (
          <span className="px-1.5 py-0.5 text-[10px] rounded bg-state-warning/20 text-state-warning">
            Sampled
          </span>
        )}
      </div>
      <div className="grid grid-cols-4 gap-4 text-xs">
        <div>
          <span className="text-text-muted">Rows</span>
          <div className="text-text-primary font-medium">
            {profile.rowCount.toLocaleString()}
          </div>
        </div>
        <div>
          <span className="text-text-muted">Columns</span>
          <div className="text-text-primary font-medium">{profile.columnCount}</div>
        </div>
        <div>
          <span className="text-text-muted">Memory</span>
          <div className="text-text-primary font-medium">
            {formatBytes(profile.memorySizeBytes)}
          </div>
        </div>
        <div>
          <span className="text-text-muted">Profiled</span>
          <div className="text-text-primary font-medium">
            {new Date(profile.profiledAt).toLocaleTimeString()}
          </div>
        </div>
      </div>
    </div>
  );
}

interface QualityIssuesBannerProps {
  issues: DataQualityIssue[];
}

function QualityIssuesBanner({ issues }: QualityIssuesBannerProps) {
  const getSeverityConfig = (severity: DataQualityIssue["severity"]) => {
    switch (severity) {
      case "error":
        return {
          icon: RiErrorWarningLine,
          bgClass: "bg-state-error/10",
          textClass: "text-state-error",
          borderClass: "border-state-error/30",
        };
      case "warning":
        return {
          icon: RiAlertLine,
          bgClass: "bg-state-warning/10",
          textClass: "text-state-warning",
          borderClass: "border-state-warning/30",
        };
      default:
        return {
          icon: RiInformationLine,
          bgClass: "bg-accent/10",
          textClass: "text-accent",
          borderClass: "border-accent/30",
        };
    }
  };

  // Group by severity
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const infos = issues.filter((i) => i.severity === "info");

  const grouped = [...errors, ...warnings, ...infos];

  return (
    <div className="mb-4 space-y-2">
      <div className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
        Quality Issues ({issues.length})
      </div>
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {grouped.map((issue, i) => {
          const config = getSeverityConfig(issue.severity);
          const Icon = config.icon;
          return (
            <div
              key={i}
              className={cn(
                "flex items-start gap-2 px-3 py-1.5 rounded-md text-xs border",
                config.bgClass,
                config.borderClass
              )}
            >
              <Icon className={cn("w-3.5 h-3.5 mt-0.5 shrink-0", config.textClass)} />
              <span className={config.textClass}>{issue.message}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ColumnStatsTableProps {
  columns: ColumnStatistics[];
}

function ColumnStatsTable({ columns }: ColumnStatsTableProps) {
  const getTypeColor = (type: ColumnStatistics["dataType"]) => {
    switch (type) {
      case "numeric":
        return "text-blue-400";
      case "categorical":
        return "text-purple-400";
      case "datetime":
        return "text-orange-400";
      case "boolean":
        return "text-green-400";
      default:
        return "text-text-muted";
    }
  };

  return (
    <div className="mb-4">
      <div className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
        Column Statistics
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left py-2 px-2 text-text-muted font-medium">Column</th>
              <th className="text-left py-2 px-2 text-text-muted font-medium">Type</th>
              <th className="text-right py-2 px-2 text-text-muted font-medium">Count</th>
              <th className="text-right py-2 px-2 text-text-muted font-medium">Missing</th>
              <th className="text-right py-2 px-2 text-text-muted font-medium">Unique</th>
              <th className="text-right py-2 px-2 text-text-muted font-medium">Mean/Top</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((col) => (
              <tr key={col.name} className="border-b border-white/5 hover:bg-white/5">
                <td className="py-2 px-2 text-text-primary font-mono truncate max-w-[120px]" title={col.name}>
                  {col.name}
                </td>
                <td className={cn("py-2 px-2", getTypeColor(col.dataType))}>
                  {col.dataType}
                </td>
                <td className="py-2 px-2 text-right text-text-secondary">
                  {col.count.toLocaleString()}
                </td>
                <td
                  className={cn(
                    "py-2 px-2 text-right",
                    col.missingPercent > 50
                      ? "text-state-error"
                      : col.missingPercent > 10
                        ? "text-state-warning"
                        : "text-text-secondary"
                  )}
                >
                  {col.missingPercent > 0 ? `${col.missingPercent.toFixed(1)}%` : "-"}
                </td>
                <td className="py-2 px-2 text-right text-text-secondary">
                  {col.unique.toLocaleString()}
                </td>
                <td className="py-2 px-2 text-right text-text-secondary truncate max-w-[100px]">
                  {col.dataType === "numeric" && col.mean !== undefined
                    ? col.mean.toFixed(2)
                    : col.topValues && col.topValues[0]
                      ? col.topValues[0].value
                      : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface PreviewTableProps {
  rows: Record<string, unknown>[];
}

function PreviewTable({ rows }: PreviewTableProps) {
  if (rows.length === 0) return null;

  const columns = Object.keys(rows[0]);

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return "null";
    if (typeof value === "number") {
      if (Number.isInteger(value)) return value.toLocaleString();
      return value.toFixed(4);
    }
    return String(value);
  };

  return (
    <div>
      <div className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
        Preview (first {rows.length} rows)
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/10">
              {columns.map((col) => (
                <th
                  key={col}
                  className="text-left py-2 px-2 text-text-muted font-medium font-mono truncate max-w-[100px]"
                  title={col}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                {columns.map((col) => (
                  <td
                    key={col}
                    className="py-1.5 px-2 text-text-secondary truncate max-w-[100px]"
                    title={formatValue(row[col])}
                  >
                    {formatValue(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function DataProfilePanel() {
  const selectedNodeId = usePipelineStore((s) => s.selectedNodeId);
  const dataProfiles = usePipelineStore((s) => s.dataProfiles);
  const nodes = usePipelineStore((s) => s.nodes);

  // Find selected DataLoader node's profile
  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const isDataLoaderSelected = selectedNode?.type === "dataLoader";
  const profile = isDataLoaderSelected && selectedNodeId ? dataProfiles[selectedNodeId] : null;

  // If no DataLoader selected, show all available profiles
  const availableProfiles = Object.values(dataProfiles);

  if (!profile && availableProfiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-muted p-4">
        <RiDatabase2Line className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm text-center">
          Select a DataLoader node and click "Profile Data" to see statistics
        </p>
      </div>
    );
  }

  // Show profile for selected DataLoader, or first available if none selected
  const displayProfile = profile || availableProfiles[0];

  if (!displayProfile) return null;

  return (
    <div className="p-4 overflow-auto h-full">
      <DatasetOverview profile={displayProfile} />

      {displayProfile.qualityIssues.length > 0 && (
        <QualityIssuesBanner issues={displayProfile.qualityIssues} />
      )}

      <ColumnStatsTable columns={displayProfile.columns} />

      <PreviewTable rows={displayProfile.preview} />
    </div>
  );
}
