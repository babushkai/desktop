import ReactECharts from "echarts-for-react";
import { colors } from "@/lib/echartsTheme";
import { FeatureImportanceData } from "@/lib/explainTypes";

interface FeatureImportanceChartProps {
  data: FeatureImportanceData;
  title?: string;
  maxFeatures?: number;
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

  // Determine color based on positive/negative
  const barColors = importanceValues.map((v) =>
    v >= 0 ? colors.accent : colors.error
  );

  const option = {
    backgroundColor: "transparent",
    title: title
      ? {
          text: title,
          left: "center",
          top: 0,
          textStyle: {
            color: colors.textPrimary,
            fontSize: 14,
            fontWeight: 500,
          },
        }
      : undefined,
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: colors.surface,
      borderColor: "rgba(255, 255, 255, 0.1)",
      borderWidth: 1,
      textStyle: {
        color: colors.textPrimary,
      },
      formatter: (params: { name: string; value: number; dataIndex: number }[]) => {
        const p = params[0];
        const std = errorBars[p.dataIndex];
        return `<strong>${p.name}</strong><br/>
                Importance: ${p.value.toFixed(4)}<br/>
                Std Dev: ${std.toFixed(4)}`;
      },
    },
    grid: {
      left: "25%",
      right: "10%",
      bottom: "10%",
      top: title ? 40 : 20,
      containLabel: true,
    },
    xAxis: {
      type: "value",
      name: "Permutation Importance",
      nameLocation: "middle",
      nameGap: 25,
      nameTextStyle: {
        color: colors.textSecondary,
        fontSize: 11,
      },
      axisLine: {
        lineStyle: { color: colors.textMuted },
      },
      axisLabel: {
        color: colors.textSecondary,
        fontSize: 10,
        formatter: (v: number) => v.toFixed(2),
      },
      splitLine: {
        lineStyle: { color: "rgba(255, 255, 255, 0.05)" },
      },
    },
    yAxis: {
      type: "category",
      data: featureNames,
      axisLine: {
        lineStyle: { color: colors.textMuted },
      },
      axisLabel: {
        color: colors.textSecondary,
        fontSize: 10,
        width: 120,
        overflow: "truncate",
      },
    },
    series: [
      {
        type: "bar",
        data: importanceValues.map((value, index) => ({
          value,
          itemStyle: {
            color: barColors[index],
            borderRadius: value >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4],
          },
        })),
        barWidth: "60%",
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
          },
          data: importanceValues.map((value, index) => [
            {
              xAxis: value - errorBars[index],
              yAxis: index,
            },
            {
              xAxis: value + errorBars[index],
              yAxis: index,
            },
          ]),
        },
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
