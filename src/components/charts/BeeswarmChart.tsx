import ReactECharts from "echarts-for-react";
import { colors } from "@/lib/echartsTheme";
import {
  RegressionShapData,
  ClassificationShapData,
  isClassificationShapData,
} from "@/lib/explainTypes";

interface BeeswarmChartProps {
  data: RegressionShapData | ClassificationShapData;
  title?: string;
  selectedClass?: string;
  maxFeatures?: number;
}

export function BeeswarmChart({
  data,
  title,
  selectedClass,
  maxFeatures = 10,
}: BeeswarmChartProps) {
  const featureNames = data.featureNames;
  const featureValues = data.featureValues;

  // Get SHAP values based on data type
  let shapValuesForClass: number[][];
  if (isClassificationShapData(data)) {
    // Classification: [class][sample][feature]
    const classIndex = selectedClass
      ? data.classNames.indexOf(selectedClass)
      : 0;
    shapValuesForClass = data.shapValues[Math.max(0, classIndex)] || data.shapValues[0];
  } else {
    // Regression: [sample][feature]
    shapValuesForClass = data.shapValues;
  }

  // Calculate mean absolute SHAP per feature to rank importance
  const featureImportance = featureNames.map((_, featureIdx) => {
    const values = shapValuesForClass.map((sample) => Math.abs(sample[featureIdx]));
    return values.reduce((a, b) => a + b, 0) / values.length;
  });

  // Sort features by importance and take top N
  const sortedIndices = featureImportance
    .map((imp, idx) => ({ imp, idx }))
    .sort((a, b) => b.imp - a.imp)
    .slice(0, maxFeatures)
    .map((x) => x.idx);

  // Prepare scatter data: [shapValue, featureIndex, featureValue, sampleIndex]
  const scatterData: number[][] = [];

  sortedIndices.forEach((featureIdx, yPosition) => {
    shapValuesForClass.forEach((sample, sampleIdx) => {
      const shapValue = sample[featureIdx];
      const featureValue = featureValues[sampleIdx]?.[featureIdx] ?? 0;

      // Add jitter to y position for beeswarm effect
      const jitter = (Math.random() - 0.5) * 0.4;

      scatterData.push([
        shapValue,
        yPosition + jitter,
        featureValue,
        sampleIdx,
      ]);
    });
  });

  // Calculate min/max feature values for color scale
  const allFeatureValues = scatterData.map((d) => d[2]);
  const minFeatValue = Math.min(...allFeatureValues);
  const maxFeatValue = Math.max(...allFeatureValues);

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
      trigger: "item",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      textStyle: {
        color: colors.textPrimary,
        fontSize: 12,
      },
      extraCssText: "border-radius: 6px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);",
      formatter: (params: { data: number[] }) => {
        const [shapValue, yPos, featValue] = params.data;
        const featureIdx = sortedIndices[Math.round(yPos)];
        const featureName = featureNames[featureIdx];
        const shapColor = shapValue >= 0 ? colors.error : colors.accent;
        return `<strong>${featureName}</strong><br/>
                <span style="color:${colors.textSecondary}">SHAP:</span> <span style="color:${shapColor}">${shapValue.toFixed(4)}</span><br/>
                <span style="color:${colors.textSecondary}">Value:</span> ${featValue.toFixed(4)}`;
      },
    },
    grid: {
      left: "3%",
      right: "14%",
      bottom: "10%",
      top: title ? 45 : 25,
      containLabel: true,
    },
    xAxis: {
      type: "value",
      name: "SHAP Value",
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
      data: sortedIndices.map((idx) => featureNames[idx]),
      inverse: true,
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
    visualMap: {
      type: "continuous",
      min: minFeatValue,
      max: maxFeatValue,
      dimension: 2,
      inRange: {
        // GitHub-inspired color scale: Blue → neutral → Red
        color: [colors.accent, colors.textMuted, colors.error],
      },
      text: ["High", "Low"],
      textStyle: {
        color: colors.textMuted,
        fontSize: 10,
      },
      right: 8,
      top: "center",
      calculable: false,
      itemWidth: 12,
      itemHeight: 100,
    },
    series: [
      {
        type: "scatter",
        data: scatterData,
        symbolSize: 5,
        itemStyle: {
          opacity: 0.75,
        },
        emphasis: {
          itemStyle: {
            opacity: 1,
            shadowBlur: 8,
            shadowColor: "rgba(0, 0, 0, 0.4)",
          },
          scale: 1.5,
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
