import type { EChartsOption } from "echarts";

// Colors matching the app's dark theme from tailwind.config.js
export const colors = {
  background: "#0a0a0f",
  surface: "#0f172a",
  elevated: "#1e293b",
  accent: "#22d3ee",
  accentSecondary: "#14b8a6",
  textPrimary: "#f8fafc",
  textSecondary: "#94a3b8",
  textMuted: "#64748b",
  success: "#4ade80",
  error: "#f87171",
  warning: "#fbbf24",
};

// Chart color palette for bar charts
export const chartColors = [
  "#22d3ee", // accent
  "#14b8a6", // accent-secondary
  "#4ade80", // success
  "#a78bfa", // purple
  "#fb923c", // orange
];

// Confusion matrix color scale (blue to red through white)
export const heatmapColors = [
  "#1e293b", // Low - dark
  "#22d3ee", // Medium - accent
  "#4ade80", // High - success
];

export const echartsTheme: EChartsOption = {
  backgroundColor: "transparent",
  textStyle: {
    color: colors.textSecondary,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Roboto, sans-serif",
  },
  title: {
    textStyle: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: 500,
    },
  },
  legend: {
    textStyle: {
      color: colors.textSecondary,
    },
  },
  tooltip: {
    backgroundColor: colors.surface,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    textStyle: {
      color: colors.textPrimary,
    },
  },
  xAxis: {
    axisLine: {
      lineStyle: {
        color: colors.textMuted,
      },
    },
    axisTick: {
      lineStyle: {
        color: colors.textMuted,
      },
    },
    axisLabel: {
      color: colors.textSecondary,
    },
    splitLine: {
      lineStyle: {
        color: "rgba(255, 255, 255, 0.05)",
      },
    },
  },
  yAxis: {
    axisLine: {
      lineStyle: {
        color: colors.textMuted,
      },
    },
    axisTick: {
      lineStyle: {
        color: colors.textMuted,
      },
    },
    axisLabel: {
      color: colors.textSecondary,
    },
    splitLine: {
      lineStyle: {
        color: "rgba(255, 255, 255, 0.05)",
      },
    },
  },
  grid: {
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
};
