const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB threshold
const SAMPLE_ROWS = 10_000;

export function generateDataProfileScript(
  nodeId: string,
  previewRows: number = 10
): string {
  // Note: filePath is passed via sys.argv[1] by runScript (safe from injection)
  return `import sys
import json
import os
import pandas as pd
import numpy as np

def emit(event_type, **kwargs):
    """Emit a JSON event to stdout for the frontend to consume."""
    print(json.dumps({"type": event_type, **kwargs}), flush=True)

def safe_json(obj):
    """Convert numpy types to JSON-serializable Python types."""
    if isinstance(obj, (np.integer,)):
        return int(obj)
    elif isinstance(obj, (np.floating,)):
        if np.isnan(obj) or np.isinf(obj):
            return None
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return [safe_json(x) for x in obj]
    elif isinstance(obj, dict):
        return {k: safe_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [safe_json(x) for x in obj]
    elif pd.isna(obj):
        return None
    return obj

def infer_data_type(series):
    """Infer the data type category for a pandas series."""
    if pd.api.types.is_bool_dtype(series):
        return "boolean"
    elif pd.api.types.is_numeric_dtype(series):
        return "numeric"
    elif pd.api.types.is_datetime64_any_dtype(series):
        return "datetime"
    else:
        # Check if categorical (low cardinality) or text (high cardinality)
        unique_ratio = series.nunique() / len(series) if len(series) > 0 else 0
        if unique_ratio < 0.5:
            return "categorical"
        return "text"

def profile_column(series, col_name):
    """Profile a single column and return statistics."""
    count = len(series)
    missing_count = int(series.isna().sum())
    missing_percent = (missing_count / count * 100) if count > 0 else 0
    non_null = series.dropna()
    unique = int(non_null.nunique())
    unique_percent = (unique / len(non_null) * 100) if len(non_null) > 0 else 0

    data_type = infer_data_type(series)

    stats = {
        "name": col_name,
        "dataType": data_type,
        "count": count,
        "missingCount": missing_count,
        "missingPercent": round(missing_percent, 2),
        "unique": unique,
        "uniquePercent": round(unique_percent, 2),
    }

    if data_type == "numeric" and len(non_null) > 0:
        stats["mean"] = safe_json(non_null.mean())
        stats["std"] = safe_json(non_null.std())
        stats["min"] = safe_json(non_null.min())
        stats["max"] = safe_json(non_null.max())
        stats["median"] = safe_json(non_null.median())

        # Generate histogram bins
        try:
            hist_counts, hist_edges = np.histogram(non_null, bins=10)
            bins = [f"{hist_edges[i]:.2f}-{hist_edges[i+1]:.2f}" for i in range(len(hist_counts))]
            stats["histogram"] = {
                "bins": bins,
                "counts": [int(c) for c in hist_counts]
            }
        except Exception:
            pass

    elif data_type in ("categorical", "text", "boolean") and len(non_null) > 0:
        # Top 10 most frequent values
        value_counts = non_null.value_counts().head(10)
        total = len(non_null)
        stats["topValues"] = [
            {
                "value": str(val),
                "count": int(cnt),
                "percent": round(cnt / total * 100, 2)
            }
            for val, cnt in value_counts.items()
        ]

    return stats

def detect_quality_issues(df, column_stats):
    """Detect data quality issues and return a list of issues."""
    issues = []

    # Check for duplicate rows
    dup_count = df.duplicated().sum()
    if dup_count > 0:
        dup_percent = dup_count / len(df) * 100
        severity = "error" if dup_percent > 50 else "warning" if dup_percent > 10 else "info"
        issues.append({
            "type": "duplicates",
            "severity": severity,
            "message": f"{dup_count:,} duplicate rows ({dup_percent:.1f}%)"
        })

    for col_stat in column_stats:
        col_name = col_stat["name"]

        # Missing values
        if col_stat["missingPercent"] > 0:
            miss_pct = col_stat["missingPercent"]
            if miss_pct > 50:
                severity = "error"
            elif miss_pct > 10:
                severity = "warning"
            else:
                severity = "info"
            issues.append({
                "type": "missing_values",
                "severity": severity,
                "column": col_name,
                "message": f"{col_name}: {col_stat['missingCount']:,} missing values ({miss_pct:.1f}%)"
            })

        # Constant column (only 1 unique value)
        if col_stat["unique"] == 1:
            issues.append({
                "type": "constant_column",
                "severity": "warning",
                "column": col_name,
                "message": f"{col_name}: constant value (only 1 unique)"
            })

        # High cardinality (>50% unique in categorical column)
        elif col_stat["dataType"] == "categorical" and col_stat["uniquePercent"] > 50:
            issues.append({
                "type": "high_cardinality",
                "severity": "info",
                "column": col_name,
                "message": f"{col_name}: high cardinality ({col_stat['unique']:,} unique values, {col_stat['uniquePercent']:.1f}%)"
            })

    return issues

# Main execution
try:
    # Get file path from command line (safe - no injection)
    file_path = sys.argv[1]
    node_id = "${nodeId}"

    emit("log", message=f"Loading {os.path.basename(file_path)}...")

    # Check file size to decide sampling strategy
    file_size = os.path.getsize(file_path)
    sampled = False

    if file_size > ${MAX_FILE_SIZE_BYTES}:
        # Large file: sample first N rows only
        emit("log", message=f"Large file ({file_size / 1024 / 1024:.1f} MB). Sampling first ${SAMPLE_ROWS.toLocaleString()} rows...")
        df = pd.read_csv(file_path, nrows=${SAMPLE_ROWS})
        sampled = True
    else:
        df = pd.read_csv(file_path)

    actual_rows = len(df)
    emit("log", message=f"Profiling {actual_rows:,} rows, {len(df.columns)} columns...")

    # Profile columns with progress
    columns_stats = []
    for i, col in enumerate(df.columns):
        emit("progress", current=i+1, total=len(df.columns))
        columns_stats.append(profile_column(df[col], col))

    # Quality issue detection
    issues = detect_quality_issues(df, columns_stats)

    # Convert preview rows to JSON-safe format
    preview_df = df.head(${previewRows})
    preview_records = []
    for _, row in preview_df.iterrows():
        record = {}
        for col in preview_df.columns:
            val = row[col]
            record[col] = safe_json(val)
        preview_records.append(record)

    # Build result
    profile = {
        "nodeId": node_id,
        "fileName": os.path.basename(file_path),
        "filePath": file_path,
        "rowCount": actual_rows,
        "columnCount": len(df.columns),
        "memorySizeBytes": int(df.memory_usage(deep=True).sum()),
        "sampled": sampled,
        "columns": columns_stats,
        "qualityIssues": issues,
        "preview": preview_records,
        "profiledAt": pd.Timestamp.now().isoformat()
    }

    emit("dataProfile", nodeId=node_id, data=profile)
    emit("complete")

except Exception as e:
    import traceback
    emit("error", message=f"Profiling failed: {str(e)}")
    emit("log", message=traceback.format_exc())
    sys.exit(1)
`;
}
