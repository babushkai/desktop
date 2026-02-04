import ReactECharts from "echarts-for-react";
import { colors } from "@/lib/echartsTheme";
import { FeatureImportanceData } from "@/lib/explainTypes";

interface FeatureImportanceChartProps {
  data: FeatureImportanceData;
  title?: string;
  maxFeatures?: number;
}

// Generate gradient for horizontal bars
function getBarGradient(color: string, isPositive: boolean) {
  return {
    type: "linear",
    x: isPositive ? 0 : 1,
    y: 0,
    x2: isPositive ? 1 : 0,
    y2: 0,
    colorStops: [
      { offset: 0, color: `${color}99` }, // 60% opacity at start
      { offset: 1, color: color },
    ],
  };
}

export function FeatureImportanceChart({
  data,
  title,
  maxFeatures = 15,
}: FeatureImportanceChartProps) {
  const { features, importances, stdDevs } = data;

  // Sort by absolute importance and take top N
  const indexed = features.map((f, i) => ({
    feature: f,
    importance: importances[i],
    std: stdDevs[i],
    absImp: Math.abs(importances[i]),
  }));

  indexed.sort((a, b) => b.absImp - a.absImp);
  const topFeatures = indexed.slice(0, maxFeatures);

  // Reverse for horizontal bar chart (bottom to top)
  topFeatures.reverse();

  const featureNames = topFeatures.map((f) => f.feature);
  const importanceValues = topFeatures.map((f) => f.importance);
  const errorBars = topFeatures.map((f) => f.std);

  const option = {
    backgroundColor: "transparent",
    title: title
      ? {
          text: title,
          left: "center",
          top: 4,
          textStyle: {
            color: colors.textPrimary,
            fontSize: 13,
            fontWeight: 600,
          },
        }
      : undefined,
    tooltip: {
      trigger: "axis",
      axisPointer: {
        type: "shadow",
        shadowStyle: {
          color: "rgba(88, 166, 255, 0.08)",
        },
      },
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      textStyle: {
        color: colors.textPrimary,
        fontSize: 12,
      },
      extraCssText: "border-radius: 6px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);",
      formatter: (params: { name: string; value: number; dataIndex: number }[]) => {
        const p = params[0];
        const std = errorBars[p.dataIndex];
        const valueColor = p.value >= 0 ? colors.accent : colors.error;
        return `<strong>${p.name}</strong><br/>
                <span style="color:${colors.textSecondary}">Importance:</span> <span style="color:${valueColor}">${p.value.toFixed(4)}</span><br/>
                <span style="color:${colors.textSecondary}">Std Dev:</span> <span style="color:${colors.textMuted}">±${std.toFixed(4)}</span>`;
      },
    },
    grid: {
      left: "3%",
      right: "8%",
      bottom: "10%",
      top: title ? 45 : 25,
      containLabel: true,
    },
    xAxis: {
      type: "value",
      name: "Permutation Importance",
      nameLocation: "middle",
      nameGap: 28,
      nameTextStyle: {
        color: colors.textSecondary,
        fontSize: 11,
        fontWeight: 500,
      },
      axisLine: {
        show: false,
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        color: colors.textMuted,
        fontSize: 10,
        formatter: (v: number) => v.toFixed(2),
      },
      splitLine: {
        lineStyle: {
          color: colors.border,
          opacity: 0.4,
          type: "dashed",
        },
      },
    },
    yAxis: {
      type: "category",
      data: featureNames,
      axisLine: {
        lineStyle: { color: colors.border },
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        color: colors.textSecondary,
        fontSize: 10,
        width: 100,
        overflow: "truncate",
      },
    },
    series: [
      {
        type: "bar",
        data: importanceValues.map((value) => {
          const isPositive = value >= 0;
          const color = isPositive ? colors.accent : colors.error;
          return {
            value,
            itemStyle: {
              color: getBarGradient(color, isPositive),
              borderRadius: isPositive ? [0, 4, 4, 0] : [4, 0, 0, 4],
            },
            emphasis: {
              itemStyle: {
                color: color,
                shadowBlur: 12,
                shadowColor: `${color}40`,
              },
            },
          };
        }),
        barWidth: "55%",
        label: {
          show: false,
        },
        // Error bar visualization using markLine
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: {
            color: colors.textMuted,
            width: 1,
            opacity: 0.6,
          },
          data: importanceValues.map((value, idx) => [
            {
              xAxis: value - errorBars[idx],
              yAxis: idx,
            },
            {
              xAxis: value + errorBars[idx],
              yAxis: idx,
            },
          ]),
        },
        animationDuration: 600,
        animationEasing: "cubicOut",
      },
    ],
  };

  return (
    <ReactECharts
      option={option}
      style={{ height: "100%", width: "100%" }}
      opts={{ renderer: "canvas" }}
    />
  );
}
