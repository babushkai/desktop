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
          top: 0,
          textStyle: {
            color: colors.textPrimary,
            fontSize: 14,
            fontWeight: 500,
          },
        }
      : undefined,
    tooltip: {
      trigger: "item",
      backgroundColor: colors.surface,
      borderColor: "rgba(255, 255, 255, 0.1)",
      borderWidth: 1,
      textStyle: {
        color: colors.textPrimary,
      },
      formatter: (params: { data: number[] }) => {
        const [shapValue, yPos, featValue] = params.data;
        const featureIdx = sortedIndices[Math.round(yPos)];
        const featureName = featureNames[featureIdx];
        return `<strong>${featureName}</strong><br/>
                SHAP: ${shapValue.toFixed(4)}<br/>
                Value: ${featValue.toFixed(4)}`;
      },
    },
    grid: {
      left: "15%",
      right: "12%",
      bottom: "10%",
      top: title ? 50 : 30,
      containLabel: true,
    },
    xAxis: {
      type: "value",
      name: "SHAP Value",
      nameLocation: "middle",
      nameGap: 30,
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
      data: sortedIndices.map((idx) => featureNames[idx]),
      inverse: true,
      axisLine: {
        lineStyle: { color: colors.textMuted },
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
        color: ["#3b82f6", "#f8fafc", "#ef4444"], // Blue → White → Red
      },
      text: ["High", "Low"],
      textStyle: {
        color: colors.textSecondary,
        fontSize: 10,
      },
      right: 10,
      top: "center",
      calculable: false,
      itemWidth: 10,
      itemHeight: 100,
    },
    series: [
      {
        type: "scatter",
        data: scatterData,
        symbolSize: 4,
        itemStyle: {
          opacity: 0.7,
        },
        emphasis: {
          itemStyle: {
            opacity: 1,
            shadowBlur: 5,
            shadowColor: "rgba(0, 0, 0, 0.3)",
          },
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
