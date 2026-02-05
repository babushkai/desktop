import type { EChartsOption } from "echarts";

// GitHub Dark theme colors
export const colors = {
  background: "#0d1117",
  surface: "#161b22",
  elevated: "#21262d",
  border: "#30363d",
  // GitHub accent colors
  accent: "#58a6ff",      // Blue
  accentSecondary: "#3fb950", // Green
  // Text colors
  textPrimary: "#e6edf3",
  textSecondary: "#8b949e",
  textMuted: "#6e7681",
  // Status colors
  success: "#3fb950",
  error: "#f85149",
  warning: "#d29922",
  purple: "#a371f7",
  orange: "#db6d28",
  pink: "#db61a2",
};

// Chart color palette - GitHub's vibrant colors
export const chartColors = [
  "#58a6ff", // Blue
  "#3fb950", // Green
  "#a371f7", // Purple
  "#f0883e", // Orange
  "#db61a2", // Pink
  "#79c0ff", // Light blue
];

// Confusion matrix color scale
export const heatmapColors = [
  "#0d1117", // Low - dark bg
  "#1f6feb", // Medium - blue
  "#238636", // High - green
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
      fontSize: 13,
      fontWeight: 600,
    },
  },
  legend: {
    textStyle: {
      color: colors.textSecondary,
    },
  },
  tooltip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    textStyle: {
      color: colors.textPrimary,
      fontSize: 12,
    },
    extraCssText: "border-radius: 6px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);",
  },
  xAxis: {
    axisLine: {
      lineStyle: {
        color: colors.border,
      },
    },
    axisTick: {
      lineStyle: {
        color: colors.border,
      },
    },
    axisLabel: {
      color: colors.textSecondary,
      fontSize: 11,
    },
    splitLine: {
      lineStyle: {
        color: colors.border,
        opacity: 0.3,
      },
    },
  },
  yAxis: {
    axisLine: {
      lineStyle: {
        color: colors.border,
      },
    },
    axisTick: {
      lineStyle: {
        color: colors.border,
      },
    },
    axisLabel: {
      color: colors.textSecondary,
      fontSize: 11,
    },
    splitLine: {
      lineStyle: {
        color: colors.border,
        opacity: 0.3,
      },
    },
  },
  grid: {
    borderColor: colors.border,
  },
};
