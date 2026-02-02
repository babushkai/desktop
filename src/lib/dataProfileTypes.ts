export interface ColumnStatistics {
  name: string;
  dataType: "numeric" | "categorical" | "datetime" | "text" | "boolean";
  count: number;
  missingCount: number;
  missingPercent: number;
  unique: number;
  uniquePercent: number;
  // Numeric only
  mean?: number;
  std?: number;
  min?: number;
  max?: number;
  median?: number;
  // Categorical only (top 10 values)
  topValues?: Array<{ value: string; count: number; percent: number }>;
  // Distribution data
  histogram?: { bins: string[]; counts: number[] };
}

export interface DataQualityIssue {
  type: "missing_values" | "duplicates" | "constant_column" | "high_cardinality";
  severity: "info" | "warning" | "error";
  column?: string;
  message: string;
}

export interface DataProfile {
  nodeId: string;
  fileName: string;
  filePath: string;
  rowCount: number;
  columnCount: number;
  memorySizeBytes: number;
  sampled: boolean;
  columns: ColumnStatistics[];
  qualityIssues: DataQualityIssue[];
  preview: Record<string, unknown>[];
  profiledAt: string;
}

export type ProfilingStatus = "idle" | "profiling" | "complete" | "error" | "cancelled";
